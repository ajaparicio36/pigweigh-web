from contextlib import ExitStack, asynccontextmanager, closing
from datetime import datetime, timedelta, timezone
import asyncio
import json
import math
import re
import secrets
from decimal import Decimal, ROUND_HALF_UP
from typing import Annotated, Literal
from collections.abc import Callable

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, ConfigDict, Field, StrictInt, field_validator
from sqlalchemy import select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool
from starlette.datastructures import UploadFile
from starlette.exceptions import HTTPException
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp, Receive, Scope, Send

from pigweigh.config import Settings
from pigweigh.db import Admin, LoginSession, PriceRecord, PriceState, make_engine
from pigweigh.money import MAX_BIGINT, format_price, parse_price, valuation
from pigweigh.inference import (CaptureRejected, InferenceEngine, InferenceUnavailable, METHOD,
                                SIDE_ANCHORS, SIDE_POINTS, TOP_ANCHORS, TOP_POINTS, UPLOAD_DIGEST_KEY)
from pigweigh.formula import FORMULA_DIVISOR
from pigweigh.security import COOKIE, PASSWORDS, LoginGuard, normalize_username, token_hash
from pigweigh.uploads import BODY_LIMIT, InvalidImage, capture_form, decode_image, upload_sha256

PHOTO_VALIDATION_PATHS = frozenset({"/api/photos/top/validate", "/api/photos/side/validate"})
CLOUD_UNAVAILABLE_MESSAGE = "Cloud inference is unavailable while hosted workflow verification is pending."


class APIError(Exception):
    def __init__(self, status: int, code: str, message: str, details: dict | None = None):
        self.status, self.code, self.message, self.details = status, code, message, details or {}


def error_response(status: int, code: str, message: str, details: dict | None = None) -> JSONResponse:
    return JSONResponse({"error": {"code": code, "message": message, "details": details or {}}},
                        status_code=status, headers={"Cache-Control": "no-store"})


ADJUSTMENT_LIMIT = 8192


def parse_adjustments(text: str) -> dict:
    """Strictly decode the bounded, versioned identity and editable point map."""
    def invalid():
        raise ValueError("Invalid landmark adjustments")
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                invalid()
            result[key] = value
        return result
    def bad_constant(_value):
        invalid()
    try:
        if len(text.encode("utf-8")) > ADJUSTMENT_LIMIT:
            invalid()
        value = json.loads(text, object_pairs_hook=unique, parse_constant=bad_constant)
        if not isinstance(value, dict) or set(value) != {"version", "bundle_id", "image_sha256", "overrides"}:
            invalid()
        if type(value["version"]) is not int or value["version"] != 1:
            invalid()
        bundle = value["bundle_id"]
        if not isinstance(bundle, str) or not re.fullmatch(r"[A-Za-z0-9._-]{1,128}", bundle):
            invalid()
        hashes, overrides = value["image_sha256"], value["overrides"]
        if not isinstance(hashes, dict) or set(hashes) != {"top", "side"}:
            invalid()
        if any(not isinstance(digest, str) or not re.fullmatch(r"[0-9a-f]{64}", digest) for digest in hashes.values()):
            invalid()
        if not isinstance(overrides, dict) or set(overrides) != {"top", "side"}:
            invalid()
        normalized = {}
        for view, allowed in (("top", TOP_ANCHORS), ("side", SIDE_ANCHORS)):
            points = overrides[view]
            if not isinstance(points, dict) or any(name not in allowed for name in points):
                invalid()
            normalized[view] = {}
            for name, point in points.items():
                if not isinstance(point, list) or len(point) != 2 or any(type(item) not in (int, float) for item in point):
                    invalid()
                numeric = [float(item) for item in point]
                if not all(math.isfinite(item) for item in numeric):
                    invalid()
                normalized[view][name] = numeric
        return {"version": 1, "bundle_id": bundle, "image_sha256": hashes, "overrides": normalized}
    except (ValueError, TypeError, OverflowError, RecursionError):
        raise APIError(422, "invalid_adjustments", "Check the landmark adjustment format and review the photos again.") from None


