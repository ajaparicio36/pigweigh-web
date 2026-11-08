"""Landmark review: exact identities, hard gates and geometry."""
from io import BytesIO
import hashlib
import json
from types import SimpleNamespace

from fastapi.testclient import TestClient
import numpy as np
from PIL import Image
import pytest

from pigweigh.inference import SIDE_POINTS, TOP_POINTS
from test_inference import create_app_for_test, fake_bundle, marker_pixels

ORIGIN = "http://localhost:3000"


def png_bytes():
    data = BytesIO()
    with Image.fromarray(marker_pixels()) as image:
        image.save(data, format="PNG")
    return data.getvalue()


class NoPriceSession:
    def __init__(self, *args, **kwargs): pass
    def __enter__(self): return self
    def __exit__(self, *args): pass
    def execute(self, *args): return SimpleNamespace(one=lambda: (object(), None))


@pytest.fixture
def review(fake_bundle, monkeypatch):
    path, _ = fake_bundle
    monkeypatch.setattr("pigweigh.main.Session", NoPriceSession)
    app = create_app_for_test(path)
    with TestClient(app) as client:
        yield client, app


def files(top, side):
    return {"top_image": ("top.png", top, "image/png"), "side_image": ("side.png", side, "image/png")}


def photo(client, view, data):
    return client.post(f"/api/photos/{view}/validate?diagnostics=true", headers={"Origin": ORIGIN},
                       files={"image": (f"{view}.png", data, "image/png")})


def request_adjustments(client, top, side):
    a, b = photo(client, "top", top), photo(client, "side", side)
    assert a.status_code == b.status_code == 200
    top_data, side_data = a.json(), b.json()
    return {"version": 1, "bundle_id": top_data["artifacts"]["bundle_id"],
            "image_sha256": {"top": top_data["diagnostics"]["image_sha256"],
                             "side": side_data["diagnostics"]["image_sha256"]},
            "overrides": {"top": {}, "side": {}}}, top_data["diagnostics"], side_data["diagnostics"]


def submit(client, top, side, adjustments=None, diagnostics=False):
    return client.post("/api/estimates" + ("?diagnostics=true" if diagnostics else ""),
                       headers={"Origin": ORIGIN}, files=files(top, side),
                       data={"adjustments": json.dumps(adjustments)} if adjustments is not None else None)


def test_default_automatic_and_opt_in_photo_diagnostics(review):
    client, _ = review
    data = png_bytes()
    plain = client.post("/api/photos/top/validate", headers={"Origin": ORIGIN},
                        files={"image": ("top.png", data, "image/png")})
    assert set(plain.json()) == {"status", "view", "artifacts"}
    request, top, side = request_adjustments(client, data, data)
    assert top["image_sha256"] == hashlib.sha256(data).hexdigest()
    assert top["coordinate_space"] == "exif-oriented-pixels" and (top["width"], top["height"]) == (500, 500)
    assert len(top["image_to_marker"]) == 9 and len(top["bounding_box"]) == 4
    assert set(top["landmarks"]) == set(TOP_POINTS) and set(side["landmarks"]) == set(SIDE_POINTS)
    assert top["model_score_semantics"] == "model_detection"
    assert top["landmarks"]["snout-tip"]["used"] is None
    assert top["landmarks"]["left-ear-base"]["used"] == top["landmarks"]["left-ear-base"]["detected"]
    assert set(top["segments"]) == {"body_length", "chest_width"} and set(side["segments"]) == {"chest_depth"}
    result = submit(client, data, data).json()
    assert result["status"] == "estimated" and "diagnostics" not in result
    provenance = result["provenance"]
    assert provenance["source"] == "automatic" and provenance["overrides"] == {"top": {}, "side": {}}
    assert provenance["image_sha256"] == request["image_sha256"]
    assert provenance["bundle_id"] == result["artifacts"]["bundle_id"]
    assert provenance["configuration"]["formula_divisor"] == 14451
    assert set(provenance["landmarks"]["top"]) == set(TOP_POINTS)


