import argparse
from datetime import datetime, timezone
from getpass import getpass
import sys

from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from pigweigh.config import Settings
from pigweigh.db import Admin, make_engine
from pigweigh.security import PASSWORDS, normalize_username


def main() -> None:
    parser = argparse.ArgumentParser(description="PigWeigh admin provisioning")
    parser.add_argument("command", choices=["create-admin"])
    parser.add_argument("--username", required=True)
    args = parser.parse_args()
    if not sys.stdin.isatty():
        sys.exit("Run admin provisioning in an interactive terminal")
    try:
        username = normalize_username(args.username)
        password = getpass("Password (12-128 characters): ")
        confirmation = getpass("Confirm password: ")
        if not 12 <= len(password) <= 128 or password != confirmation:
            raise ValueError("Passwords must match and contain 12-128 characters")
        engine = make_engine(Settings.from_env())
        try:
            with Session(engine) as session:
                session.add(Admin(username=username, password_hash=PASSWORDS.hash(password),
                                  disabled=False, created_at=datetime.now(timezone.utc)))
                session.commit()
        finally:
            engine.dispose()
    except IntegrityError:
        sys.exit("Username already exists")
    except SQLAlchemyError:
        sys.exit("Database operation failed; check connectivity and migrations")
    except ValueError as exc:
        sys.exit(str(exc))
    print("Admin created")


if __name__ == "__main__":
    main()
