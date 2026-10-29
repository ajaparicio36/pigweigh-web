"""Stateless photo preflight uses the actual shared capture gates, never a DB."""
import asyncio
from io import BytesIO
import json
import os
from pathlib import Path
import threading

from fastapi.testclient import TestClient
import httpx
import numpy as np
from PIL import Image
import pytest
from starlette.requests import Request
import starlette.formparsers as formparsers

from pigweigh.inference import CaptureRejected, TOP_POINTS, SIDE_POINTS
from pigweigh.main import APIError, RequestBoundary
from pigweigh.uploads import BODY_LIMIT, FILE_LIMIT
from test_inference import create_app_for_test, fake_bundle, marker_pixels, output
from test_multipart_cleanup import part

ORIGIN = "http://localhost:3000"


def photo(pixels=None, *, fmt="PNG"):
    buffer = BytesIO()
    with Image.fromarray(marker_pixels() if pixels is None else pixels) as image:
        image.save(buffer, format=fmt)
    return buffer.getvalue()


@pytest.fixture
def photo_app(fake_bundle, monkeypatch):
    path, _ = fake_bundle
    app = create_app_for_test(path)
    def no_database(*args, **kwargs):
        pytest.fail("Photo validation must never create a database session")
    monkeypatch.setattr("pigweigh.main.Session", no_database)
    return app


@pytest.fixture
def photo_client(photo_app, monkeypatch):
    created = []
    original = formparsers.SpooledTemporaryFile
    def track(*args, **kwargs):
        file = original(*args, **kwargs)
        created.append(file)
        return file
    monkeypatch.setattr(formparsers, "SpooledTemporaryFile", track)
    with TestClient(photo_app, raise_server_exceptions=False) as client:
        yield client, created
    assert all(file.closed for file in created)
    assert photo_app.state.engine.pool.checkedout() == 0


def validate(client, view="top", content=None):
    return client.post(f"/api/photos/{view}/validate", headers={"Origin": ORIGIN},
                       files={"image": ("photo.png", photo() if content is None else content)})


@pytest.mark.parametrize("view", ["top", "side"])
def test_valid_photo_exact_response_and_no_database(photo_client, view):
    client, _ = photo_client
    response = validate(client, view)
    assert response.status_code == 200, response.text
    assert response.json() == {"status": "validated", "view": view, "artifacts": {"bundle_id": "test-bundle"}}
    assert response.headers["cache-control"] == "no-store"


@pytest.mark.parametrize("view", ["top", "side"])
@pytest.mark.parametrize("case,code", [("missing", "marker_missing"), ("wrong", "marker_ambiguous"), ("duplicate", "marker_ambiguous")])
def test_actual_marker_gates(photo_client, view, case, code):
    client, _ = photo_client
    pixels = marker_pixels(1 if case == "wrong" else 0)
    if case == "missing": pixels[:] = 255
    if case == "duplicate": pixels[250:350,250:350] = pixels[50:150,50:150]
    response = validate(client, view, photo(pixels))
    assert response.status_code == 422
    assert response.json()["error"]["code"] == code
    assert response.json()["error"]["details"] == {"view": view}
    assert response.headers["cache-control"] == "no-store"


@pytest.mark.parametrize("view", ["top", "side"])
@pytest.mark.parametrize("case,code", [("none", "pig_count"), ("multiple", "pig_count"), ("landmark", "landmark_unusable"), ("outside", "landmark_outside_image"), ("nonfinite", "invalid_pose")])
def test_actual_pose_gates(photo_client, monkeypatch, view, case, code):
    client, _ = photo_client
    data = output(view)
    names = TOP_POINTS if view == "top" else SIDE_POINTS
    landmark = "tail-base" if view == "top" else "sternum"
    index = 6 + 3 * names.index(landmark)
    if case == "none": data[0,0,4] = 0
    elif case == "multiple": data[0,1] = data[0,0]
    elif case == "landmark": data[0,0,index+2] = .49
    elif case == "outside": data[0,0,index] = 10000
    else: data[0,0,index] = np.nan
    monkeypatch.setattr("test_inference.output", lambda selected: data if selected == view else output(selected))
    response = validate(client, view)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == code
    assert response.json()["error"]["details"] == {"view": view}


