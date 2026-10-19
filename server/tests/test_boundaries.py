import asyncio
from pigweigh.main import RequestBoundary
from conftest import ORIGIN
from test_api import pair, picture


def test_streamed_body_enforced_before_parser_without_content_length():
    reached = False
    async def downstream(scope, receive, send):
        nonlocal reached
        reached = True
    async def exercise():
        boundary = RequestBoundary(downstream, ORIGIN)
        chunks = iter([{"type":"http.request", "body": b"x" * (1024*1024), "more_body":True}] * 22)
        output = []
        async def receive():
            return next(chunks)
        async def send(value):
            output.append(value)
        await boundary({"type":"http", "method":"POST", "path":"/api/estimates",
                        "headers":[(b"origin", ORIGIN.encode())]}, receive, send)
        assert output[0]["status"] == 413
    asyncio.run(exercise())
    assert not reached


def test_upload_slots_are_bounded_and_released():
    entered = asyncio.Event()
    release = asyncio.Event()
    async def downstream(scope, receive, send):
        entered.set()
        await release.wait()
    async def exercise():
        boundary = RequestBoundary(downstream, ORIGIN)
        scope = {"type":"http", "method":"POST", "path":"/api/estimates", "headers":[(b"origin", ORIGIN.encode())]}
        async def receive():
            return {"type":"http.request", "body":b"", "more_body":False}
        output = []
        async def send(value):
            output.append(value)
        first = asyncio.create_task(boundary(scope, receive, send))
        second = asyncio.create_task(boundary(scope, receive, send))
        await entered.wait()
        await asyncio.sleep(0)
        await boundary(scope, receive, send)
        assert output[0]["status"] == 429
        release.set()
        await asyncio.gather(first, second)
        assert not boundary.upload_slots.locked()
    asyncio.run(exercise())


def test_malformed_multipart_and_extra_field_cleanup(client, monkeypatch):
    files = []
    import starlette.formparsers as parsers
    original = parsers.SpooledTemporaryFile
    def track(*args, **kwargs):
        file = original(*args, **kwargs)
        files.append(file)
        return file
    monkeypatch.setattr(parsers, "SpooledTemporaryFile", track)
    response = client.post("/api/estimates", headers={"Origin":ORIGIN}, files=pair(), data={"extra":"value"})
    assert response.status_code == 422
    assert all(file.closed for file in files)
    response = client.post("/api/estimates", headers={"Origin":ORIGIN, "Content-Type":"multipart/form-data; boundary=abc"},
                           content=b"not valid multipart")
    assert response.status_code == 422


def test_duplicate_pair_field_and_webp(client):
    response = client.post("/api/estimates", headers={"Origin":ORIGIN}, files=[
        ("top_image", ("top.jpg", picture())), ("top_image", ("top2.jpg", picture()))])
    assert response.status_code == 422
    response = client.post("/api/estimates", headers={"Origin":ORIGIN}, files=pair(top_image=("x.webp", picture("WEBP"))))
    assert response.status_code == 503


def test_hash_work_slots_are_bounded(client, app):
    guard = app.state.login_guard
    assert guard.hash_slots.acquire(blocking=False)
    assert guard.hash_slots.acquire(blocking=False)
    try:
        response = client.post("/api/auth/login", headers={"Origin":ORIGIN}, json={"username":"admin", "password":"test"})
        assert response.status_code == 429
    finally:
        guard.hash_slots.release()
        guard.hash_slots.release()
