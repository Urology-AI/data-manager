from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict
from uuid import UUID


class DatasetCreate(BaseModel):
    name: str
    source_filename: str
    stored_path: str
    data_type: Optional[str] = "generic"  # "epsa", "generic", "custom"


class DatasetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    name: str
    source_filename: str
    stored_path: str
    data_type: Optional[str] = "generic"
    column_map: Optional[Dict[str, str]] = None
    created_at: datetime
    patient_count: Optional[int] = 0  # Number of patients created from this dataset


class ColumnMappingRequest(BaseModel):
    column_map: Dict[str, str]  # Maps canonical_field -> csv_column
    create_extra_fields: Optional[Dict[str, str]] = None  # Maps csv_column -> custom_field_name for extra_fields


class DetectedColumnsResponse(BaseModel):
    columns: List[str]


class PatientCreate(BaseModel):
    dataset_id: UUID
    patient_key: str
    
    # Patient identification & demographics
    date_of_service: Optional[datetime] = None
    location: Optional[str] = None
    mrn: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    reason_for_visit: Optional[str] = None
    
    # Data fields
    points: Optional[float] = None
    percent: Optional[float] = None
    category: Optional[str] = None
    pca_confirmed: Optional[bool] = None
    gleason_grade: Optional[str] = None
    age_group: Optional[str] = None
    family_history: Optional[str] = None
    race: Optional[str] = None
    genetic_mutation: Optional[str] = None
    
    # Metadata
    raw: Optional[Dict[str, Any]] = None
    extra_fields: Optional[Dict[str, Any]] = None


class PatientUpdate(BaseModel):
    date_of_service: Optional[datetime] = None
    location: Optional[str] = None
    mrn: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    reason_for_visit: Optional[str] = None
    points: Optional[float] = None
    percent: Optional[float] = None
    category: Optional[str] = None
    pca_confirmed: Optional[bool] = None
    gleason_grade: Optional[str] = None
    age_group: Optional[str] = None
    family_history: Optional[str] = None
    race: Optional[str] = None
    genetic_mutation: Optional[str] = None
    extra_fields: Optional[Dict[str, Any]] = None  # For custom fields


class PatientResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    dataset_id: UUID
    patient_key: str
    
    # Patient identification & demographics
    date_of_service: Optional[datetime] = None
    location: Optional[str] = None
    mrn: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    reason_for_visit: Optional[str] = None
    
    # Data fields
    points: Optional[float] = None
    percent: Optional[float] = None
    category: Optional[str] = None
    pca_confirmed: Optional[bool] = None
    gleason_grade: Optional[str] = None
    age_group: Optional[str] = None
    family_history: Optional[str] = None
    race: Optional[str] = None
    genetic_mutation: Optional[str] = None
    
    # Metadata
    raw: Optional[Dict[str, Any]] = None
    extra_fields: Optional[Dict[str, Any]] = None
    
    created_at: datetime
    updated_at: datetime


class FillRequest(BaseModel):
    mode: str = Field(..., pattern="^(strict|impute|compute_bmi)$")
    patient_ids: Optional[List[UUID]] = None


class PaginatedResponse(BaseModel):
    items: List[Any]
    total: int
    page: int
    page_size: int
    pages: int


class ReprocessCheckResponse(BaseModel):
    """Response from re-process check showing missing columns and data"""
    unmapped_columns: List[str]  # Columns in file that aren't mapped
    extra_fields_columns: List[str]  # Columns currently stored in extra_fields
    missing_data_summary: Dict[str, Any]  # Summary of missing data per field
    total_rows_in_file: int
    total_patients_in_db: int
    rows_with_missing_data: List[Dict[str, Any]]  # Sample rows with missing data


# Authentication schemas
class UserRegister(BaseModel):
    email: str = Field(..., pattern=r'^[^@]+@[^@]+\.[^@]+$')
    password: str = Field(..., min_length=8)
    full_name: Optional[str] = None


class UserLogin(BaseModel):
    email: str
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    email: str
    full_name: Optional[str] = None
    is_active: bool
    is_verified: bool
    created_at: datetime


class PasswordResetRequest(BaseModel):
    email: str


class PasswordReset(BaseModel):
    token: str
    new_password: str = Field(..., min_length=8)


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8)


# Session-based login (email -> session + OTP -> verify OTP -> password -> access)
class SessionStartRequest(BaseModel):
    email: str = Field(..., pattern=r'^[^@]+@[^@]+\.[^@]+$')


class SessionStartResponse(BaseModel):
    session_id: str
    message: str = "Check your email for the verification code"


class VerifyOtpRequest(BaseModel):
    session_id: str
    otp: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")


class VerifyOtpResponse(BaseModel):
    verified: bool = True
    message: str = "Email verified. Signing you in..."


class CompleteLoginRequest(BaseModel):
    session_id: str


# DataSession: list sessions, create, unlock (each has its own encryption key)
class DataSessionCreate(BaseModel):
    name: str = Field(..., min_length=1)
    password: str = Field(..., min_length=8)


class DataSessionResponse(BaseModel):
    id: str
    name: str
    created_at: datetime


class UnlockSessionRequest(BaseModel):
    password: str
