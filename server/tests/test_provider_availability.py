"""Provider selection preserves local inference and fails closed for cloud."""
import socket

from fastapi.testclient import TestClient
import pytest

from pigweigh.uploads import BODY_LIMIT
from test_inference import create_app_for_test, fake_bundle
from test_landmark_review import NoPriceSession, png_bytes

ORIGIN = "http://localhost:3000"
CLOUD_MESSAGE = "Cloud inference is unavailable while hosted workflow verification is pending."


@pytest.fixture
def provider_client(fake_bundle, monkeypatch):
    path, _ = fake_bundle
    monkeypatch.setattr("pigweigh.main.Session", NoPriceSession)
    app = create_app_for_test(path)
    with TestClient(app, raise_server_exceptions=False) as client:
        yield client, app


def image(data):
    return {"image": ("top.png", data, "image/png")}


def pair(data):
    return {"top_image": ("top.png", data, "image/png"), "side_image": ("side.png", data, "image/png")}


def test_local_default_and_explicit_provider_have_identical_results(provider_client):
    client, _ = provider_client
    data = png_bytes()
    default_readiness = client.get("/api/inference/readiness")
    explicit_readiness = client.get("/api/inference/readiness?provider=local")
    assert default_readiness.status_code == explicit_readiness.status_code == 200
    assert default_readiness.json() == explicit_readiness.json() == {"ready": True, "blockers": []}

    for suffix in ("", "diagnostics=true", "preview=true"):
        separator = "?" if not suffix else f"?{suffix}&"
        for view in ("top", "side"):
            base = f"/api/photos/{view}/validate"
            default = client.post(base + (f"?{suffix}" if suffix else ""), headers={"Origin": ORIGIN}, files=image(data))
            explicit = client.post(base + separator + "provider=local", headers={"Origin": ORIGIN}, files=image(data))
            assert default.status_code == explicit.status_code == 200
            assert default.json() == explicit.json()

    default = client.post("/api/estimates?diagnostics=true", headers={"Origin": ORIGIN}, files=pair(data))
    explicit = client.post("/api/estimates?diagnostics=true&provider=local", headers={"Origin": ORIGIN}, files=pair(data))
    assert default.status_code == explicit.status_code == 200
    assert default.json() == explicit.json()
    assert explicit.json()["valuation"] is None


def test_cloud_is_unavailable_without_local_compute_database_or_network(provider_client, monkeypatch):
    client, app = provider_client

    def forbidden(*args, **kwargs):
        pytest.fail("Cloud availability must not run local inference, access the database, parse images, or use the network")

    for method in ("readiness", "validate_photo", "preview_photo", "estimate"):
        monkeypatch.setattr(app.state.inference, method, forbidden)
    monkeypatch.setattr("pigweigh.main.Session", forbidden)
    monkeypatch.setattr("pigweigh.main.capture_form", forbidden)
    monkeypatch.setattr(socket.socket, "connect", forbidden)

    readiness = client.get("/api/inference/readiness?provider=cloud")
    assert readiness.status_code == 200
    assert readiness.json() == {"ready": False, "blockers": [
        {"code": "cloud_inference_unavailable", "message": CLOUD_MESSAGE}
    ]}
    assert readiness.headers["cache-control"] == "no-store"

    requests = [
        ("/api/photos/top/validate?provider=cloud", image(b"not decoded")),
        ("/api/photos/side/validate?provider=cloud&diagnostics=true", image(b"not decoded")),
        ("/api/photos/top/validate?provider=cloud&preview=true", image(b"not decoded")),
        ("/api/estimates?provider=cloud&diagnostics=true", pair(b"not decoded")),
    ]
    for path, files in requests:
        response = client.post(path, headers={"Origin": ORIGIN}, files=files)
        assert response.status_code == 503
        assert response.json() == {"error": {"code": "cloud_inference_unavailable", "message": CLOUD_MESSAGE, "details": {}}}
        assert response.headers["cache-control"] == "no-store"
        assert not app.state.inference_slot.locked()


@pytest.mark.parametrize("path,files", [
    ("/api/photos/top/validate?provider=unknown", image(b"data")),
    ("/api/estimates?provider=unknown", pair(b"data")),
])
def test_unknown_provider_uses_sanitized_validation_error(provider_client, path, files):
    client, _ = provider_client
    response = client.post(path, headers={"Origin": ORIGIN}, files=files)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_request"
    assert "data" not in response.text
    assert client.get("/api/inference/readiness?provider=unknown").json()["error"]["code"] == "invalid_request"


def test_cloud_preserves_origin_content_type_and_upload_size_boundaries(provider_client):
    client, _ = provider_client
    path = "/api/photos/top/validate?provider=cloud"
    assert client.post(path, headers={"Origin": "http://other.example"}, files=image(b"data")).status_code == 403
    invalid_type = client.post(path, headers={"Origin": ORIGIN}, json={})
    assert invalid_type.status_code == 415
    assert invalid_type.json()["error"]["code"] == "unsupported_content_type"
    oversized = client.post(path, headers={"Origin": ORIGIN, "Content-Type": "multipart/form-data; boundary=test"},
                            content=b"x" * (BODY_LIMIT + 1))
    assert oversized.status_code == 413
    assert oversized.json()["error"]["code"] == "request_too_large"