def test_preflight_and_estimate_reuse_projection_gate(photo_client, photo_app, monkeypatch):
    client, _ = photo_client
    calls = []
    def reject(points, transform, view):
        calls.append(view)
        raise CaptureRejected("projection_unusable", "Retake this view.", view)
    monkeypatch.setattr("pigweigh.inference.project_points", reject)
    assert validate(client).json()["error"]["code"] == "projection_unusable"
    with Image.fromarray(marker_pixels()) as image:
        with pytest.raises(CaptureRejected):
            photo_app.state.inference.estimate({"top": image, "side": image})
    assert calls == ["top", "top"]


def test_final_pair_rechecks_both_preflight_photos(photo_client, photo_app, monkeypatch):
    client, _ = photo_client
    calls = []
    original = photo_app.state.inference._measure_view
    def track(view, image):
        calls.append(view)
        return original(view, image)
    monkeypatch.setattr(photo_app.state.inference, "_measure_view", track)
    assert validate(client, "top").status_code == 200
    assert validate(client, "side").status_code == 200
    with Image.fromarray(marker_pixels()) as top, Image.fromarray(marker_pixels()) as side:
        result = photo_app.state.inference.estimate({"top": top, "side": side})
    assert result["status"] == "estimated"
    assert calls == ["top", "side", "top", "side"]


def test_missing_bundle_never_validates():
    app = create_app_for_test(None)
    with TestClient(app) as client:
        response = validate(client)
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "inference_unavailable"
    assert app.state.engine.pool.checkedout() == 0


def test_runtime_failure_is_sanitized_and_disables_both_flows(photo_client, photo_app, monkeypatch):
    client, _ = photo_client
    def fail(*args, **kwargs): raise RuntimeError("private runtime path")
    monkeypatch.setattr(photo_app.state.inference.models["top"].session, "run", fail)
    response = validate(client)
    assert response.status_code == 503 and "private runtime path" not in response.text
    assert validate(client, "side").status_code == 503
    assert client.get("/api/inference/readiness").json()["blockers"][0]["code"] == "inference_runtime_failed"


@pytest.mark.parametrize("case,status,code", [
    ("missing",422,"invalid_capture"), ("wrong_field",422,"invalid_capture"),
    ("duplicate",422,"invalid_capture"), ("extra_file",422,"invalid_capture"),
    ("extra_field",422,"invalid_capture"), ("text_image",422,"invalid_capture"),
    ("invalid_image",415,"unsupported_image"), ("unsupported_format",415,"unsupported_image"),
    ("large_file",413,"image_too_large"), ("pixels",413,"image_dimensions_too_large"),
    ("animation",422,"animated_image"), ("thin",422,"image_aspect_unusable"),
])
def test_upload_contract_and_cleanup(photo_client, case, status, code):
    client, created = photo_client
    content = photo()
    files = [("image", ("photo.png", content))]
    data = None
    if case == "missing": files = []
    elif case == "wrong_field": files = [("top_image", ("photo.png", content))]
    elif case == "duplicate": files *= 2
    elif case == "extra_file": files.append(("other", ("photo.png", content)))
    elif case == "extra_field": data = {"extra": "secret value"}
    elif case == "text_image": files = [("image", (None, "secret value"))]
    else:
        if case == "invalid_image": content = b"private undecodable data"
        elif case == "unsupported_format": content = photo(fmt="BMP")
        elif case == "large_file": content = b"x" * (FILE_LIMIT + 1)
        elif case == "pixels": content = photo(np.zeros((4001,5000,3), dtype=np.uint8))
        elif case == "thin": content = photo(np.zeros((100000,1,3), dtype=np.uint8))
        elif case == "animation":
            buffer = BytesIO()
            with Image.new("RGB",(8,8),"red") as first, Image.new("RGB",(8,8),"blue") as second:
                first.save(buffer,format="PNG",save_all=True,append_images=[second])
            content = buffer.getvalue()
        files = [("image", ("photo.png", content))]
    if case == "missing":
        response = client.post("/api/photos/top/validate", headers={"Origin":ORIGIN,"Content-Type":"multipart/form-data; boundary=abc"}, content=b"--abc--\r\n")
    else:
        response = client.post("/api/photos/top/validate", headers={"Origin":ORIGIN}, files=files, data=data)
    assert response.status_code == status, response.text
    assert response.json()["error"]["code"] == code
    assert "secret value" not in response.text and "private undecodable" not in response.text
    assert response.headers["cache-control"] == "no-store"
    assert all(file.closed for file in created)


