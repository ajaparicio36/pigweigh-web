from collections import deque
import hashlib
import re
import threading
import time

from pwdlib import PasswordHash

PASSWORDS = PasswordHash.recommended()
USERNAME = re.compile(r"[a-z0-9_.-]{3,64}")
COOKIE = "pigweigh_session"


def normalize_username(value: str) -> str:
    result = value.strip().casefold()
    if not USERNAME.fullmatch(result):
        raise ValueError("Username must be 3-64 letters, digits, dots, underscores or hyphens")
    return result


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class LoginGuard:
    """Bound CPU/RAM and attempts without trusting client-provided forwarding headers."""
    def __init__(self):
        self.attempts: deque[float] = deque()
        self.lock = threading.Lock()
        self.hash_slots = threading.BoundedSemaphore(2)
        self.dummy_hash = PASSWORDS.hash("unused-random-dummy-verification-password")

    def admit(self) -> bool:
        # shortcut: process-local global limit; revisit before adding replicas/workers.
        now = time.monotonic()
        with self.lock:
            while self.attempts and self.attempts[0] < now - 60:
                self.attempts.popleft()
            if len(self.attempts) >= 20:
                return False
            self.attempts.append(now)
            return True
