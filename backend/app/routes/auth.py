"""
Authentication routes: register, login, password reset, email verification.
Session-based login flow: email -> create session (encryption key + OTP) -> verify OTP -> password -> access.
"""
import uuid
import secrets
import logging
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from app.db import get_db, DATABASE_URL
from app.models import User, LoginSession, DataSession
from app.schemas import (
    UserRegister, UserLogin, Token, UserResponse,
    PasswordResetRequest, PasswordReset, PasswordChange,
    SessionStartRequest, SessionStartResponse,
    VerifyOtpRequest, VerifyOtpResponse,
    CompleteLoginRequest,
    DataSessionCreate, DataSessionResponse,
    UnlockSessionRequest,
)
from app.session_store import (
    generate_session_key_encrypted,
    decrypt_session_key,
    put_session_key,
)
from app.auth import (
    verify_password, get_password_hash, create_access_token,
    get_current_active_user
)
from app.email_service import send_password_reset_email, send_verification_email
from app.firebase_service import send_firebase_otp

logger = logging.getLogger(__name__)
router = APIRouter()

OTP_EXPIRY_MINUTES = 10


def _session_id_to_uuid(session_id: str):
    if DATABASE_URL.startswith("sqlite"):
        return session_id
    try:
        return uuid.UUID(session_id)
    except (ValueError, TypeError):
        return None


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserRegister, db: Session = Depends(get_db)):
    """Register a new user"""
    # Check if user already exists
    existing_user = db.query(User).filter(User.email == user_data.email.lower()).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Create verification token
    verification_token = secrets.token_urlsafe(32)
    
    # Create new user
    new_user = User(
        email=user_data.email.lower(),
        hashed_password=get_password_hash(user_data.password),
        full_name=user_data.full_name,
        is_active=True,
        is_verified=False,
        verification_token=verification_token
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    # Send verification email
    await send_verification_email(new_user.email, verification_token)
    
    logger.info(f"New user registered: {new_user.email}")
    
    return new_user


@router.post("/login", response_model=Token)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """Login and get access token"""
    # Find user by email
    user = db.query(User).filter(User.email == form_data.username.lower()).first()
    
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive"
        )
    
    # Create access token
    from app.db import DATABASE_URL
    user_id = str(user.id) if DATABASE_URL.startswith("sqlite") else str(user.id)
    
    access_token = create_access_token(data={"sub": user_id})
    
    logger.info(f"User logged in: {user.email}")
    
    return {"access_token": access_token, "token_type": "bearer"}


# --- Session-based login: email -> session (key + OTP) -> verify OTP -> password -> access ---

@router.post("/session/start", response_model=SessionStartResponse)
async def start_login_session(
    body: SessionStartRequest,
    db: Session = Depends(get_db)
):
    """
    Step 1: User enters email. Create session, generate encryption key, send OTP to email.
    """
    email = body.email.lower().strip()
    # Require user to exist (login only for registered users)
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No account found with this email. Please register first."
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive"
        )

    session = LoginSession(email=email)
    db.add(session)
    db.commit()
    db.refresh(session)

    session_id = str(session.id)
    sent = send_firebase_otp(email)
    if not sent:
        logger.warning("Firebase sign-in link not sent (check service account key)")

    logger.info(f"Login session started for {email}")
    return SessionStartResponse(
        session_id=session_id,
        message="Check your email for the verification code."
    )


@router.post("/session/verify-link", response_model=VerifyOtpResponse)
async def verify_login_link(
    body: VerifyOtpRequest, # This will need to be adapted for Firebase link verification
    db: Session = Depends(get_db)
):
    """
    Step 2: User clicks link from email. Verify and mark session as email_verified.
    This endpoint will need to be adapted to handle the Firebase sign-in link.
    For now, it will just mark the session as verified.
    """
    sid = _session_id_to_uuid(body.session_id)
    if sid is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid session")

    session = db.query(LoginSession).filter(LoginSession.id == sid).first()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired session. Please start again with your email."
        )

    session.email_verified_at = datetime.utcnow()
    db.commit()
    logger.info(f"Email verified for session {body.session_id}")
    return VerifyOtpResponse(verified=True, message="Email verified. Enter your password.")


@router.post("/session/complete", response_model=Token)
async def complete_login(
    body: CompleteLoginRequest,
    db: Session = Depends(get_db)
):
    """
    Step 3: After OTP verified, complete login. Returns JWT (no session_id yet).
    User must then list sessions and unlock one to access data.
    """
    sid = _session_id_to_uuid(body.session_id)
    if sid is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid session")

    session = db.query(LoginSession).filter(LoginSession.id == sid).first()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired session. Please start again with your email."
        )
    if not session.email_verified_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please verify your email with the code first."
        )

    user = db.query(User).filter(User.email == session.email).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User not found or inactive")

    user_id = str(user.id)
    access_token = create_access_token(data={"sub": user_id})  # No session_id yet
    logger.info(f"User logged in via OTP: {user.email}")
    return {"access_token": access_token, "token_type": "bearer"}


# --- DataSession: list, create, unlock (each session has its own encryption key) ---

@router.get("/data-sessions", response_model=list[DataSessionResponse])
async def list_data_sessions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """List all data sessions for the current user."""
    sessions = db.query(DataSession).filter(DataSession.user_id == current_user.id).order_by(DataSession.created_at.desc()).all()
    return [
        DataSessionResponse(id=str(s.id), name=s.name, created_at=s.created_at)
        for s in sessions
    ]