def test_adjustments_and_noop_normalization(review):
    client, _ = review
    data = png_bytes(); request, top, side = request_adjustments(client, data, data)
    left = top["landmarks"]["left-ear-base"]["detected"]
    sternum = side["landmarks"]["sternum"]["detected"]
    request["overrides"]["top"]["left-ear-base"] = [left[0]+5, left[1]]
    request["overrides"]["side"]["sternum"] = [sternum[0]+5, sternum[1]]
    response = submit(client, data, data, request)
    assert response.status_code == 200, response.text
    result = response.json(); p = result["provenance"]
    assert p["source"] == "manually_adjusted" and p["overrides"] == request["overrides"]
    point = p["landmarks"]["side"]["sternum"]
    assert point["detected"] == sternum and point["used"] == [sternum[0]+5, sternum[1]]
    assert point["confidence"] == side["landmarks"]["sternum"]["confidence"]
    assert result["diagnostics"]["side"]["segments"]["chest_depth"][1] == point["used"]
    request["overrides"] = {"top": {"left-ear-base": left}, "side": {"sternum": sternum}}
    no_op = submit(client, data, data, request).json()
    assert no_op["provenance"]["source"] == "automatic" and no_op["provenance"]["overrides"] == {"top": {}, "side": {}}
    assert "diagnostics" in no_op


@pytest.mark.parametrize("point,code", [([501,100], "adjustment_outside_image"), ([10,100], "adjustment_outside_pig")])
def test_adjustments_inside_image_and_box(review, point, code):
    client, _ = review
    data = png_bytes(); request, _, _ = request_adjustments(client, data, data)
    request["overrides"]["top"]["left-ear-base"] = point
    response = submit(client, data, data, request)
    assert response.status_code == 422 and response.json()["error"]["code"] == code


def test_mismatched_files_and_bundle_are_actionable(review):
    client, app = review
    data = png_bytes(); request, _, _ = request_adjustments(client, data, data)
    changed = submit(client, data + b"extra", data, request)
    assert changed.status_code == 409 and changed.json()["error"]["code"] == "stale_review"
    assert changed.json()["error"]["details"] == {"reason": "image_changed", "view": "top"}
    app.state.inference.bundle_id = "new-model-bundle"
    changed = submit(client, data, data, request)
    assert changed.status_code == 409 and changed.json()["error"]["details"]["reason"] == "bundle_changed"


@pytest.mark.parametrize("mutation", ["unknown", "boolean", "nonfinite", "bad_sha", "bad_version", "wrong_anchor", "duplicate", "huge"])
def test_strict_bounded_adjustment_json(review, mutation):
    client, _ = review
    data = png_bytes(); request, _, _ = request_adjustments(client, data, data)
    if mutation == "unknown": request["extra"] = 1
    elif mutation == "boolean": request["overrides"]["side"]["sternum"] = [True, 2]
    elif mutation == "nonfinite": request["overrides"]["side"]["sternum"] = [float("nan"), 2]
    elif mutation == "bad_sha": request["image_sha256"]["top"] = "a" * 63
    elif mutation == "bad_version": request["version"] = True
    elif mutation == "wrong_anchor": request["overrides"]["side"]["front-hoof"] = [1, 2]
    elif mutation == "huge": request["padding"] = "x" * 9000
    text = json.dumps(request)
    if mutation == "duplicate": text = text[:-1] + ', "version": 1}'
    response = client.post("/api/estimates", headers={"Origin": ORIGIN}, files=files(data, data), data={"adjustments": text})
    assert response.status_code == 422
    assert response.json()["error"]["code"] in {"invalid_adjustments", "invalid_capture_pair"}


def test_unused_low_confidence_outside_points_do_not_reject(review, monkeypatch):
    client, app = review
    original = app.state.inference.models["side"].session.run
    def special(*args, **kwargs):
        result = original(*args, **kwargs)
        result[0][0, 0, 6:9] = [-64, -128, 1.2]
        return result
    monkeypatch.setattr(app.state.inference.models["side"].session, "run", special)
    response = photo(client, "side", png_bytes())
    assert response.status_code == 200, response.text
    point = response.json()["diagnostics"]["landmarks"]["snout-tip"]
    assert point["detected"] == pytest.approx([-50, -100])
    assert point["within_image"] is False and point["confidence"] is None and point["used"] is None


def test_original_confidence_cannot_be_rescued(review, monkeypatch):
    client, app = review
    data = png_bytes(); request, _, _ = request_adjustments(client, data, data)
    request["overrides"]["side"]["sternum"] = [300, 310]
    original = app.state.inference.models["side"].session.run
    def bad(*args, **kwargs):
        result = original(*args, **kwargs)
        result[0][0, 0, 6 + 3 * SIDE_POINTS.index("sternum") + 2] = .1
        return result
    monkeypatch.setattr(app.state.inference.models["side"].session, "run", bad)
    response = submit(client, data, data, request)
    assert response.status_code == 422 and response.json()["error"]["code"] == "landmark_unusable"