@pytest.mark.parametrize("body", [b"not valid multipart", part("image", b"x" * (1024*1024+1)), part("image", b"photo")+b"\r\n--abc\r\n"], ids=["malformed", "unfinished_rolled", "finalized_without_end"])
def test_malformed_and_eof_close_finalized_and_unfinished_spools(photo_client, body):
    client, created = photo_client
    response = client.post("/api/photos/top/validate", headers={"Origin":ORIGIN,"Content-Type":"multipart/form-data; boundary=abc"}, content=body)
    assert response.status_code == 422, response.text
    assert response.json()["error"]["code"] == "invalid_capture"
    assert all(file.closed for file in created)


@pytest.mark.parametrize("view", ["front", "TOP", "top/other"])
def test_invalid_paths_are_bounded(photo_client, view):
    client, _ = photo_client
    response = validate(client, view, b"x" * (16 * 1024 + 1))
    assert response.status_code == 413
    assert response.headers["cache-control"] == "no-store"
    small = validate(client, view)
    assert small.status_code in {404,422}


def test_origin_and_content_type(photo_client):
    client, created = photo_client
    for headers in ({}, {"Origin":"null"}, {"Origin":ORIGIN+"/"}, [("Origin",ORIGIN),("Origin",ORIGIN)]):
        response = client.post("/api/photos/top/validate",headers=headers,content=b"private")
        assert response.status_code == 403
        assert response.headers["cache-control"] == "no-store"
    response = client.post("/api/photos/top/validate",headers={"Origin":ORIGIN},json={})
    assert response.status_code == 415 and response.json()["error"]["code"] == "unsupported_content_type"
    assert not created


def test_upload_boundary_shares_admission_with_estimates_and_bounds_chunks():
    async def exercise():
        entered, release = asyncio.Event(), asyncio.Event()
        async def downstream(scope, receive, send):
            entered.set()
            await release.wait()
        boundary = RequestBoundary(downstream, ORIGIN)
        output = []
        async def receive(): return {"type":"http.request","body":b"","more_body":False}
        async def send(message): output.append(message)
        def scope(path): return {"type":"http","method":"POST","path":path,"headers":[(b"origin",ORIGIN.encode())]}
        first = asyncio.create_task(boundary(scope("/api/estimates"),receive,send))
        second = asyncio.create_task(boundary(scope("/api/photos/top/validate"),receive,send))
        await entered.wait()
        await asyncio.sleep(0)
        await boundary(scope("/api/photos/side/validate"),receive,send)
        assert output[0]["status"] == 429 and b"upload_busy" in output[1]["body"]
        release.set()
        await asyncio.gather(first, second)
        assert boundary.upload_slots._value == 2
        output.clear()
        async def too_large(): return {"type":"http.request","body":b"x"*(BODY_LIMIT+1),"more_body":True}
        await boundary(scope("/api/photos/top/validate"),too_large,send)
        assert output[0]["status"] == 413 and boundary.upload_slots._value == 2
    asyncio.run(exercise())


