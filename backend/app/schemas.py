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
