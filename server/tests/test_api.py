from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from io import BytesIO
import threading

from fastapi.testclient import TestClient
from PIL import Image
import pytest
from sqlalchemy import func, select, text, update
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session
from starlette.datastructures import UploadFile

from pigweigh.config import Settings, database_url
from pigweigh.db import Admin, LoginSession, PriceRecord
from pigweigh.main import create_app
from pigweigh.money import MAX_BIGINT, parse_price, valuation
from pigweigh.security import COOKIE, PASSWORDS, token_hash
from pigweigh.uploads import validate_image
from conftest import ORIGIN, PASSWORD, login


def picture(fmt="JPEG", *, orientation=None):
    out = BytesIO()
    image = Image.new("RGB", (12, 8), "red")
    if orientation:
        exif = image.getexif()
        exif[274] = orientation
        image.save(out, format=fmt, exif=exif)
    else:
        image.save(out, format=fmt)
    image.close()
    return out.getvalue()


def pair(**extra):
    return {"top_image": ("top.jpg", picture(), "image/jpeg"),
            "side_image": ("side.png", picture("PNG"), "image/png"), **extra}


def publish(client, price="210.50", revision=0):
    return client.post("/api/prices", headers={"Origin": ORIGIN}, json={
        "php_per_kg": price, "source_reference": "  DA reference 2026  ", "expected_revision": revision})


def test_public_routes_and_origin_and_authorization(client):
    assert client.get("/api/health").json() == {"status": "ok"}
    ready = client.get("/api/inference/readiness")
    assert ready.json()["ready"] is False and ready.json()["blockers"][0]["code"] == "model_bundle_missing"
    assert ready.headers["cache-control"] == "no-store"
    assert client.get("/api/prices/current").json() == {"revision": 0, "price": None}
    assert client.get("/api/auth/session").status_code == 401
    assert publish(client).status_code == 401
    for origin in (None, "null", "https://elsewhere.example", ORIGIN + "/"):
        headers = {} if origin is None else {"Origin": origin}
        for route in ("/api/auth/login", "/api/auth/logout", "/api/prices", "/api/estimates"):
            response = client.post(route, headers=headers, json={})
            assert response.status_code == 403
            assert response.json()["error"]["code"] == "invalid_origin"


def test_login_parity_rotation_logout(client, engine):
    payload = {"username": "admin", "password": "wrong"}
    wrong = client.post("/api/auth/login", headers={"Origin": ORIGIN}, json=payload)
    payload["username"] = "nonexistent"
    absent = client.post("/api/auth/login", headers={"Origin": ORIGIN}, json=payload)
    assert wrong.status_code == absent.status_code == 401
    assert wrong.json() == absent.json()
    result = login(client)
    assert result.json() == {"admin": {"id": "1", "username": "admin"}}
    assert "HttpOnly" in result.headers["set-cookie"] and "SameSite=lax" in result.headers["set-cookie"]
    assert "Max-Age=28800" in result.headers["set-cookie"]
    old = client.cookies[COOKIE]
    with Session(engine) as db:
        row = db.get(LoginSession, token_hash(old))
        assert row is not None and row.token_hash != old
        admin = db.get(Admin, 1)
        assert admin.password_hash.startswith("$argon2id$") and PASSWORDS.verify(PASSWORD, admin.password_hash)
    login(client)
    new = client.cookies[COOKIE]
    assert old != new
    with Session(engine) as db:
        assert db.get(LoginSession, token_hash(old)).revoked_at is not None
    assert client.get("/api/auth/session").status_code == 200
    assert client.post("/api/auth/logout", headers={"Origin": ORIGIN}).status_code == 204
    assert client.get("/api/auth/session").status_code == 401
    with Session(engine) as db:
        assert db.get(LoginSession, token_hash(new)).revoked_at is not None


@pytest.mark.parametrize("state", ["expired", "disabled"])
def test_session_expiry_disabled(client, engine, state):
    login(client)
    with Session(engine) as db:
        if state == "expired":
            db.execute(update(LoginSession).values(expires_at=datetime.now(timezone.utc) - timedelta(seconds=1)))
        else:
            db.execute(update(Admin).values(disabled=True))
        db.commit()
    assert client.get("/api/auth/session").status_code == 401
    if state == "disabled":
        response = client.post("/api/auth/login", headers={"Origin": ORIGIN},
                               json={"username": "admin", "password": PASSWORD})
        assert response.status_code == 401


def test_login_limits_and_safe_validation(client, app):
    response = client.post("/api/auth/login", headers={"Origin": ORIGIN}, json={"username": "admin", "password": "x" * 129})
    assert response.status_code == 422 and "x" * 129 not in response.text
    with app.state.login_guard.lock:
        import time
        app.state.login_guard.attempts.extend([time.monotonic()] * 20)
    assert client.post("/api/auth/login", headers={"Origin": ORIGIN},
                       json={"username": "admin", "password": PASSWORD}).status_code == 429


def test_price_snapshot_rounding_and_immutable_record(client, engine):
    login(client)
    first = publish(client)
    assert first.status_code == 201, first.text
    snapshot = first.json()
    assert snapshot["revision"] == 1 and snapshot["price"]["id"] == "1"
    assert snapshot["price"]["source_reference"] == "DA reference 2026"
    assert snapshot["price"]["published_at"].endswith("Z")
    assert client.get("/api/prices/current").json() == snapshot
    assert valuation(Decimal("28.40"), snapshot["price"])["amount_php"] == "5978.20"
    assert valuation(Decimal("0.005"), {**snapshot["price"], "php_per_kg": "1.00"})["amount_php"] == "0.01"
    assert valuation(Decimal("28.40"), None) is None
    assert publish(client, revision=0).status_code == 409
    assert publish(client, "200.00", 1).status_code == 201
    assert snapshot["price"]["php_per_kg"] == "210.50"
    assert client.get("/api/prices/current").json()["price"]["php_per_kg"] == "200.00"
    with Session(engine) as db:
        assert db.scalar(select(func.count()).select_from(PriceRecord)) == 2
    with engine.begin() as conn:
        with pytest.raises(DBAPIError):
            conn.execute(text("UPDATE price_record SET amount_centavos=1 WHERE id=1"))


