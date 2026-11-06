"""Exercise the actual committed serving bundle without any developer drive path."""
from pathlib import Path
from io import BytesIO
import json
import hashlib
import os
from types import SimpleNamespace

from PIL import Image
import pytest

from fastapi.testclient import TestClient

from pigweigh.config import Settings, database_url
from pigweigh.main import create_app
from pigweigh.inference import METHOD, bundle_identifier, decimal_measure, measure, sha256_file


def test_packaged_manifest_binds_baseline_adapter_and_unchanged_top_model():
    directory = Path(__file__).resolve().parents[1] / "models/v1"
    manifest = json.loads((directory / "manifest.json").read_text())
    assert manifest["method"] == METHOD == "attached-marker-ellipse-14451-v1"
    assert manifest["formula_divisor"] == 14451
    assert manifest["bundle_id"] == bundle_identifier(manifest) == "attached-marker-ellipse-14451-v1-35164d7e48c146d1"
    original_hashes = {
        "top": "370a4b6563bde3fc093e8716e7925c11135e0988628fa591c875ad829dd389aa",
        "side": "948c2c9d9849d84003a69f43f91cb1aa483d5afdd7752781acd24dc10fc0640f",
    }
    for view, checksum in original_hashes.items():
        assert manifest["models"][view]["sha256"] == checksum
        assert sha256_file(directory / manifest["models"][view]["file"]) == checksum
    mapping_file = directory.parents[2] / "training/config/side-adapter-v2.json"
    mapping = json.loads(mapping_file.read_text(encoding="utf-8"))
    adapter = manifest["models"]["side"]["adapter"]
    canonical = json.dumps(mapping, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    assert adapter["mapping_sha256"] == hashlib.sha256(canonical).hexdigest()
    assert adapter["json_hash_canonicalization"] == "sorted compact JSON, ASCII-escaped UTF-8"
    assert adapter["source_classes"] == mapping["source_classes"]
    assert adapter["output_to_source"] == mapping["output_to_source"]
    assert adapter["source_dataset_yaml_sha256"] == mapping["source_dataset_yaml_sha256"]


def test_example_relative_bundle_loads_real_cpu_models(monkeypatch):
    server_root = Path(__file__).resolve().parents[1]
    monkeypatch.chdir(server_root)
    example = dict(line.split("=",1) for line in (server_root/".env.example").read_text().splitlines()
                   if line and not line.startswith("#"))
    assert example["PIGWEIGH_MODEL_BUNDLE"] == "models/v1/manifest.json"
    monkeypatch.setenv("DATABASE_URL","postgresql://unused@127.0.0.1:1/unused")
    monkeypatch.setenv("PUBLIC_ORIGIN","http://localhost:3000")
    monkeypatch.setenv("PIGWEIGH_MODEL_BUNDLE",example["PIGWEIGH_MODEL_BUNDLE"])
    settings = Settings.from_env()
    assert not settings.model_bundle.is_absolute()
    app = create_app(settings)
    with TestClient(app) as client:
        # Actual local ONNX checksum/metadata/CPU warmup, not a mocked readiness toggle.
        assert client.get("/api/inference/readiness").json() == {"ready":True,"blockers":[]}
        assert set(app.state.inference.models) == {"top","side"}


@pytest.mark.skipif(not os.environ.get("PIGWEIGH_TEST_PAIR_DIR"), reason="Generated fixture paths not configured")
def test_packaged_generated_pair_and_marker_rejection_with_stubbed_no_price(monkeypatch):
    """Exercise real models and API; the price read is deliberately stubbed."""
    root = Path(os.environ["PIGWEIGH_TEST_PAIR_DIR"])
    top = root / "Gemini_Generated_Image_wfs237wfs237wfs2.jpg"
    side = root / "Gemini_Generated_Image_mcndf9mcndf9mcnd.jpg"
    assert sha256_file(top) == "4f96b300752165fc99ad3f620bd71ce5caa49e8fb57ece38a68994c8d7aafa63"
    assert sha256_file(side) == "2ae47e8fe70a227859821276c3f921161195daa9f34a7feb625eb178945743b0"
    class NoPriceSession:
        def __init__(self, *args, **kwargs): pass
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def execute(self, *args): return SimpleNamespace(one=lambda: (object(), None))
    monkeypatch.setattr("pigweigh.main.Session", NoPriceSession)
    manifest = Path(__file__).resolve().parents[1] / "models/v1/manifest.json"
    app = create_app(Settings(database_url("postgresql://unused@127.0.0.1:1/unused"), "http://localhost:3000", manifest))
    files = {"top_image": ("top.jpg", top.read_bytes(), "image/jpeg"),
             "side_image": ("side.jpg", side.read_bytes(), "image/jpeg")}
    with TestClient(app) as client:
        response = client.post("/api/estimates", headers={"Origin": "http://localhost:3000"}, files=files)
        assert response.status_code == 200, response.text
        result = response.json()
        assert result["artifacts"]["bundle_id"] == json.loads(manifest.read_text())["bundle_id"]
        assert result["method"]["formula"] == "G_cm^2 * L_cm / 14451"
        assert result["method"]["accuracy_evaluated"] is False
        assert result["valuation"] is None and result["valuation_unavailable_reason"] == "no_price"
        with Image.open(top) as top_image, Image.open(side) as side_image:
            values = measure(app.state.inference._measure_view("top", top_image.convert("RGB")),
                             app.state.inference._measure_view("side", side_image.convert("RGB")))
        assert result["estimated_weight_kg"] == decimal_measure(values["weight_kg"])
        assert values["weight_kg"] == pytest.approx(values["girth_cm"] ** 2 * values["body_length_cm"] / 14451)
        blank = BytesIO()
        Image.new("RGB", (512, 512), "white").save(blank, format="PNG")
        rejected = client.post("/api/estimates", headers={"Origin": "http://localhost:3000"},
                               files={**files, "top_image": ("blank.png", blank.getvalue(), "image/png")})
        assert rejected.status_code == 422 and rejected.json()["error"]["code"] == "marker_missing"
