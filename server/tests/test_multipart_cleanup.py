"""Multipart EOF regressions; no PostgreSQL connection or test database needed."""
from io import BytesIO

from fastapi.testclient import TestClient
from PIL import Image
import pytest
import starlette.formparsers as formparsers

from pigweigh.config import Settings, database_url
from pigweigh.main import create_app

ORIGIN = "http://localhost:3000"


def image_bytes() -> bytes:
    output = BytesIO()
    with Image.new("RGB", (8, 8), "red") as image:
        image.save(output, format="PNG")
    return output.getvalue()


def part(name: str, content: bytes) -> bytes:
    return (f'--abc\r\nContent-Disposition: form-data; name="{name}"; filename="{name}.png"\r\n'
            'Content-Type: image/png\r\n\r\n').encode() + content


@pytest.fixture
def upload_client(monkeypatch):
    created = []
    original = formparsers.SpooledTemporaryFile
    def track(*args, **kwargs):
        file = original(*args, **kwargs)
        created.append(file)
        return file
    monkeypatch.setattr(formparsers, "SpooledTemporaryFile", track)
    app = create_app(Settings(database_url("postgresql://unused@127.0.0.1:1/unused"), ORIGIN))
    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            yield client, created
    finally:
        # A failing regression must itself leave no open reproduction resources.
        for file in created:
            file.close()


def send(client, body):
    return client.post("/api/estimates", headers={"Origin": ORIGIN,
        "Content-Type": "multipart/form-data; boundary=abc"}, content=body)


def test_truncated_second_file_closes_rolled_spool(upload_client):
    client, created = upload_client
    body = part("top_image", image_bytes()) + b"\r\n" + part("side_image", b"x" * (1024 * 1024 + 1))
    response = send(client, body)
    assert response.status_code == 422
    assert len(created) == 2 and created[1]._rolled
    assert all(file.closed for file in created)


def test_two_finalized_files_without_final_boundary_rejected(upload_client):
    client, created = upload_client
    # Starting the next delimiter finalizes the second file, without ending the multipart body.
    body = part("top_image", image_bytes()) + b"\r\n" + part("side_image", image_bytes()) + b"\r\n--abc\r\n"
    response = send(client, body)
    assert response.status_code == 422
    assert len(created) == 2 and all(file.closed for file in created)


def test_complete_pair_still_unavailable_and_closes(upload_client):
    client, created = upload_client
    response = send(client, part("top_image", image_bytes()) + b"\r\n" + part("side_image", image_bytes()) + b"\r\n--abc--\r\n")
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "inference_unavailable"
    assert response.json()["error"]["message"] == (
        "Estimation requires a verified local model bundle and marker configuration.")
    assert "estimated_weight_kg" not in response.text and "confidence" not in response.text
    assert len(created) == 2 and all(file.closed for file in created)


def test_readiness_reports_real_photo_pipeline_gaps_without_regression_gate(upload_client):
    client, _ = upload_client
    response = client.get("/api/inference/readiness")
    assert response.status_code == 200
    data = response.json()
    assert data["ready"] is False
    assert {blocker["code"] for blocker in data["blockers"]} == {"model_bundle_missing"}
    assert "weight_calibration_missing" not in response.text
    assert response.headers["cache-control"] == "no-store"


@pytest.mark.parametrize("case, status, expected_spools", [
    ("missing", 422, 1), ("unknown", 422, 2), ("duplicate", 422, 2),
    ("extra_file", 422, 2), ("extra_field", 422, 2),
    ("invalid_image", 415, 2), ("oversized_file", 413, 2), ("animation", 422, 2),
])
def test_other_upload_exit_paths_close_all_spools(upload_client, case, status, expected_spools):
    client, created = upload_client
    top = image_bytes()
    if case == "invalid_image":
        top = b"undecodable"
    elif case == "oversized_file":
        top = b"x" * (10 * 1024 * 1024 + 1)
    elif case == "animation":
        out = BytesIO()
        with Image.new("RGB", (8,8), "red") as first, Image.new("RGB", (8,8), "blue") as second:
            first.save(out, format="PNG", save_all=True, append_images=[second])
        top = out.getvalue()
    first_name = "unknown" if case == "unknown" else "top_image"
    second_name = "top_image" if case == "duplicate" else "side_image"
    body = part(first_name, top)
    if case != "missing":
        body += b"\r\n" + part(second_name, image_bytes())
    if case == "extra_file":
        body += b"\r\n" + part("extra", image_bytes())
    elif case == "extra_field":
        body += b'\r\n--abc\r\nContent-Disposition: form-data; name="extra"\r\n\r\nvalue'
    response = send(client, body + b"\r\n--abc--\r\n")
    assert response.status_code == status
    assert len(created) == expected_spools and all(file.closed for file in created)
