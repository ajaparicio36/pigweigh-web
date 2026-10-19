"""Run against an explicitly local API behind the built Next proxy, never a cloud DB."""
import argparse
from io import BytesIO
from urllib.parse import urlsplit

import httpx
from PIL import Image

# Only the isolated test fixture uses this password; production has no seeded admin.
PASSWORD = "test-only-password-123!"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--origin", default="http://localhost:13000")
    args = parser.parse_args()
    url = urlsplit(args.origin)
    if url.scheme != "http" or url.hostname not in {"127.0.0.1", "localhost"} or url.port in {None, 80, 443}:
        raise SystemExit("Smoke test only permits an explicit loopback development origin")
    with httpx.Client(base_url=args.origin, headers={"Origin": args.origin}, timeout=30) as client:
        assert client.get("/api/health").json() == {"status": "ok"}
        ready = client.get("/api/inference/readiness")
        assert ready.json()["ready"] is False
        assert client.get("/api/auth/session").status_code == 401
        current = client.get("/api/prices/current").json()
        publication = {"php_per_kg":"200.25", "source_reference":"Local proxy smoke test", "expected_revision":current["revision"]}
        assert client.post("/api/prices", json=publication).status_code == 401
        signed_in = client.post("/api/auth/login", json={"username":"admin", "password":PASSWORD})
        assert signed_in.status_code == 200 and client.cookies.get("pigweigh_session")
        assert signed_in.headers["cache-control"] == "no-store"
        assert client.get("/api/auth/session").status_code == 200
        created = client.post("/api/prices", json=publication)
        assert created.status_code == 201, created.text
        assert client.post("/api/prices", json=publication).status_code == 409
        assert client.get("/api/prices/current").json() == created.json()
        image = BytesIO()
        with Image.new("RGB", (16,16), "red") as pixels:
            pixels.save(image, format="PNG")
        # >10MB total validates that the Next proxy does not impose its old cloning default.
        padded = image.getvalue() + b"\0" * (6 * 1024 * 1024)
        response = client.post("/api/estimates", files={
            "top_image":("top.png",padded,"image/png"),
            "side_image":("side.png",padded,"image/png")})
        assert response.status_code == 503 and response.json()["error"]["code"] == "inference_unavailable", response.text
        assert client.post("/api/auth/logout").status_code == 204
        assert client.get("/api/auth/session").status_code == 401
        assert client.post("/api/auth/login", json={"username":"admin","password":PASSWORD},
                           headers={"Origin":"https://foreign.example"}).status_code == 403
    print("PASS: all eight public routes through built Next proxy; cookie, CAS, Origin and 12MiB paired upload")


if __name__ == "__main__":
    main()
