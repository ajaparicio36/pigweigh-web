from datetime import datetime, timezone
import os
from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import text
from sqlalchemy.orm import Session

from pigweigh.config import Settings, database_url
from pigweigh.db import Admin, make_engine
from pigweigh.main import create_app
from pigweigh.security import PASSWORDS

ORIGIN = "http://localhost:3000"
PASSWORD = "test-only-password-123!"


@pytest.fixture(scope="session")
def settings():
    value = os.environ.get("PIGWEIGH_TEST_DATABASE_URL")
    if not value:
        pytest.fail("Set a task-owned PostgreSQL PIGWEIGH_TEST_DATABASE_URL; tests never fall back to SQLite")
    url = database_url(value)
    if (url.host != "127.0.0.1" or not url.port or url.port == 5432 or url.username != "pgtest"
            or not (url.database or "").startswith("pigweigh_test_")
            or os.environ.get("PIGWEIGH_TEST_ALLOW_RESET") != url.database):
        pytest.fail("Refusing unsafe PostgreSQL test target; require isolated loopback port, pgtest user, test DB and reset opt-in")
    return Settings(url, ORIGIN)


@pytest.fixture(scope="session")
def engine(settings):
    previous = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = settings.database.render_as_string(hide_password=False)
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    engine = make_engine(settings)
    command.upgrade(config, "head")
    # Initial migration reversibility is proved only against the explicitly owned test DB.
    command.downgrade(config, "base")
    with engine.connect() as conn:
        assert conn.execute(text("SELECT to_regclass('public.admin')")).scalar() is None
    command.upgrade(config, "head")
    yield engine
    engine.dispose()
    if previous is None:
        os.environ.pop("DATABASE_URL", None)
    else:
        os.environ["DATABASE_URL"] = previous


@pytest.fixture(scope="session")
def password_hash():
    return PASSWORDS.hash(PASSWORD)


@pytest.fixture
def app(settings, engine, password_hash):
    with engine.begin() as conn:
        conn.execute(text('TRUNCATE price_state, price_record, session, admin RESTART IDENTITY CASCADE'))
        conn.execute(text('INSERT INTO price_state(id, revision) VALUES (1, 0)'))
    with Session(engine) as db:
        db.add(Admin(username="admin", password_hash=password_hash, disabled=False,
                     created_at=datetime.now(timezone.utc)))
        db.commit()
    application = create_app(settings)
    yield application
    application.state.engine.dispose()


@pytest.fixture
def client(app):
    with TestClient(app, raise_server_exceptions=False) as value:
        yield value


def login(client):
    result = client.post("/api/auth/login", headers={"Origin": ORIGIN},
                         json={"username": "admin", "password": PASSWORD})
    assert result.status_code == 200, result.text
    return result