def test_price_concurrent_revision(app, client, engine):
    login(client)
    cookie = client.cookies[COOKIE]
    barrier = threading.Barrier(2)
    def contender(price):
        with TestClient(app, raise_server_exceptions=False) as other:
            other.cookies.set(COOKIE, cookie)
            barrier.wait(timeout=5)
            return publish(other, price).status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(contender, ["200.00", "220.00"]))
    assert sorted(outcomes) == [201, 409]
    with Session(engine) as db:
        assert db.scalar(select(func.count()).select_from(PriceRecord)) == 1


@pytest.mark.parametrize("value", ["0", "-1", "NaN", "Infinity", "1e2", "1.001", " 1", "92233720368547758.08"])
def test_price_rejects_invalid(client, value):
    login(client)
    assert publish(client, value).status_code == 422


def test_price_bigint_max(client):
    login(client)
    value = "92233720368547758.07"
    assert parse_price(value) == MAX_BIGINT
    assert publish(client, value).json()["price"]["php_per_kg"] == value


def test_valid_upload_unavailable_and_cleanup(client, monkeypatch):
    closed = []
    original = UploadFile.close
    async def track(self):
        await original(self)
        closed.append(self.file.closed)
    monkeypatch.setattr(UploadFile, "close", track)
    result = client.post("/api/estimates", headers={"Origin": ORIGIN}, files=pair())
    assert result.status_code == 503 and result.json()["error"]["code"] == "inference_unavailable"
    assert len(closed) == 2 and all(closed)
    assert "estimated_weight_kg" not in result.text and "confidence" not in result.text


def test_pair_and_format_failures(client):
    headers = {"Origin": ORIGIN}
    assert client.post("/api/estimates", headers=headers, json={}).status_code == 415
    assert client.post("/api/estimates", headers=headers, files={"top_image": ("x.jpg", picture())}).status_code == 422
    assert client.post("/api/estimates", headers=headers, files={"unknown": ("x.jpg", picture()), "side_image": ("x.jpg", picture())}).status_code == 422
    assert client.post("/api/estimates", headers=headers, files=pair(extra=("x.jpg", picture()))).status_code == 422
    result = client.post("/api/estimates", headers=headers, files=pair(top_image=("fake.jpg", b"not an image", "image/jpeg")))
    assert result.status_code == 415 and result.json()["error"]["details"] == {"view": "top_image"}
    assert client.post("/api/estimates", headers=headers, files=pair(top_image=("x.gif", picture("GIF")))).status_code == 415


def test_size_animation_and_spooled_cleanup(client, monkeypatch):
    headers = {"Origin": ORIGIN}
    closed = []
    original = UploadFile.close
    async def track(self):
        await original(self)
        closed.append(self.file.closed)
    monkeypatch.setattr(UploadFile, "close", track)
    assert client.post("/api/estimates", headers=headers, files=pair(top_image=("x.jpg", b"x" * (10*1024*1024+1)))).status_code == 413
    assert len(closed) == 2 and all(closed)
    assert client.post("/api/estimates", headers=headers, content=b"x" * (21*1024*1024+1)).status_code == 413
    frames = [Image.new("RGB", (8,8), color) for color in ("red", "blue")]
    out = BytesIO()
    frames[0].save(out, format="PNG", save_all=True, append_images=frames[1:])
    for frame in frames:
        frame.close()
    result = client.post("/api/estimates", headers=headers, files=pair(top_image=("x.png", out.getvalue())))
    assert result.status_code == 422 and result.json()["error"]["code"] == "animated_image"


def test_exif_normalization_and_decoded_pixel_limit(client, monkeypatch):
    from pigweigh import uploads
    sizes = []
    original = uploads.ImageOps.exif_transpose
    def capture(image):
        oriented = original(image)
        sizes.append(oriented.size)
        return oriented
    monkeypatch.setattr(uploads.ImageOps, "exif_transpose", capture)
    upload = UploadFile(BytesIO(picture(orientation=6)))
    validate_image(upload)
    assert sizes == [(8,12)]
    upload.file.close()
    monkeypatch.setattr(uploads, "PIXEL_LIMIT", 50)
    response = client.post("/api/estimates", headers={"Origin": ORIGIN}, files=pair())
    assert response.status_code == 413


def test_configuration_url_and_https_cookie(settings, engine, app):
    url = database_url("postgres://user:p%40ss@localhost:9999/db?sslmode=require")
    assert url.drivername == "postgresql+psycopg" and url.password == "p@ss"
    assert url.query["sslmode"] == "require"
    with pytest.raises(ValueError):
        database_url("sqlite:///bad.db")
    app = create_app(Settings(settings.database, "https://pigweigh.example"))
    with TestClient(app, base_url="https://pigweigh.example") as client:
        response = client.post("/api/auth/login", headers={"Origin":"https://pigweigh.example"},
                               json={"username":"admin","password":PASSWORD})
        assert response.status_code == 200
        assert "; Secure" in response.headers["set-cookie"]