def verify_result_provenance(result: dict, hashes: dict[str, str], bundle_id: str,
                             adjustments: dict | None, diagnostics: bool) -> None:
    """Fail closed if a response drops or misstates the submitted review."""
    try:
        provenance = result["provenance"]
        if (type(provenance["version"]) is not int or provenance["version"] != 1
                or provenance["bundle_id"] != bundle_id or result["artifacts"]["bundle_id"] != bundle_id
                or provenance["method_version"] != METHOD or result["method"]["version"] != METHOD
                or provenance["image_sha256"] != hashes
                or provenance["configuration"] != {"formula_divisor": FORMULA_DIVISOR,
                    "marker_dictionary": "DICT_4X4_50", "marker_id": 0, "marker_side_mm": "100"}):
            raise ValueError
        landmarks = provenance["landmarks"]
        expected = {"top": {}, "side": {}}
        for view, names in (("top", TOP_POINTS), ("side", SIDE_POINTS)):
            if set(landmarks[view]) != set(names):
                raise ValueError
            edits = adjustments["overrides"][view] if adjustments is not None else {}
            for name, point in edits.items():
                detected = landmarks[view][name]["detected"]
                if detected != point:
                    expected[view][name] = point
                if landmarks[view][name]["used"] != point:
                    raise ValueError
        source = "manually_adjusted" if any(expected.values()) else "automatic"
        if provenance["source"] != source or provenance["overrides"] != expected:
            raise ValueError
        if (diagnostics or adjustments is not None) and not isinstance(result.get("diagnostics"), dict):
            raise ValueError
    except (KeyError, TypeError, ValueError):
        raise APIError(503, "review_provenance_unavailable", "The reviewed result could not be verified. Recheck the photos and try again.") from None


async def complete_cpu_work(work: Callable[[], dict]) -> dict:
    """Request cancellation must not release resources while its CPU thread runs."""
    task = asyncio.create_task(run_in_threadpool(work))
    cancelled = False
    while True:
        try:
            result = await asyncio.shield(task)
            break
        except asyncio.CancelledError:
            cancelled = True
            if task.cancelled():
                raise
        except Exception:
            if cancelled:
                raise asyncio.CancelledError() from None
            raise
    if cancelled:
        raise asyncio.CancelledError()
    return result


class RequestBoundary:
    def __init__(self, app: ASGIApp, origin: str):
        self.app, self.origin = app, origin
        self.upload_slots = asyncio.Semaphore(2)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        async def no_store(message):
            if message["type"] == "http.response.start":
                headers = [(k, v) for k, v in message["headers"] if k.lower() != b"cache-control"]
                message["headers"] = headers + [(b"cache-control", b"no-store")]
            await send(message)
        if scope["method"] not in {"POST", "PUT", "PATCH", "DELETE"}:
            await self.app(scope, receive, no_store)
            return
        headers = scope["headers"]
        origins = [v.decode("latin-1") for k, v in headers if k == b"origin"]
        if origins != [self.origin]:
            await error_response(403, "invalid_origin", "This request origin is not allowed.")(scope, receive, no_store)
            return
        is_upload = scope["path"] == "/api/estimates" or scope["path"] in PHOTO_VALIDATION_PATHS
        if is_upload and self.upload_slots.locked():
            await error_response(429, "upload_busy", "Uploads are busy. Try again shortly.")(scope, receive, no_store)
            return
        if is_upload:
            await self.upload_slots.acquire()
        try:
            limit = BODY_LIMIT if is_upload else 16 * 1024
            body = bytearray()
            while True:
                message = await receive()
                if message["type"] == "http.disconnect":
                    return
                body.extend(message.get("body", b""))
                if len(body) > limit:
                    await error_response(413, "request_too_large", "The request exceeds the allowed size.")(scope, receive, no_store)
                    return
                if not message.get("more_body", False):
                    break
            delivered = False
            async def replay():
                nonlocal delivered
                if not delivered:
                    delivered = True
                    return {"type": "http.request", "body": bytes(body), "more_body": False}
                return await receive()
            await self.app(scope, replay, no_store)
        finally:
            if is_upload:
                self.upload_slots.release()


class LoginInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=128)


class PriceInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    php_per_kg: str = Field(min_length=1, max_length=21)
    source_reference: str
    expected_revision: StrictInt = Field(ge=0, le=MAX_BIGINT - 1)

    @field_validator("php_per_kg")
    @classmethod
    def valid_price(cls, value: str) -> str:
        parse_price(value)
        return value

    @field_validator("source_reference")
    @classmethod
    def valid_source(cls, value: str) -> str:
        value = value.strip()
        if not 1 <= len(value) <= 500:
            raise ValueError("Source reference must contain 1-500 characters")
        return value


