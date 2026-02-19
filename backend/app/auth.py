"""
Authentication utilities: password hashing, JWT tokens, session handling.
"""
import os
import uuid
import jwt
from datetime import datetime, timedelta
from typing import Optional, Tuple, Any
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import User

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT settings
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))  # 24 hours

# OAuth2 scheme
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against a hash"""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash a password"""
    return pwd_context.hash(password)


def create_access_token(
    data: dict,
    expires_delta: Optional[timedelta] = None,
    session_id: Optional[str] = None,
) -> str:
    """Create a JWT access token. Optionally include session_id for unlocked DataSession."""
    to_encode = data.copy()
    if session_id is not None:
        to_encode["session_id"] = str(session_id)
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> Optional[dict]:
    """Decode and verify a JWT token"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.JWTError:
        return None


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    """Get the current authenticated user from JWT token"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception
    
    user_id: str = payload.get("sub")
    if user_id is None:
        raise credentials_exception
    
    # Handle both UUID objects and strings
    from app.db import DATABASE_URL
    if DATABASE_URL.startswith("sqlite"):
        user = db.query(User).filter(User.id == str(user_id)).first()
    else:
        import uuid
        user = db.query(User).filter(User.id == uuid.UUID(user_id)).first()
    
    if user is None:
        raise credentials_exception
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive"
        )
    
    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """Get current active user (alias for clarity)"""
    return current_user


def get_session_id_from_token(token: str) -> Optional[str]:
    """Extract session_id from JWT payload if present."""
    payload = decode_access_token(token)
    if not payload:
        return None
    return payload.get("session_id")


async def get_current_session(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> Tuple[User, Any]:
    """
    Require an unlocked DataSession: get user and session_id from JWT,
    look up session key in cache, set request-scoped cipher, return (user, data_session).
    """
    from app.models import DataSession
    from app.session_store import get_session_cipher as get_cached_cipher
    from app.encryption import set_session_cipher

    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user_id = payload.get("sub")
    session_id = payload.get("session_id")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    if not session_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No session selected. Unlock a session first."
        )

    if DATABASE_URL.startswith("sqlite"):
        user = db.query(User).filter(User.id == str(user_id)).first()
        data_session = db.query(DataSession).filter(
            DataSession.id == str(session_id),
            DataSession.user_id == user.id
        ).first() if user else None
    else:
        user = db.query(User).filter(User.id == uuid.UUID(str(user_id))).first()
        data_session = db.query(DataSession).filter(
            DataSession.id == uuid.UUID(str(session_id)),
            DataSession.user_id == user.id
        ).first() if user else None

    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")
    if not data_session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    cipher = get_cached_cipher(str(session_id))
    if not cipher:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Session locked or expired. Unlock the session again."
        )

    set_session_cipher(cipher)
    return (user, data_session)


def get_current_user_and_session():
    """Dependency that returns (user, data_session) - requires unlocked session."""
    return get_current_session
