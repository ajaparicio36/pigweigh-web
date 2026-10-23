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