def test_original_projection_cannot_be_rescued(review, monkeypatch):
    client, _ = review
    data = png_bytes(); request, _, _ = request_adjustments(client, data, data)
    request["overrides"]["top"]["left-ear-base"] = [300, 100]
    monkeypatch.setattr("pigweigh.inference.marker_homography", lambda _pixels, _view: np.array([[1.,0,0],[0,1,0],[1,0,-225]]))
    response = submit(client, data, data, request)
    assert response.status_code == 422 and response.json()["error"]["code"] == "projection_unusable"


def test_top_segment_uses_projected_ear_midpoint(review, monkeypatch):
    client, _ = review
    transform = np.array([[1.,0,0],[0,1,0],[.003,.001,1.]])
    monkeypatch.setattr("pigweigh.inference.marker_homography", lambda _pixels, _view: transform)
    diag = photo(client, "top", png_bytes()).json()["diagnostics"]
    left = np.array([*diag["landmarks"]["left-ear-base"]["used"],1.])
    right = np.array([*diag["landmarks"]["right-ear-base"]["used"],1.])
    a, b = transform @ left, transform @ right
    middle = (a[:2]/a[2] + b[:2]/b[2])/2
    back = np.linalg.inv(transform) @ np.array([*middle,1.]); expected = back[:2]/back[2]
    assert diag["segments"]["body_length"][0] == pytest.approx(expected)
    assert not np.allclose(expected, (left[:2]+right[:2])/2, rtol=0, atol=1e-3)


def test_hashes_exact_upload_and_oriented_dimensions(review, monkeypatch):
    client, _ = review
    monkeypatch.setattr("pigweigh.inference.marker_homography", lambda _pixels, _view: np.eye(3))
    buffer = BytesIO()
    with Image.new("RGB", (400, 500), "red") as image:
        exif = image.getexif(); exif[274] = 6
        image.save(buffer, format="PNG", exif=exif)
    data = buffer.getvalue()
    response = photo(client, "side", data)
    assert response.status_code == 200, response.text
    diag = response.json()["diagnostics"]
    assert (diag["width"], diag["height"]) == (500, 400)
    assert diag["image_sha256"] == hashlib.sha256(data).hexdigest()


def test_noop_original_point_outside_box_does_not_add_gate(review, monkeypatch):
    client, app = review
    data = png_bytes()
    original = app.state.inference.models["top"].session.run
    def outside(*args, **kwargs):
        result = original(*args, **kwargs)
        i = 6 + 3 * TOP_POINTS.index("left-ear-base")
        result[0][0, 0, i] = 100 * 1.28
        return result
    monkeypatch.setattr(app.state.inference.models["top"].session, "run", outside)
    request, top, _ = request_adjustments(client, data, data)
    request["overrides"]["top"]["left-ear-base"] = top["landmarks"]["left-ear-base"]["detected"]
    response = submit(client, data, data, request)
    assert response.status_code == 200
    assert response.json()["provenance"]["source"] == "automatic"


@pytest.mark.skipif(not __import__("os").environ.get("PIGWEIGH_TEST_MODEL_BUNDLE"), reason="Actual bundle not configured")
def test_actual_candidate_pair_automatic_and_adjusted(monkeypatch):
    import os
    from pathlib import Path
    from pigweigh.config import Settings, database_url
    from pigweigh.main import create_app
    from pigweigh.inference import sha256_file
    candidate = Path(os.environ["PIGWEIGH_TEST_MODEL_BUNDLE"])
    root = Path(os.environ["PIGWEIGH_TEST_PAIR_DIR"])
    top_path = root / "Gemini_Generated_Image_wfs237wfs237wfs2.jpg"
    side_path = root / "Gemini_Generated_Image_mcndf9mcndf9mcnd.jpg"
    assert sha256_file(top_path) == "4f96b300752165fc99ad3f620bd71ce5caa49e8fb57ece38a68994c8d7aafa63"
    assert sha256_file(side_path) == "2ae47e8fe70a227859821276c3f921161195daa9f34a7feb625eb178945743b0"
    monkeypatch.setattr("pigweigh.main.Session", NoPriceSession)
    app = create_app(Settings(database_url("postgresql://unused@127.0.0.1:1/unused"), ORIGIN, candidate))
    top, side = top_path.read_bytes(), side_path.read_bytes()
    with TestClient(app) as client:
        request, top_diag, side_diag = request_adjustments(client, top, side)
        assert side_diag["model_score_semantics"] == "model_detection"
        assert len(top_diag["landmarks"]) == 11 and len(side_diag["landmarks"]) == 13
        automatic = submit(client, top, side, diagnostics=True)
        assert automatic.status_code == 200, automatic.text
        assert automatic.json()["provenance"]["source"] == "automatic"
        point = side_diag["landmarks"]["sternum"]["detected"]
        box = side_diag["bounding_box"]
        x = point[0] + 1 if point[0] + 1 < min(box[2], side_diag["width"]) else point[0] - 1
        assert 0 <= x < side_diag["width"] and box[0] <= x <= box[2] and x != point[0]
        request["overrides"]["side"]["sternum"] = [x, point[1]]
        adjusted = submit(client, top, side, request)
        assert adjusted.status_code == 200, adjusted.text
        body = adjusted.json()
        assert body["provenance"]["source"] == "manually_adjusted"
        assert body["provenance"]["landmarks"]["side"]["sternum"]["used"] == [x, point[1]]
        assert body["provenance"]["image_sha256"] == request["image_sha256"]
        assert body["method"]["formula"] == "G_cm^2 * L_cm / 14451"


