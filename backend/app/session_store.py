"""
In-memory cache of unlocked DataSession encryption keys.
Helpers to encrypt/decrypt the session key with a password-derived key.
"""
import os
import base64
import secrets
import logging
from datetime import datetime, timedelta
from typing import Optional, Tuple
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

logger = logging.getLogger(__name__)

UNLOCK_TTL_HOURS = 24
PBKDF2_ITERATIONS = 100000

_session_key_cache: dict[str, dict] = {}


def _derive_key_from_password(password: str, salt: bytes) -> bytes:
    """Derive a 32-byte key from password and salt for encrypting the session key."""
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=PBKDF2_ITERATIONS,
    )
    return base64.urlsafe_b64encode(kdf.derive(password.encode("utf-8")))


def generate_session_key_encrypted(password: str) -> Tuple[str, str, bytes]:
    """
    Generate a new Fernet key for a DataSession and encrypt it with the password.
    Returns (encrypted_key_b64, salt_b64, raw_fernet_key_bytes).
    """
    raw_key = Fernet.generate_key()
    salt = secrets.token_bytes(16)
    derived = _derive_key_from_password(password, salt)
    cipher = Fernet(derived)
    encrypted = cipher.encrypt(raw_key)
    return base64.urlsafe_b64encode(encrypted).decode("utf-8"), base64.urlsafe_b64encode(salt).decode("utf-8"), raw_key


def decrypt_session_key(password: str, encrypted_key_b64: str, salt_b64: str) -> bytes:
    """Decrypt the session's encryption key using the unlock password."""
    salt = base64.urlsafe_b64decode(salt_b64.encode("utf-8"))
    derived = _derive_key_from_password(password, salt)
    cipher = Fernet(derived)
    encrypted = base64.urlsafe_b64decode(encrypted_key_b64.encode("utf-8"))
    return cipher.decrypt(encrypted)


def put_session_key(session_id: str, fernet_key_bytes: bytes) -> None:
    """Store decrypted session key in cache (as Fernet instance)."""
    cipher = Fernet(fernet_key_bytes)
    _session_key_cache[str(session_id)] = {
        "cipher": cipher,
        "expires_at": datetime.utcnow() + timedelta(hours=UNLOCK_TTL_HOURS),
    }
    logger.debug(f"Session key cached for session {session_id}")


def get_session_cipher(session_id: str) -> Optional[Fernet]:
    """Get Fernet cipher for session from cache if present and not expired."""
    sid = str(session_id)
    if sid not in _session_key_cache:
        return None
    entry = _session_key_cache[sid]
    if datetime.utcnow() > entry["expires_at"]:
        del _session_key_cache[sid]
        return None
    return entry["cipher"]


def clear_session_key(session_id: str) -> None:
    """Remove session key from cache (e.g. on lock)."""
    _session_key_cache.pop(str(session_id), None)