@pytest.mark.parametrize("owner", ["photo", "estimate"])
def test_shared_cpu_admission_and_repeated_cancellation_cleanup(monkeypatch, owner):
    app = create_app_for_test(None)
    photo_endpoint = next(route.endpoint for route in app.routes if route.path == "/api/photos/{view}/validate")
    estimate_endpoint = next(route.endpoint for route in app.routes if route.path == "/api/estimates")
    entered, release = threading.Event(), threading.Event()
    images, spools = [], []
    original = formparsers.SpooledTemporaryFile
    def track(*args, **kwargs):
        file = original(*args, **kwargs); spools.append(file); return file
    monkeypatch.setattr(formparsers, "SpooledTemporaryFile", track)
    def blocked(*args):
        images.extend([args[1]] if len(args)==2 else args[0].values())
        entered.set()
        assert release.wait(timeout=5)
        for image in images: image.getpixel((0,0))
        assert all(not file.closed for file in spools)
        raise CaptureRejected("marker_missing", "Retake.", "top")
    monkeypatch.setattr(app.state.inference,"validate_photo",blocked)
    monkeypatch.setattr(app.state.inference,"estimate",blocked)
    def request(kind):
        files = {"image":("photo.png",photo())} if kind=="photo" else {name:("photo.png",photo()) for name in ("top_image","side_image")}
        encoded = httpx.Request("POST","http://localhost/",files=files)
        body = encoded.read()
        async def receive(): return {"type":"http.request","body":body,"more_body":False}
        return Request({"type":"http","method":"POST","path":"/","headers":[(key.lower(),value) for key,value in encoded.headers.raw]},receive)
    async def call(kind):
        if kind == "photo": return await photo_endpoint("top",request(kind))
        return await estimate_endpoint(request(kind))
    async def exercise():
        task = asyncio.create_task(call(owner))
        try:
            for _ in range(200):
                if entered.is_set(): break
                await asyncio.sleep(.01)
            assert entered.is_set()
            task.cancel(); await asyncio.sleep(.02)
            task.cancel(); await asyncio.sleep(.02)
            assert not task.done() and app.state.inference_slot.locked()
            for kind in ("photo", "estimate"):
                with pytest.raises(APIError) as error: await call(kind)
                assert error.value.status == 429 and error.value.code == "inference_busy"
        finally:
            release.set()
            with pytest.raises(asyncio.CancelledError): await task
        assert app.state.inference_slot._value == 1
        assert all(file.closed for file in spools)
        for image in images:
            with pytest.raises(ValueError): image.getpixel((0,0))
    try: asyncio.run(exercise())
    finally: app.state.engine.dispose()


@pytest.mark.skipif(not os.environ.get("PIGWEIGH_TEST_MODEL_BUNDLE"), reason="Explicit generated fixture paths not configured")
@pytest.mark.parametrize("view,filename", [("top","Gemini_Generated_Image_wfs237wfs237wfs2.jpg"), ("side","Gemini_Generated_Image_mcndf9mcndf9mcnd.jpg")])
def test_actual_bundled_onnx_photo_endpoint_without_database(monkeypatch, view, filename):
    manifest = Path(os.environ["PIGWEIGH_TEST_MODEL_BUNDLE"])
    app = create_app_for_test(manifest)
    def no_database(*args, **kwargs): pytest.fail("Preflight queried database")
    monkeypatch.setattr("pigweigh.main.Session", no_database)
    with TestClient(app) as client:
        response = validate(client,view,(Path(os.environ["PIGWEIGH_TEST_PAIR_DIR"])/filename).read_bytes())
        assert response.status_code == 200, response.text
        assert response.json() == {"status":"validated","view":view,"artifacts":{"bundle_id":json.loads(manifest.read_text())["bundle_id"]}}
        assert app.state.engine.pool.checkedout() == 0