def test_adjusted_result_missing_provenance_fails_closed(review, monkeypatch):
    client, app = review
    data = png_bytes(); request, _, side = request_adjustments(client, data, data)
    point = side["landmarks"]["sternum"]["detected"]
    request["overrides"]["side"]["sternum"] = [point[0]+1, point[1]]
    def incomplete(*args, **kwargs):
        return {"status": "estimated", "estimated_weight_kg": "1.00", "method": {"version": "fake"}}
    monkeypatch.setattr(app.state.inference, "estimate", incomplete)
    response = submit(client, data, data, request)
    assert response.status_code == 503 and response.json()["error"]["code"] == "review_provenance_unavailable"


def test_adjusted_projection_failure_is_rejected(review, monkeypatch):
    client, _ = review
    data = png_bytes(); request, _, _ = request_adjustments(client, data, data)
    request["overrides"]["top"]["left-ear-base"] = [140, 100]
    monkeypatch.setattr("pigweigh.inference.marker_homography", lambda _pixels, _view: np.array([[1.,0,0],[0,1,0],[1,0,-150]]))
    response = submit(client, data, data, request)
    assert response.status_code == 422 and response.json()["error"]["code"] == "projection_unusable"


def test_diagnostics_run_only_one_model_pass(review, monkeypatch):
    client, app = review
    session = app.state.inference.models["top"].session
    original = session.run
    calls = []
    def count(*args, **kwargs):
        calls.append(1)
        return original(*args, **kwargs)
    monkeypatch.setattr(session, "run", count)
    assert photo(client, "top", png_bytes()).status_code == 200
    assert len(calls) == 1


def test_invalid_adjustment_closes_both_upload_spools(review, monkeypatch):
    import starlette.formparsers as formparsers
    client, _ = review
    made = []
    original = formparsers.SpooledTemporaryFile
    def tracked(*args, **kwargs):
        file = original(*args, **kwargs); made.append(file); return file
    monkeypatch.setattr(formparsers, "SpooledTemporaryFile", tracked)
    data = png_bytes()
    response = client.post("/api/estimates", headers={"Origin":ORIGIN}, files=files(data, data), data={"adjustments":"{}"})
    assert response.status_code == 422 and len(made) == 2 and all(file.closed for file in made)


def test_adjusted_result_missing_configuration_fails_closed(review, monkeypatch):
    client, app = review
    data = png_bytes(); request, _, side = request_adjustments(client, data, data)
    point = side["landmarks"]["sternum"]["detected"]
    request["overrides"]["side"]["sternum"] = [point[0]+1, point[1]]
    original = app.state.inference.estimate
    def incomplete(*args, **kwargs):
        result = original(*args, **kwargs)
        del result["provenance"]["configuration"]
        return result
    monkeypatch.setattr(app.state.inference, "estimate", incomplete)
    response = submit(client, data, data, request)
    assert response.status_code == 503 and response.json()["error"]["code"] == "review_provenance_unavailable"


def test_automatic_estimate_does_not_require_optional_inverse_overlay(review, monkeypatch):
    client, _ = review
    def unavailable(_transform):
        raise AssertionError("automatic estimate should not build overlay")
    monkeypatch.setattr("pigweigh.inference.np.linalg.inv", unavailable)
    data = png_bytes()
    response = submit(client, data, data)
    assert response.status_code == 200 and response.json()["provenance"]["source"] == "automatic"