def price_json(price: PriceRecord | None) -> dict | None:
    if price is None:
        return None
    return {"id": str(price.id), "php_per_kg": format_price(price.amount_centavos),
            "source_reference": price.source_reference,
            "published_at": price.published_at.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")}


def create_app(settings: Settings | None = None) -> FastAPI:
    config = settings or Settings.from_env()
    engine = make_engine(config)
    guard = LoginGuard()
    inference = InferenceEngine(config.model_bundle)
    inference_slot = asyncio.Semaphore(1)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        await run_in_threadpool(inference.load)
        try:
            yield
        finally:
            inference.models.clear()
            engine.dispose()

    app = FastAPI(title="PigWeigh API", lifespan=lifespan)
    app.state.engine = engine
    app.state.login_guard = guard
    app.state.inference = inference
    app.state.inference_slot = inference_slot
    app.add_middleware(RequestBoundary, origin=config.public_origin)

    @app.exception_handler(APIError)
    async def api_error(request: Request, exc: APIError):
        return error_response(exc.status, exc.code, exc.message, exc.details)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        # Never echo submitted passwords or uploaded content from Pydantic errors.
        return error_response(422, "invalid_request", "Check the request fields and formats.")

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, exc: HTTPException):
        if request.url.path == "/api/estimates" and exc.status_code == 400:
            return error_response(422, "invalid_capture_pair", "Provide exactly one top image and one side image as valid multipart data.")
        if request.url.path in PHOTO_VALIDATION_PATHS and exc.status_code == 400:
            return error_response(422, "invalid_capture", "Provide exactly one image file as valid multipart data.")
        return error_response(exc.status_code, "invalid_request", "The request could not be processed.")

    @app.exception_handler(SQLAlchemyError)
    async def database_error(request: Request, exc: SQLAlchemyError):
        return error_response(503, "database_unavailable", "The service is temporarily unavailable.")

    @app.exception_handler(Exception)
    async def unexpected_error(request: Request, exc: Exception):
        return error_response(500, "internal_error", "The request could not be completed.")

    def db():
        with Session(engine) as session:
            yield session

    DB = Annotated[Session, Depends(db)]

    def current_admin(request: Request, session: DB) -> Admin:
        token = request.cookies.get(COOKIE, "")
        if not 1 <= len(token) <= 128:
            raise APIError(401, "authentication_required", "Sign in to continue.")
        result = session.execute(select(Admin).join(LoginSession, LoginSession.admin_id == Admin.id).where(
            LoginSession.token_hash == token_hash(token), LoginSession.revoked_at.is_(None),
            LoginSession.expires_at > datetime.now(timezone.utc), Admin.disabled.is_(False),
        )).scalar_one_or_none()
        if result is None:
            raise APIError(401, "authentication_required", "Sign in to continue.")
        return result

    ADMIN = Annotated[Admin, Depends(current_admin)]

    @app.get("/api/health")
    def health(session: DB):
        session.execute(text("SELECT 1"))
        return {"status": "ok"}

    @app.get("/api/inference/readiness")
    def readiness(provider: Literal["local", "cloud"] = "local"):
        if provider == "cloud":
            return {"ready": False, "blockers": [{"code": "cloud_inference_unavailable",
                                                   "message": CLOUD_UNAVAILABLE_MESSAGE}]}
        return inference.readiness()

    @app.get("/api/prices/current")
    def current_price(session: DB):
        state, price = session.execute(select(PriceState, PriceRecord).outerjoin(
            PriceRecord, PriceRecord.id == PriceState.current_id).where(PriceState.id == 1)).one()
        return {"revision": state.revision, "price": price_json(price)}

    @app.get("/api/prices/history")
    def price_history(session: DB):
        prices = session.scalars(select(PriceRecord)
                                 .order_by(PriceRecord.published_at.desc(), PriceRecord.id.desc()).limit(50))
        return {"prices": [price_json(price) for price in prices]}

    @app.post("/api/auth/login")
    def login(data: LoginInput, request: Request, response: Response, session: DB):
        if not guard.admit() or not guard.hash_slots.acquire(blocking=False):
            raise APIError(429, "login_rate_limited", "Too many sign-in attempts. Try again shortly.")
        try:
            try:
                username = normalize_username(data.username)
            except ValueError:
                username = ""
            admin = session.scalar(select(Admin).where(Admin.username == username))
            valid = PASSWORDS.verify(data.password, admin.password_hash if admin else guard.dummy_hash)
            if not valid or admin is None or admin.disabled:
                raise APIError(401, "invalid_credentials", "The username or password is incorrect.")
        finally:
            guard.hash_slots.release()
        old_token = request.cookies.get(COOKIE, "")
        if 1 <= len(old_token) <= 128:
            old = session.get(LoginSession, token_hash(old_token))
            if old:
                old.revoked_at = datetime.now(timezone.utc)
        token = secrets.token_urlsafe(32)
        session.add(LoginSession(token_hash=token_hash(token), admin_id=admin.id,
                                 expires_at=datetime.now(timezone.utc) + timedelta(hours=8)))
        session.commit()
        response.set_cookie(COOKIE, token, max_age=8 * 3600, httponly=True,
                            secure=config.secure_cookie, samesite="lax", path="/")
        return {"admin": {"id": str(admin.id), "username": admin.username}}

    @app.get("/api/auth/session")
    def auth_session(admin: ADMIN):
        return {"admin": {"id": str(admin.id), "username": admin.username}}

    @app.post("/api/auth/logout", status_code=204)
    def logout(request: Request, session: DB):
        token = request.cookies.get(COOKIE, "")
        if 1 <= len(token) <= 128:
            existing = session.get(LoginSession, token_hash(token))
            if existing:
                existing.revoked_at = datetime.now(timezone.utc)
                session.commit()
        response = Response(status_code=204)
        response.delete_cookie(COOKIE, path="/", httponly=True, secure=config.secure_cookie, samesite="lax")
        return response

    @app.post("/api/prices", status_code=201)
    def publish_price(data: PriceInput, session: DB, admin: ADMIN):
        state = session.scalar(select(PriceState).where(PriceState.id == 1).with_for_update())
        if state is None:
            raise APIError(503, "database_unavailable", "The pricing service is not initialized.")
        if state.revision != data.expected_revision:
            raise APIError(409, "stale_price_revision", "The current price changed. Review it and try again.")
        price = PriceRecord(amount_centavos=parse_price(data.php_per_kg), source_reference=data.source_reference,
                            publisher_id=admin.id, published_at=datetime.now(timezone.utc))
        session.add(price)
        session.flush()
        state.current_id = price.id
        state.revision += 1
        result = {"revision": state.revision, "price": price_json(price)}
        session.commit()
        return result

    @app.post("/api/photos/{view}/validate")
    async def validate_photo(view: Literal["top", "side"], request: Request, diagnostics: bool = False,
                             preview: bool = False, guided: bool = False, provider: Literal["local", "cloud"] = "local"):
        if request.headers.get("content-type", "").split(";", 1)[0].strip().lower() != "multipart/form-data":
            raise APIError(415, "unsupported_content_type", "Submit the image as multipart form data.")
        if provider == "cloud":
            raise APIError(503, "cloud_inference_unavailable", CLOUD_UNAVAILABLE_MESSAGE)
        if inference_slot.locked():
            raise APIError(429, "inference_busy", "Photo inference is already running. Try again shortly.")
        await inference_slot.acquire()
        try:
            async with capture_form(request, max_files=1) as form:
                items = list(form.multi_items())
                if len(items) != 1 or items[0][0] != "image" or not isinstance(items[0][1], UploadFile):
                    raise APIError(422, "invalid_capture", "Provide exactly one image file.")
                upload = items[0][1]
                def compute():
                    try:
                        digest = upload_sha256(upload)
                        image = decode_image(upload)
                        image.info[UPLOAD_DIGEST_KEY] = digest
                    except InvalidImage as exc:
                        raise APIError(exc.status, exc.code, exc.message, {"view": view}) from None
                    # Both decoded image and spool outlive any cancelled CPU work.
                    with closing(image):
                        if preview:
                            return inference.preview_photo(view, image)
                        if diagnostics or (guided and view == "top"):
                            result = inference.validate_photo(view, image, include_diagnostics=True)
                            if guided and view == "top":
                                left, top, right, bottom = result["diagnostics"]["bounding_box"]
                                area = (right - left) * (bottom - top) / (image.width * image.height)
                                if area < 0.38:
                                    raise CaptureRejected("top_framing_small",
                                        "Move closer while keeping the whole pig in frame.", view)
                            if not diagnostics:
                                result.pop("diagnostics")
                            return result
                        return inference.validate_photo(view, image)
                try:
                    return await complete_cpu_work(compute)
                except CaptureRejected as exc:
                    raise APIError(422, exc.code, exc.message, {"view": exc.view}) from None
                except InferenceUnavailable:
                    raise APIError(503, "inference_unavailable", "Photo validation requires a verified local model bundle and marker configuration.") from None
        finally:
            inference_slot.release()

    @app.post("/api/estimates")
    async def estimate(request: Request, diagnostics: bool = False, provider: Literal["local", "cloud"] = "local"):
        if request.headers.get("content-type", "").split(";", 1)[0].strip().lower() != "multipart/form-data":
            raise APIError(415, "unsupported_content_type", "Submit the two images as multipart form data.")
        if provider == "cloud":
            raise APIError(503, "cloud_inference_unavailable", CLOUD_UNAVAILABLE_MESSAGE)
        if inference_slot.locked():
            raise APIError(429, "inference_busy", "An estimate is already running. Try again shortly.")
        await inference_slot.acquire()
        try:
            async with capture_form(request, max_fields=1, max_part_size=ADJUSTMENT_LIMIT) as form:
                items = list(form.multi_items())
                names = [key for key, _ in items]
                if (len(items) not in (2, 3) or names.count("top_image") != 1 or names.count("side_image") != 1
                        or any(name not in {"top_image", "side_image", "adjustments"} for name in names)
                        or names.count("adjustments") > 1):
                    raise APIError(422, "invalid_capture_pair", "Provide one top image, one side image, and optional adjustments.")
                fields = dict(items)
                if any(not isinstance(fields[name], UploadFile) for name in ("top_image", "side_image")):
                    raise APIError(422, "invalid_capture_pair", "Each view must be an image file.")
                adjustment_text = fields.get("adjustments")
                if adjustment_text is not None and not isinstance(adjustment_text, str):
                    raise APIError(422, "invalid_adjustments", "Adjustments must be a JSON text field.")
                adjustments = parse_adjustments(adjustment_text) if adjustment_text is not None else None
                def compute():
                    # The worker owns decoded buffers through its entire lifetime.
                    with ExitStack() as images_owner:
                        images, hashes = {}, {}
                        for view in ("top", "side"):
                            upload = fields[f"{view}_image"]
                            try:
                                hashes[view] = upload_sha256(upload)
                                decoded = decode_image(upload)
                                images_owner.callback(decoded.close)
                                decoded.info[UPLOAD_DIGEST_KEY] = hashes[view]
                                images[view] = decoded
                            except InvalidImage as exc:
                                raise APIError(exc.status, exc.code, exc.message, {"view":f"{view}_image"}) from None
                        if adjustments is not None:
                            if not inference.readiness()["ready"]:
                                raise InferenceUnavailable()
                            if adjustments["bundle_id"] != inference.bundle_id:
                                raise APIError(409, "stale_review", "The model changed. Recheck both photos and review the points again.", {"reason":"bundle_changed"})
                            for view in ("top", "side"):
                                if adjustments["image_sha256"][view] != hashes[view]:
                                    raise APIError(409, "stale_review", "A photo changed. Recheck both photos and review the points again.", {"reason":"image_changed", "view":view})
                        if diagnostics or adjustments is not None:
                            result = inference.estimate(images, include_diagnostics=diagnostics, adjustments=adjustments)
                        else:
                            result = inference.estimate(images)
                        verify_result_provenance(result, hashes, inference.bundle_id, adjustments, diagnostics)
                        return result
                try:
                    result = await complete_cpu_work(compute)
                except CaptureRejected as exc:
                    raise APIError(422, exc.code, exc.message, {"view": exc.view}) from None
                except InferenceUnavailable:
                    raise APIError(503, "inference_unavailable", "Estimation requires a verified local model bundle and marker configuration.") from None
            # Keep the original photo measurements for audit and apply the fixed pilot factors.
            raw = result["measurements"]
            length = Decimal(raw["body_length_cm"]) * Decimal("1.26")
            girth = Decimal(raw["girth_cm"]) * Decimal("1.1137635905676664")
            result["uncorrected"] = {"measurements": raw, "estimated_weight_kg": result["estimated_weight_kg"]}
            result["measurements"] = {**raw, "body_length_cm": str(length.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
                                      "girth_cm": str(girth.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))}
            result["estimated_weight_kg"] = str((girth ** 2 * length / Decimal(FORMULA_DIVISOR)).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP))
            result["method"]["correction"] = {"version": "pilot-v1", "length_factor": "1.26",
                                                "girth_factor": "1.1137635905676664"}
            # This short read occurs only after CPU inference; no DB transaction spans it.
            def priced_result():
                with Session(engine) as session:
                    state, price = session.execute(select(PriceState, PriceRecord).outerjoin(
                        PriceRecord, PriceRecord.id == PriceState.current_id).where(PriceState.id == 1)).one()
                    snapshot = price_json(price)
                result["valuation"] = valuation(Decimal(result["estimated_weight_kg"]), snapshot)
                if snapshot is None:
                    result["valuation_unavailable_reason"] = "no_price"
                return result
            return await run_in_threadpool(priced_result)
        finally:
            inference_slot.release()

    return app
