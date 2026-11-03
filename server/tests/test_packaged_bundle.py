"""Exercise the actual committed serving bundle without any developer drive path."""
from pathlib import Path
import json

from fastapi.testclient import TestClient

from pigweigh.config import Settings
from pigweigh.main import create_app
from pigweigh.inference import METHOD, bundle_identifier, sha256_file


def test_packaged_manifest_binds_new_baseline_and_unchanged_pose_models():
    directory = Path(__file__).resolve().parents[1] / "models/v1"
    manifest = json.loads((directory / "manifest.json").read_text())
    assert manifest["method"] == METHOD == "attached-marker-ellipse-14451-v1"
    assert manifest["formula_divisor"] == 14451
    assert manifest["bundle_id"] == bundle_identifier(manifest) == "attached-marker-ellipse-14451-v1-08661ffdf08ae1cc"
    original_hashes = {
        "top": "370a4b6563bde3fc093e8716e7925c11135e0988628fa591c875ad829dd389aa",
        "side": "ed40cb8d60da95b1f8eb1c955b7e52fc70bfb00bf798eb2a57a52a2d4e175c72",
    }
    for view, checksum in original_hashes.items():
        assert manifest["models"][view]["sha256"] == checksum
        assert sha256_file(directory / manifest["models"][view]["file"]) == checksum


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
