import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def new_session_token() -> tuple[str, str]:
    """Return (cookie value, stored hash). Only the hash is persisted."""
    raw = secrets.token_urlsafe(32)
    return raw, hash_token(raw)


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def session_expiry(days: int) -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=days)


def normalize_username(username: str) -> str:
    return username.strip().casefold()


def valid_username(username: str) -> bool:
    value = username.strip()
    if not 3 <= len(value) <= 32:
        return False
    if value.startswith((".", "-", "_")) or value.endswith((".", "-", "_")):
        return False
    return all(char.isalnum() or char in "_.-" for char in value)
