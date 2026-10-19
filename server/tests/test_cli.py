from datetime import datetime, timezone
import sys

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from pigweigh import cli
from pigweigh.db import Admin
from pigweigh.security import PASSWORDS


def test_cli_requires_prompt_and_creates_no_default(monkeypatch):
    monkeypatch.setattr(sys, "argv", ["pigweigh.cli", "create-admin", "--username", "otheradmin"])
    monkeypatch.setattr(sys.stdin, "isatty", lambda: False)
    with pytest.raises(SystemExit, match="interactive terminal"):
        cli.main()


def test_admin_bootstrap_and_duplicate_without_password_exposure(app, engine, monkeypatch, capsys):
    monkeypatch.setattr(sys, "argv", ["pigweigh.cli", "create-admin", "--username", "OtherAdmin"])
    monkeypatch.setattr(sys.stdin, "isatty", lambda: True)
    monkeypatch.setattr(cli, "getpass", lambda prompt: "bootstrap-test-only-password")
    cli.main()
    output = capsys.readouterr().out
    assert "Admin created" in output and "password" not in output
    with Session(engine) as db:
        admin = db.scalar(select(Admin).where(Admin.username == "otheradmin"))
        assert admin is not None and PASSWORDS.verify("bootstrap-test-only-password", admin.password_hash)
    with pytest.raises(SystemExit, match="Username already exists"):
        cli.main()