@router.post("/data-sessions", response_model=DataSessionResponse, status_code=status.HTTP_201_CREATED)
async def create_data_session(
    body: DataSessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Create a new data session with a name and unlock password. Generates a dedicated encryption key for this session."""
    encrypted_key_b64, salt_b64, _ = generate_session_key_encrypted(body.password)
    session = DataSession(
        user_id=current_user.id,
        name=body.name.strip(),
        encrypted_encryption_key=encrypted_key_b64,
        key_salt=salt_b64,
        unlock_password_hash=get_password_hash(body.password),
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    logger.info(f"DataSession created: {session.name} for user {current_user.email}")
    return DataSessionResponse(id=str(session.id), name=session.name, created_at=session.created_at)


@router.post("/data-sessions/{session_id}/unlock", response_model=Token)
async def unlock_data_session(
    session_id: str,
    body: UnlockSessionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Unlock a data session with password. Puts session key in cache and returns new JWT with session_id. Use this session to access data."""
    sid = _session_id_to_uuid(session_id)
    if sid is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid session id")

    data_session = db.query(DataSession).filter(
        DataSession.id == sid,
        DataSession.user_id == current_user.id
    ).first()
    if not data_session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    if not verify_password(body.password, data_session.unlock_password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect password")

    try:
        raw_key = decrypt_session_key(
            body.password,
            data_session.encrypted_encryption_key,
            data_session.key_salt,
        )
    except Exception as e:
        logger.error(f"Failed to decrypt session key: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to unlock session")

    put_session_key(str(data_session.id), raw_key)
    user_id = str(current_user.id)
    access_token = create_access_token(data={"sub": user_id}, session_id=str(data_session.id))
    logger.info(f"Session unlocked: {data_session.name} for user {current_user.email}")
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/login-json", response_model=Token)
async def login_json(user_data: UserLogin, db: Session = Depends(get_db)):
    """Login using JSON body (alternative to OAuth2 form)"""
    user = db.query(User).filter(User.email == user_data.email.lower()).first()
    
    if not user or not verify_password(user_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive"
        )
    
    from app.db import DATABASE_URL
    user_id = str(user.id) if DATABASE_URL.startswith("sqlite") else str(user.id)
    
    access_token = create_access_token(data={"sub": user_id})
    
    logger.info(f"User logged in: {user.email}")
    
    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: User = Depends(get_current_active_user)
):
    """Get current user information"""
    return current_user


@router.post("/forgot-password")
async def forgot_password(
    request: PasswordResetRequest,
    db: Session = Depends(get_db)
):
    """Request password reset"""
    user = db.query(User).filter(User.email == request.email.lower()).first()
    
    # Don't reveal if email exists (security best practice)
    if user:
        reset_token = secrets.token_urlsafe(32)
        user.reset_token = reset_token
        user.reset_token_expires = datetime.utcnow() + timedelta(hours=1)
        db.commit()
        
        await send_password_reset_email(user.email, reset_token)
        logger.info(f"Password reset requested for: {user.email}")
    
    return {"message": "If the email exists, a password reset link has been sent"}


@router.post("/reset-password")
async def reset_password(
    reset_data: PasswordReset,
    db: Session = Depends(get_db)
):
    """Reset password using token"""
    user = db.query(User).filter(User.reset_token == reset_data.token).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token"
        )
    
    if not user.reset_token_expires or user.reset_token_expires < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset token has expired"
        )
    
    # Update password
    user.hashed_password = get_password_hash(reset_data.new_password)
    user.reset_token = None
    user.reset_token_expires = None
    db.commit()
    
    logger.info(f"Password reset successful for: {user.email}")
    
    return {"message": "Password reset successfully"}


@router.post("/change-password")
async def change_password(
    password_data: PasswordChange,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Change password (requires current password)"""
    if not verify_password(password_data.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect"
        )
    
    current_user.hashed_password = get_password_hash(password_data.new_password)
    db.commit()
    
    logger.info(f"Password changed for: {current_user.email}")
    
    return {"message": "Password changed successfully"}


@router.get("/verify-email")
async def verify_email(
    token: str,
    db: Session = Depends(get_db)
):
    """Verify email address"""
    user = db.query(User).filter(User.verification_token == token).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid verification token"
        )
    
    if user.is_verified:
        return {"message": "Email already verified"}
    
    user.is_verified = True
    user.verification_token = None
    db.commit()
    
    logger.info(f"Email verified for: {user.email}")
    
    return {"message": "Email verified successfully"}


@router.post("/resend-verification")
async def resend_verification(
    request: PasswordResetRequest,  # Reuse schema for email
    db: Session = Depends(get_db)
):
    """Resend verification email"""
    user = db.query(User).filter(User.email == request.email.lower()).first()
    
    if not user:
        # Don't reveal if email exists
        return {"message": "If the email exists, a verification email has been sent"}
    
    if user.is_verified:
        return {"message": "Email already verified"}
    
    # Generate new verification token
    verification_token = secrets.token_urlsafe(32)
    user.verification_token = verification_token
    db.commit()
    
    await send_verification_email(user.email, verification_token)
    
    return {"message": "Verification email sent"}
