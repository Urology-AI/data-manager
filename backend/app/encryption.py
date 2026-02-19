"""
HIPAA-compliant encryption service for PHI (Protected Health Information).
Encrypts sensitive fields: MRN, first_name, last_name at rest.
Supports per-session encryption: when a DataSession is unlocked, its key is used for that session's data.
"""
import os
import base64
import logging
from contextvars import ContextVar
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

logger = logging.getLogger(__name__)

# Request-scoped session cipher: when set, encrypt_phi/decrypt_phi use this for the current request
_current_session_cipher: ContextVar[Fernet | None] = ContextVar("session_cipher", default=None)


def set_session_cipher(cipher: Fernet | None) -> None:
    """Set the Fernet cipher for the current request (used when a DataSession is unlocked)."""
    _current_session_cipher.set(cipher)


def get_session_cipher() -> Fernet | None:
    """Get the request-scoped session cipher if set."""
    return _current_session_cipher.get()

# Get encryption key from environment variable
ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY")

if not ENCRYPTION_KEY:
    # Generate a key if not provided (for development only - MUST be set in production)
    logger.warning("⚠️  ENCRYPTION_KEY not set! Generating a temporary key. THIS IS NOT SECURE FOR PRODUCTION!")
    ENCRYPTION_KEY = Fernet.generate_key().decode()
    logger.warning(f"⚠️  Generated key: {ENCRYPTION_KEY}")
    logger.warning("⚠️  Set ENCRYPTION_KEY environment variable for production!")

# Initialize Fernet cipher
try:
    if isinstance(ENCRYPTION_KEY, str):
        # If key is provided as string, encode it
        if len(ENCRYPTION_KEY) == 44 and ENCRYPTION_KEY.endswith('='):
            # Looks like a base64 Fernet key
            cipher_suite = Fernet(ENCRYPTION_KEY.encode())
        else:
            # Derive key from password using PBKDF2
            kdf = PBKDF2HMAC(
                algorithm=hashes.SHA256(),
                length=32,
                salt=b'data_manager_salt',  # In production, use a random salt stored securely
                iterations=100000,
            )
            key = base64.urlsafe_b64encode(kdf.derive(ENCRYPTION_KEY.encode()))
            cipher_suite = Fernet(key)
    else:
        cipher_suite = Fernet(ENCRYPTION_KEY)
except Exception as e:
    logger.error(f"Failed to initialize encryption: {e}")
    raise


def encrypt_phi(data: str) -> str:
    """
    Encrypt Protected Health Information (PHI).
    Uses session cipher if set (unlocked DataSession), else global cipher.
    """
    if data is None:
        return None
    if not isinstance(data, str):
        data = str(data)
    if not data.strip():
        return None
    suite = get_session_cipher() or cipher_suite
    try:
        encrypted_bytes = suite.encrypt(data.encode('utf-8'))
        return base64.urlsafe_b64encode(encrypted_bytes).decode('utf-8')
    except Exception as e:
        logger.error(f"Encryption failed: {e}")
        raise ValueError(f"Failed to encrypt PHI data: {e}")


def decrypt_phi(encrypted_data: str) -> str:
    """
    Decrypt Protected Health Information (PHI).
    
    Args:
        encrypted_data: Base64-encoded encrypted string
    
    Returns:
        Plaintext PHI data
    """
    if encrypted_data is None:
        return None
    
    if not isinstance(encrypted_data, str):
        return None
    
    if not encrypted_data.strip():
        return None
    
    suite = get_session_cipher() or cipher_suite
    try:
        try:
            decoded_bytes = base64.urlsafe_b64decode(encrypted_data.encode('utf-8'))
            decrypted_bytes = suite.decrypt(decoded_bytes)
            return decrypted_bytes.decode('utf-8')
        except Exception:
            logger.warning(f"Decryption failed, assuming plaintext: {encrypted_data[:20]}...")
            return encrypted_data
    except Exception as e:
        logger.error(f"Decryption failed: {e}")
        # Return None instead of raising to prevent breaking the app
        return None


def is_encrypted(data: str) -> bool:
    """
    Check if data appears to be encrypted.
    
    Args:
        data: Data to check
    
    Returns:
        True if data appears encrypted, False otherwise
    """
    if not data or not isinstance(data, str):
        return False
    
    try:
        # Encrypted data should be base64 and longer than plaintext
        base64.urlsafe_b64decode(data.encode('utf-8'))
        # If it's valid base64 and reasonably long, assume encrypted
        return len(data) > 20
    except Exception:
        return False
