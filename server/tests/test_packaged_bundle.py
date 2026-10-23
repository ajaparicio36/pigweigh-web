"""Exercise the actual committed serving bundle without any developer drive path."""
from pathlib import Path

from fastapi.testclient import TestClient

from pigweigh.config import Settings
from pigweigh.main import create_app


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
