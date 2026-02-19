import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Float, DateTime, ForeignKey, JSON, Boolean, TypeDecorator
from sqlalchemy.dialects.postgresql import UUID as PostgresUUID
from sqlalchemy.orm import relationship
from app.db import Base, DATABASE_URL
from app.encryption import encrypt_phi, decrypt_phi


class EncryptedString(TypeDecorator):
    """SQLAlchemy type for encrypted PHI strings"""
    impl = String
    cache_ok = True
    
    def process_bind_param(self, value, dialect):
        """Encrypt value before storing in database"""
        if value is None:
            return None
        if isinstance(value, str) and value.strip():
            return encrypt_phi(value)
        return None
    
    def process_result_value(self, value, dialect):
        """Decrypt value after loading from database"""
        if value is None:
            return None
        if isinstance(value, str) and value.strip():
            return decrypt_phi(value)
        return None

# Use PostgreSQL UUID if available, otherwise use String for SQLite compatibility
if DATABASE_URL.startswith("sqlite"):
    UUIDType = String(36)  # Store UUID as string for SQLite
    def uuid_default():
        return str(uuid.uuid4())
else:
    UUIDType = PostgresUUID(as_uuid=True)
    def uuid_default():
        return uuid.uuid4()


class User(Base):
    __tablename__ = "users"

    id = Column(UUIDType, primary_key=True, default=uuid_default)
    email = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    verification_token = Column(String, nullable=True)
    reset_token = Column(String, nullable=True)
    reset_token_expires = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    datasets = relationship("Dataset", back_populates="user", cascade="all, delete-orphan")
    data_sessions = relationship("DataSession", back_populates="user", cascade="all, delete-orphan")


class LoginSession(Base):
    """
    Temporary login session for OTP flow only (email -> OTP -> JWT).
    Not the same as DataSession.
    """
    __tablename__ = "login_sessions"

    id = Column(UUIDType, primary_key=True, default=uuid_default)
    email = Column(String, nullable=False, index=True)
    otp_code = Column(String, nullable=False)
    otp_expires_at = Column(DateTime, nullable=False)
    email_verified_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class DataSession(Base):
    """
    User's data session: has its own encryption key. All data (datasets/patients)
    in this session are encrypted with this session's key. User unlocks with password.
    """
    __tablename__ = "data_sessions"

    id = Column(UUIDType, primary_key=True, default=uuid_default)
    user_id = Column(UUIDType, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String, nullable=False)  # e.g. "Clinical 2024"
    encrypted_encryption_key = Column(String, nullable=False)  # Fernet key encrypted with password-derived key
    key_salt = Column(String, nullable=False)  # salt for deriving key from password
    unlock_password_hash = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="data_sessions")
    datasets = relationship("Dataset", back_populates="data_session", cascade="all, delete-orphan")


class Dataset(Base):
    __tablename__ = "datasets"

    id = Column(UUIDType, primary_key=True, default=uuid_default)
    user_id = Column(UUIDType, ForeignKey("users.id"), nullable=False, index=True)
    session_id = Column(UUIDType, ForeignKey("data_sessions.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    source_filename = Column(String, nullable=False)
    stored_path = Column(String, nullable=False)
    data_type = Column(String, nullable=True, default="generic")  # e.g., "epsa", "generic", "custom"
    column_map = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="datasets")
    data_session = relationship("DataSession", back_populates="datasets")
    patients = relationship("Patient", back_populates="dataset", cascade="all, delete-orphan")


class Patient(Base):
    __tablename__ = "patients"

    id = Column(UUIDType, primary_key=True, default=uuid_default)
    dataset_id = Column(UUIDType, ForeignKey("datasets.id"), nullable=False)
    patient_key = Column(String, nullable=False)

    # Patient identification & demographics
    date_of_service = Column(DateTime, nullable=True)
    location = Column(String, nullable=True)
    
    # PHI fields - automatically encrypted/decrypted using EncryptedString type
    mrn = Column(EncryptedString, nullable=True)
    first_name = Column(EncryptedString, nullable=True)
    last_name = Column(EncryptedString, nullable=True)
    
    reason_for_visit = Column(String, nullable=True)
    
    # Data fields
    points = Column(Float, nullable=True)
    percent = Column(Float, nullable=True)
    category = Column(String, nullable=True)
    pca_confirmed = Column(Boolean, nullable=True)
    gleason_grade = Column(String, nullable=True)
    age_group = Column(String, nullable=True)
    family_history = Column(String, nullable=True)
    race = Column(String, nullable=True)
    genetic_mutation = Column(String, nullable=True)

    # Metadata
    raw = Column(JSON, nullable=True)
    extra_fields = Column(JSON, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    dataset = relationship("Dataset", back_populates="patients")
