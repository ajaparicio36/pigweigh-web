from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
import asyncio
import secrets
from typing import Annotated

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
from pigweigh.money import MAX_BIGINT, format_price, parse_price
from pigweigh.security import COOKIE, PASSWORDS, LoginGuard, normalize_username, token_hash
from pigweigh.uploads import BODY_LIMIT, InvalidImage, capture_form, validate_image


class APIError(Exception):
    def __init__(self, status: int, code: str, message: str, details: dict | None = None):
        self.status, self.code, self.message, self.details = status, code, message, details or {}


def error_response(status: int, code: str, message: str, details: dict | None = None) -> JSONResponse:
    return JSONResponse({"error": {"code": code, "message": message, "details": details or {}}},
                        status_code=status, headers={"Cache-Control": "no-store"})


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
        is_upload = scope["path"] == "/api/estimates"
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

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        yield
        engine.dispose()

    app = FastAPI(title="PigWeigh API", lifespan=lifespan)
    app.state.engine = engine
    app.state.login_guard = guard
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
    def readiness():
        return {"ready": False, "blockers": [
            {"code": "serving_landmark_contract_missing", "message": "Serving pose checkpoints must declare the reviewed landmark order."},
            {"code": "pose_artifacts_missing", "message": "Compatible top and side pose models are required."},
            {"code": "capture_geometry_missing", "message": "ArUco size, dictionary and photo-to-centimeter geometry are not configured."},
            {"code": "measurement_pipeline_missing", "message": "The landmark and marker measurement pipeline is not implemented."},
        ]}

    @app.get("/api/prices/current")
    def current_price(session: DB):
        state, price = session.execute(select(PriceState, PriceRecord).outerjoin(
            PriceRecord, PriceRecord.id == PriceState.current_id).where(PriceState.id == 1)).one()
        return {"revision": state.revision, "price": price_json(price)}

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

    @app.post("/api/estimates")
    async def estimate(request: Request):
        if request.headers.get("content-type", "").split(";", 1)[0].strip().lower() != "multipart/form-data":
            raise APIError(415, "unsupported_content_type", "Submit the two images as multipart form data.")
        async with capture_form(request) as form:
            items = list(form.multi_items())
            if len(items) != 2 or {key for key, _ in items} != {"top_image", "side_image"}:
                raise APIError(422, "invalid_capture_pair", "Provide exactly one top image and one side image.")
            for view, upload in items:
                if not isinstance(upload, UploadFile):
                    raise APIError(422, "invalid_capture_pair", "Each view must be an image file.")
                try:
                    await run_in_threadpool(validate_image, upload)
                except InvalidImage as exc:
                    raise APIError(exc.status, exc.code, exc.message, {"view": view}) from None
        raise APIError(503, "inference_unavailable", "Estimation awaits compatible pose models, marker geometry and photo measurements.")

    return app
