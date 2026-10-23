from dataclasses import dataclass
import os
from urllib.parse import urlsplit
from pathlib import Path

from sqlalchemy.engine import URL, make_url


def database_url(value: str) -> URL:
    try:
        url = make_url(value)
    except Exception:
        raise ValueError("DATABASE_URL must be a PostgreSQL connection URL") from None
    if url.drivername not in {"postgres", "postgresql", "postgresql+psycopg"}:
        raise ValueError("Only PostgreSQL with Psycopg is supported")
    return url.set(drivername="postgresql+psycopg")


@dataclass(frozen=True)
class Settings:
    database: URL
    public_origin: str
    model_bundle: Path | None = None

    @classmethod
    def from_env(cls) -> "Settings":
        value = os.environ.get("DATABASE_URL")
        if not value:
            raise ValueError("DATABASE_URL is required")
        origin = os.environ.get("PUBLIC_ORIGIN", "http://localhost:3000")
        parsed = urlsplit(origin)
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.hostname
            or parsed.username is not None
            or parsed.password is not None
            or parsed.path or parsed.query or parsed.fragment
            or (parsed.scheme == "http" and parsed.hostname not in {"localhost", "127.0.0.1", "::1"})
        ):
            raise ValueError("PUBLIC_ORIGIN must be an HTTPS origin or local HTTP origin, without a trailing slash")
        bundle = os.environ.get("PIGWEIGH_MODEL_BUNDLE")
        return cls(database_url(value), origin, Path(bundle) if bundle else None)

    @property
    def secure_cookie(self) -> bool:
        return self.public_origin.startswith("https://")
