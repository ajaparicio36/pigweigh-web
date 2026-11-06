"""Opt-in functional proof only: private generated pictures are not accuracy evidence."""
from decimal import Decimal, ROUND_HALF_UP
from io import BytesIO
import json
import os
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image
import pytest

from pigweigh.config import Settings
from pigweigh.main import create_app
from pigweigh.inference import METHOD, measure, decimal_measure
from conftest import ORIGIN, login
from test_api import publish


@pytest.mark.skipif(not os.environ.get("PIGWEIGH_TEST_MODEL_BUNDLE"), reason="Explicit private model/pair paths not configured")
def test_actual_onnx_pair_api_postgres_price_roundtrip(settings, app):
    manifest = Path(os.environ["PIGWEIGH_TEST_MODEL_BUNDLE"])
    pair_dir = Path(os.environ["PIGWEIGH_TEST_PAIR_DIR"])
    paths = {"top_image":pair_dir/"Gemini_Generated_Image_wfs237wfs237wfs2.jpg",
             "side_image":pair_dir/"Gemini_Generated_Image_mcndf9mcndf9mcnd.jpg"}
    payload = {view:(path.name,path.read_bytes(),"image/jpeg") for view,path in paths.items()}
    actual = create_app(Settings(settings.database,ORIGIN,manifest))
    with TestClient(actual) as client:
        assert client.get("/api/inference/readiness").json()=={"ready":True,"blockers":[]}
        original = actual.state.inference.estimate
        def assert_no_database_during_compute(images):
            assert actual.state.engine.pool.checkedout()==0
            return original(images)
        actual.state.inference.estimate = assert_no_database_during_compute
        first = client.post("/api/estimates",headers={"Origin":ORIGIN},files=payload)
        assert first.status_code==200,first.text
        result = first.json()
        assert Decimal(result["estimated_weight_kg"])>0
        assert result["method"]["version"] == METHOD == "attached-marker-ellipse-14451-v1"
        assert result["method"]["formula"] == "G_cm^2 * L_cm / 14451"
        # Reuse actual unrounded ONNX/marker measurements to verify the baseline;
        # rounded display dimensions cannot reproduce the exact returned weight.
        with Image.open(paths["top_image"]) as top, Image.open(paths["side_image"]) as side:
            dimensions = measure(actual.state.inference._measure_view("top", top.convert("RGB")),
                                 actual.state.inference._measure_view("side", side.convert("RGB")))
        expected_weight = dimensions["girth_cm"] ** 2 * dimensions["body_length_cm"] / 14451
        assert result["estimated_weight_kg"] == decimal_measure(expected_weight)
        assert result["valuation"] is None and result["valuation_unavailable_reason"]=="no_price"
        assert result["method"]["accuracy_evaluated"] is False
        assert result["artifacts"]["bundle_id"]==json.loads(manifest.read_text())["bundle_id"]
        login(client)
        price=publish(client,"210.50")
        assert price.status_code==201
        valued=client.post("/api/estimates",headers={"Origin":ORIGIN},files=payload)
        assert valued.status_code==200,valued.text
        value=valued.json()
        expected=(Decimal(value["estimated_weight_kg"])*Decimal("210.50")).quantize(Decimal(".01"),rounding=ROUND_HALF_UP)
        assert value["valuation"]["amount_php"]==str(expected)
        assert value["valuation"]["price"]==price.json()["price"]
        assert "valuation_unavailable_reason" not in value
        no_marker=BytesIO()
        with Image.new("RGB",(512,512),"white") as image:image.save(no_marker,format="PNG")
        rejected=client.post("/api/estimates",headers={"Origin":ORIGIN},files={**payload,"top_image":("empty.png",no_marker.getvalue(),"image/png")})
        assert rejected.status_code==422 and rejected.json()["error"]["code"]=="marker_missing"
        print("Functional-only actual CPU/API/PG result:",json.dumps(value))


@pytest.mark.skipif(not os.environ.get("PIGWEIGH_TEST_MODEL_BUNDLE"), reason="Explicit private model/pair paths not configured")
def test_actual_adjusted_pair_uses_postgres_price_snapshot(settings, app):
    manifest = Path(os.environ["PIGWEIGH_TEST_MODEL_BUNDLE"])
    pair_dir = Path(os.environ["PIGWEIGH_TEST_PAIR_DIR"])
    paths = {"top": pair_dir / "Gemini_Generated_Image_wfs237wfs237wfs2.jpg",
             "side": pair_dir / "Gemini_Generated_Image_mcndf9mcndf9mcnd.jpg"}
    actual = create_app(Settings(settings.database, ORIGIN, manifest))
    with TestClient(actual) as client:
        original = actual.state.inference.estimate
        def no_db_during_compute(images, **kwargs):
            assert actual.state.engine.pool.checkedout() == 0
            return original(images, **kwargs)
        actual.state.inference.estimate = no_db_during_compute
        checks = {}
        for view, path in paths.items():
            response = client.post(f"/api/photos/{view}/validate?diagnostics=true", headers={"Origin": ORIGIN},
                                   files={"image": (path.name, path.read_bytes(), "image/jpeg")})
            assert response.status_code == 200, response.text
            checks[view] = response.json()
        side = checks["side"]["diagnostics"]
        point = side["landmarks"]["sternum"]["detected"]
        box = side["bounding_box"]
        x = point[0] + 1 if point[0] + 1 < min(box[2], side["width"]) else point[0] - 1
        assert 0 <= x < side["width"] and box[0] <= x <= box[2] and x != point[0]
        edits = {"version": 1, "bundle_id": checks["top"]["artifacts"]["bundle_id"],
                 "image_sha256": {view: checks[view]["diagnostics"]["image_sha256"] for view in ("top", "side")},
                 "overrides": {"top": {}, "side": {"sternum": [x, point[1]]}}}
        payload = {f"{view}_image": (path.name, path.read_bytes(), "image/jpeg") for view, path in paths.items()}
        login(client)
        price = publish(client, "210.50")
        assert price.status_code == 201
        response = client.post("/api/estimates", headers={"Origin": ORIGIN}, files=payload,
                               data={"adjustments": json.dumps(edits)})
        assert response.status_code == 200, response.text
        result = response.json()
        expected = (Decimal(result["estimated_weight_kg"]) * Decimal("210.50")).quantize(Decimal(".01"), rounding=ROUND_HALF_UP)
        assert result["valuation"]["amount_php"] == str(expected)
        assert result["valuation"]["price"] == price.json()["price"]
        assert result["provenance"]["source"] == "manually_adjusted"
        assert result["provenance"]["image_sha256"] == edits["image_sha256"]
        assert result["provenance"]["landmarks"]["side"]["sternum"]["used"] == [x, point[1]]
        assert result["method"]["formula"] == "G_cm^2 * L_cm / 14451"
