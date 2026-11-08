"""Exercise the actual committed serving bundle without any developer drive path."""
from pathlib import Path
from io import BytesIO
import json
import os
from types import SimpleNamespace

from PIL import Image
import pytest

from fastapi.testclient import TestClient

from pigweigh.config import Settings, database_url
from pigweigh.main import create_app
from pigweigh.inference import METHOD, bundle_identifier, decimal_measure, measure, sha256_file


def test_packaged_manifest_binds_canonical_side_and_unchanged_top_model():
    directory = Path(__file__).resolve().parents[1] / "models/v1"
    manifest = json.loads((directory / "manifest.json").read_text())
    assert manifest["method"] == METHOD == "attached-marker-ellipse-14451-v1"
    assert manifest["formula_divisor"] == 14451
    assert manifest["bundle_id"] == bundle_identifier(manifest) == "attached-marker-ellipse-14451-v1-845afb1a5f873783"
    release_hashes = {
        "top": "370a4b6563bde3fc093e8716e7925c11135e0988628fa591c875ad829dd389aa",
        "side": "558c18e39b796ca7e0f0d7de591464cf668f44a3422c8dfc7c92b2c86ca789e4",
    }
    for view, checksum in release_hashes.items():
        assert manifest["models"][view]["sha256"] == checksum
        assert sha256_file(directory / manifest["models"][view]["file"]) == checksum
    side = manifest["models"]["side"]
    assert side["source_checkpoint_sha256"] == "000dab3f05dccaa41e50de5e6b4f088318d99fb48f7571e7e5d0b39735420e91"
    assert side["training_source"] == {
        "prepared_dataset_yaml_sha256": "0f34637d2692e5edd10cbbeae77dfbf42302f51dea22cc3356c287fed5f2843d",
        "prepared_dataset_manifest_sha256": "593d8c6881ada950aabaa89544264f1eb8ea9592114a6ea5c2d7310fe8de1609",
        "preparation_policy_sha256": "d833efdb567454b00eaca17cf5a8878ea5f3fc897c5638b4718814e87f9ec107",
        "class_names": ["pig"],
    }
    assert side["input_shape"] == [1, 3, 640, 640] and side["output_shape"] == [1, 300, 45]
    assert side["end2end"] is True and "adapter" not in side


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
