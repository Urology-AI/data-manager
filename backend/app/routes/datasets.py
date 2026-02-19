import csv
import uuid
import shutil
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import Dataset, Patient, User, DataSession
from app.auth import get_current_session
from typing import Tuple
from app.schemas import DatasetResponse, ColumnMappingRequest, DetectedColumnsResponse, PatientCreate, ReprocessCheckResponse
from app.data.column_matcher import suggest_column_mappings, auto_map_columns

logger = logging.getLogger(__name__)
router = APIRouter()


def get_user_dataset(dataset_id: uuid.UUID, db: Session, user: User, data_session: DataSession) -> Dataset:
    """Get a dataset and verify it belongs to the current user and current session."""
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    from app.db import DATABASE_URL
    if DATABASE_URL.startswith("sqlite"):
        if str(dataset.user_id) != str(user.id) or str(dataset.session_id) != str(data_session.id):
            raise HTTPException(status_code=403, detail="Access denied")
    else:
        if dataset.user_id != user.id or dataset.session_id != data_session.id:
            raise HTTPException(status_code=403, detail="Access denied")
    return dataset

# Try to import dateutil parser for flexible date parsing
try:
    from dateutil import parser as date_parser
    DATEUTIL_AVAILABLE = True
except ImportError:
    DATEUTIL_AVAILABLE = False
    logger.warning("python-dateutil not available. Date parsing will be limited to common formats.")


def parse_date_string(date_str: str) -> Optional[datetime]:
    """Parse various date string formats into datetime object"""
    if not date_str or not isinstance(date_str, str):
        return None
    
    date_str = date_str.strip()
    if not date_str:
        return None
    
    # Try common date formats first
    date_formats = [
        '%m/%d/%Y',      # 3/10/2025 or 03/10/2025
        '%m-%d-%Y',      # 3-10-2025
        '%d/%m/%Y',      # 10/3/2025 (European)
        '%d-%m-%Y',      # 10-3-2025
        '%Y-%m-%d',      # 2025-03-10 (ISO)
        '%Y/%m/%d',      # 2025/03/10
        '%m/%d/%y',      # 3/10/25
        '%d/%m/%y',      # 10/3/25
        '%Y-%m-%d %H:%M:%S',  # ISO with time
        '%m/%d/%Y %H:%M:%S',  # US format with time
    ]
    
    # Try parsing with specific formats first
    for fmt in date_formats:
        try:
            return datetime.strptime(date_str, fmt)
        except ValueError:
            continue
    
    # Fallback to dateutil parser if available (handles many formats)
    if DATEUTIL_AVAILABLE:
        try:
            return date_parser.parse(date_str)
        except (ValueError, TypeError):
            logger.warning(f"Could not parse date string: {date_str}")
            return None
    else:
        logger.warning(f"Could not parse date string (dateutil not available): {date_str}")
        return None

# Upload directory
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

# Try to import pandas for Excel support
try:
    import pandas as pd
    PANDAS_AVAILABLE = True
except ImportError:
    PANDAS_AVAILABLE = False


@router.post("/upload", response_model=DatasetResponse)
async def upload_dataset(
    file: UploadFile = File(...),
    data_type: str = Query("generic", description="Type of data: 'epsa', 'generic', or 'custom'"),
    db: Session = Depends(get_db),
    session_context: Tuple[User, DataSession] = Depends(get_current_session),
):
    current_user, data_session = session_context
    """Upload a CSV or Excel dataset file. Select data type to use appropriate column matching."""
    # Validate file type
    filename_lower = file.filename.lower()
    is_excel = filename_lower.endswith('.xlsx') or filename_lower.endswith('.xls')
    is_csv = filename_lower.endswith('.csv')
    
    if not (is_csv or is_excel):
        raise HTTPException(
            status_code=400,
            detail=f"File must be CSV or Excel (.csv, .xlsx, .xls). Got: {file.filename}"
        )
    
    try:
        # Save file
        file_id = str(uuid.uuid4())
        file_path = UPLOAD_DIR / f"{file_id}_{file.filename}"
        
        # Ensure upload directory exists
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Read file to detect columns
        columns = []
        if is_excel:
            if not PANDAS_AVAILABLE:
                raise HTTPException(
                    status_code=400,
                    detail="Excel file support requires pandas. Please install: pip install pandas openpyxl"
                )
            # Read Excel file
            try:
                df = pd.read_excel(file_path, nrows=0)  # Read only headers
                columns = df.columns.tolist()
            except Exception as e:
                raise HTTPException(
                    status_code=400,
                    detail=f"Could not read Excel file: {str(e)}"
                )
        else:
            # Read CSV file
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    reader = csv.DictReader(f)
                    columns = reader.fieldnames or []
            except UnicodeDecodeError:
                # Try with different encoding
                try:
                    with open(file_path, "r", encoding="latin-1") as f:
                        reader = csv.DictReader(f)
                        columns = reader.fieldnames or []
                except Exception as e:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Could not read CSV file: {str(e)}"
                    )
        
        if not columns:
            raise HTTPException(
                status_code=400,
                detail="File appears to be empty or invalid"
            )
        
        # Create dataset record (scoped to current unlocked session)
        dataset = Dataset(
            user_id=current_user.id,
            session_id=data_session.id,
            name=file.filename,
            source_filename=file.filename,
            stored_path=str(file_path),
            data_type=data_type
        )
        db.add(dataset)
        db.commit()
        db.refresh(dataset)
        
        return dataset
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error uploading file: {str(e)}"
        )


@router.get("/{dataset_id}/columns", response_model=DetectedColumnsResponse)
async def get_dataset_columns(
    dataset_id: uuid.UUID,
    db: Session = Depends(get_db),
    session_context: Tuple[User, DataSession] = Depends(get_current_session),
):
    """Get detected columns from uploaded CSV/Excel file"""
    current_user, data_session = session_context
    dataset = get_user_dataset(dataset_id, db, current_user, data_session)
    
    file_path = Path(dataset.stored_path)
    filename_lower = file_path.name.lower()
    is_excel = filename_lower.endswith('.xlsx') or filename_lower.endswith('.xls')
    
    columns = []
    if is_excel:
        if not PANDAS_AVAILABLE:
            raise HTTPException(
                status_code=400,
                detail="Excel file support requires pandas. Please install: pip install pandas openpyxl"
            )
        try:
            df = pd.read_excel(file_path, nrows=0)
            columns = df.columns.tolist()
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Could not read Excel file: {str(e)}")
    else:
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                columns = list(reader.fieldnames or [])
        except UnicodeDecodeError:
            try:
                with open(file_path, "r", encoding="latin-1") as f:
                    reader = csv.DictReader(f)
                    columns = list(reader.fieldnames or [])
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Could not read CSV file: {str(e)}")
    
    return DetectedColumnsResponse(columns=columns)


@router.get("/{dataset_id}/suggest-mappings")
async def suggest_column_mappings_endpoint(
    dataset_id: uuid.UUID,
    db: Session = Depends(get_db),
    session_context: Tuple[User, DataSession] = Depends(get_current_session),
):
    """Intelligently suggest column mappings based on column names"""
    current_user, data_session = session_context
    dataset = get_user_dataset(dataset_id, db, current_user, data_session)
    
    # Get columns
    file_path = Path(dataset.stored_path)
    filename_lower = file_path.name.lower()
    is_excel = filename_lower.endswith('.xlsx') or filename_lower.endswith('.xls')
    
    columns = []
    if is_excel:
        if not PANDAS_AVAILABLE:
            raise HTTPException(
                status_code=400,
                detail="Excel file support requires pandas. Please install: pip install pandas openpyxl"
            )
        try:
            df = pd.read_excel(file_path, nrows=0)
            columns = df.columns.tolist()
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Could not read Excel file: {str(e)}")
    else:
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                columns = list(reader.fieldnames or [])
        except UnicodeDecodeError:
            try:
                with open(file_path, "r", encoding="latin-1") as f:
                    reader = csv.DictReader(f)
                    columns = list(reader.fieldnames or [])
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Could not read CSV file: {str(e)}")
    
    # Get existing mapping if any
    existing_mapping = dataset.column_map or {}
    
    # Get suggestions based on dataset data_type
    data_type = dataset.data_type or "generic"
    raw_suggestions = suggest_column_mappings(columns, existing_mapping, data_type=data_type)
    
    # Convert suggestions from tuples to dict format expected by frontend
    suggestions = {}
    for field_name, (csv_col, score) in raw_suggestions.items():
        suggestions[field_name] = {
            "column": csv_col,
            "confidence": float(score) if not (score != score) else 0.0  # Handle NaN
        }
    
    # SIMPLE: Auto-map ALL matches - match CSV columns to DB schema fields automatically
    data_type = dataset.data_type or "generic"
    auto_mapped = auto_map_columns(columns, existing_mapping, min_confidence=0.0, data_type=data_type)
    
    return {
        "columns": columns,
        "suggestions": suggestions,
        "auto_mapped": auto_mapped
    }


@router.post("/{dataset_id}/map", response_model=dict)
async def map_columns(
    dataset_id: uuid.UUID,
    mapping: ColumnMappingRequest,
    db: Session = Depends(get_db),
    session_context: Tuple[User, DataSession] = Depends(get_current_session),
):
    """Map CSV/Excel columns to canonical fields and create patient records"""
    current_user, data_session = session_context
    dataset = get_user_dataset(dataset_id, db, current_user, data_session)
    
    # Validate mapping is not empty
    if not mapping.column_map or len(mapping.column_map) == 0:
        raise HTTPException(
            status_code=400,
            detail="Column mapping is empty. Please map at least one CSV column to a canonical field."
        )
    
    file_path = Path(dataset.stored_path)
    filename_lower = file_path.name.lower()
    is_excel = filename_lower.endswith('.xlsx') or filename_lower.endswith('.xls')
    
    # Get available columns first to validate mappings
    available_columns = []
    if is_excel:
        if not PANDAS_AVAILABLE:
            raise HTTPException(
                status_code=400,
                detail="Excel file support requires pandas. Please install: pip install pandas openpyxl"
            )
        try:
            df = pd.read_excel(file_path, nrows=0)
            available_columns = df.columns.tolist()
        except Exception as e:
            logger.error(f"Error reading Excel headers: {e}", exc_info=True)
            raise HTTPException(
                status_code=400,
                detail=f"Could not read Excel file headers: {str(e)}"
            )
    else:
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                available_columns = list(reader.fieldnames or [])
        except UnicodeDecodeError:
            try:
                with open(file_path, "r", encoding="latin-1") as f:
                    reader = csv.DictReader(f)
                    available_columns = list(reader.fieldnames or [])
            except Exception as e:
                logger.error(f"Error reading CSV headers: {e}", exc_info=True)
                raise HTTPException(
                    status_code=400,
                    detail=f"Could not read CSV file headers: {str(e)}"
                )
        except Exception as e:
            logger.error(f"Error reading CSV headers: {e}", exc_info=True)
            raise HTTPException(
                status_code=400,
                detail=f"Could not read CSV file headers: {str(e)}"
            )
    
    # Validate that all mapped columns exist in the file
    invalid_columns = []
    for canonical_field, csv_column in mapping.column_map.items():
        if csv_column and csv_column not in available_columns:
            invalid_columns.append(f"{canonical_field} -> {csv_column}")
    
    if invalid_columns:
        raise HTTPException(
            status_code=400,
            detail=f"The following mapped columns do not exist in the file: {', '.join(invalid_columns)}. Available columns: {', '.join(available_columns)}"
        )
    
    # Read file and process rows (reuse available_columns we already read)
    patients_created = 0
    patients_updated = 0
    
    if is_excel:
        # Read full Excel file
        try:
            df = pd.read_excel(file_path)
            rows = df.to_dict('records')
        except Exception as e:
            logger.error(f"Error reading Excel file: {e}", exc_info=True)
            raise HTTPException(
                status_code=400,
                detail=f"Could not read Excel file: {str(e)}"
            )
    else:
        # Read full CSV file
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                rows = list(reader)
        except UnicodeDecodeError:
            try:
                with open(file_path, "r", encoding="latin-1") as f:
                    reader = csv.DictReader(f)
                    rows = list(reader)
            except Exception as e:
                logger.error(f"Error reading CSV file with latin-1 encoding: {e}", exc_info=True)
                raise HTTPException(
                    status_code=400,
                    detail=f"Could not read CSV file: {str(e)}"
                )
        except Exception as e:
            logger.error(f"Error reading CSV file: {e}", exc_info=True)
            raise HTTPException(
                status_code=400,
                detail=f"Could not read CSV file: {str(e)}"
            )
    
    for row_idx, row in enumerate(rows):
        # Store raw data
        raw_data = {}
        for key, value in row.items():
            # Handle pandas Timestamp objects
            if PANDAS_AVAILABLE:
                try:
                    if isinstance(value, pd.Timestamp):
                        raw_data[key] = value.isoformat()
                        continue
                    elif pd.isna(value):
                        raw_data[key] = None
                        continue
                except (AttributeError, TypeError):
                    pass
            
            # Store other values as-is
            raw_data[key] = value
        
        # Map CSV/Excel columns to canonical fields
        patient_data = {
            "dataset_id": dataset_id,
            "patient_key": str(row_idx + 1),  # Use row number as key
            "raw": raw_data
        }
        
        # Get all canonical fields from PatientCreate schema
        metadata_fields = {"dataset_id", "patient_key", "raw", "extra_fields", "id", "created_at", "updated_at", "missing_fields", "imputed_fields"}
        schema_fields = set(PatientCreate.model_fields.keys())
        all_canonical_fields = [f for f in schema_fields if f not in metadata_fields]
        
        # Define field types for proper conversion
        numeric_float_fields = ["points", "percent"]
        numeric_int_fields = []
        boolean_fields = ["pca_confirmed"]
        datetime_fields = ["date_of_service"]
        string_fields = ["mrn", "first_name", "last_name", "location", "reason_for_visit", "age_group", "race", "family_history", "genetic_mutation", "gleason_grade", "category"]
        
        # Initialize all canonical fields to None first
        for canonical_field in all_canonical_fields:
            if canonical_field not in patient_data:
                patient_data[canonical_field] = None
        
        # Now populate fields that exist in the mapping and CSV
        for canonical_field in all_canonical_fields:
            csv_column = mapping.column_map.get(canonical_field)
            if csv_column and csv_column in row:
                value = row[csv_column]
                # Handle pandas NaN values and None
                if value is None:
                    value = None
                elif PANDAS_AVAILABLE:
                    try:
                        if pd.isna(value):
                            value = None
                    except (AttributeError, TypeError):
                        pass
                # Check for NaN-like float values
                elif isinstance(value, float) and value != value:  # NaN check
                    value = None
                # Try to convert to appropriate type
                if canonical_field in numeric_float_fields:
                    try:
                        value = float(value) if value is not None else None
                    except (ValueError, TypeError):
                        value = None
                elif canonical_field in numeric_int_fields:
                    try:
                        value = int(float(value)) if value is not None else None
                    except (ValueError, TypeError):
                        value = None
                elif canonical_field in boolean_fields:
                    if isinstance(value, bool):
                        pass
                    elif isinstance(value, str):
                        value_lower = value.lower().strip()
                        value = value_lower in ['true', 'yes', '1', 'y', 'confirmed']
                    elif isinstance(value, (int, float)):
                        value = bool(value)
                    else:
                        value = None
                elif canonical_field in datetime_fields:
                    if value is None:
                        value = None
                    elif isinstance(value, datetime):
                        # Already a datetime object
                        pass
                    elif PANDAS_AVAILABLE and hasattr(value, 'to_pydatetime'):
                        # Pandas Timestamp - convert to Python datetime
                        try:
                            if pd.isna(value):
                                value = None
                            else:
                                value = value.to_pydatetime()
                        except Exception as e:
                            logger.warning(f"Error converting pandas Timestamp to datetime: {e}")
                            value = None
                    elif hasattr(value, 'isoformat'):
                        # Other datetime-like object
                        try:
                            value = datetime.fromisoformat(value.isoformat().replace('Z', '+00:00'))
                        except Exception:
                            value = None
                    elif isinstance(value, str):
                        # Parse string date (e.g., "3/10/2025")
                        parsed_date = parse_date_string(value)
                        value = parsed_date
                    else:
                        # Try to convert to string and parse
                        try:
                            parsed_date = parse_date_string(str(value))
                            value = parsed_date
                        except Exception:
                            value = None
                elif canonical_field in string_fields:
                    value = str(value).strip() if value is not None else None
                else:
                    if value is not None:
                        if isinstance(value, (int, float)):
                            pass
                        else:
                            value = str(value).strip() if value else None
                    else:
                        value = None
                
                patient_data[canonical_field] = value
        
        # Extract extra fields: CSV columns that aren't mapped to canonical fields
        mapped_csv_columns = set(mapping.column_map.values())
        
        # If create_extra_fields is provided, add those mappings to mapped_csv_columns
        if hasattr(mapping, 'create_extra_fields') and mapping.create_extra_fields:
            mapped_csv_columns.update(mapping.create_extra_fields.keys())
        
        extra_fields = {}
        
        # First, handle explicitly created extra_fields (from create_extra_fields mapping)
        if hasattr(mapping, 'create_extra_fields') and mapping.create_extra_fields:
            for csv_column, custom_field_name in mapping.create_extra_fields.items():
                if csv_column in row:
                    value = row[csv_column]
                    if value is not None:
                        if PANDAS_AVAILABLE:
                            try:
                                if pd.isna(value):
                                    continue
                                elif isinstance(value, pd.Timestamp):
                                    cleaned_value = value.isoformat()
                                else:
                                    cleaned_value = value
                                extra_fields[custom_field_name] = cleaned_value
                            except (AttributeError, TypeError):
                                extra_fields[custom_field_name] = str(value).strip() if value else None
                        else:
                            extra_fields[custom_field_name] = str(value).strip() if value else None
        
        # Then, handle remaining unmapped CSV columns (store with original CSV column name)
        for csv_column, value in row.items():
            if csv_column in mapped_csv_columns:
                continue
            
            if value is None:
                continue
            elif PANDAS_AVAILABLE:
                try:
                    if pd.isna(value):
                        continue
                    elif isinstance(value, pd.Timestamp):
                        cleaned_value = value.isoformat()
                    else:
                        cleaned_value = value
                    extra_fields[csv_column] = cleaned_value
                except (AttributeError, TypeError):
                    extra_fields[csv_column] = str(value).strip() if value else None
            else:
                extra_fields[csv_column] = str(value).strip() if value else None
        
        # Merge with existing extra_fields if updating existing patient
        if existing_patient and existing_patient.extra_fields:
            existing_extra = existing_patient.extra_fields.copy()
            existing_extra.update(extra_fields)
            extra_fields = existing_extra
        
        patient_data["extra_fields"] = extra_fields if extra_fields else None
        
        # Check if patient already exists
        existing_patient = db.query(Patient).filter(
            Patient.dataset_id == dataset_id,
            Patient.patient_key == patient_data["patient_key"]
        ).first()
        
        if not existing_patient and patient_data.get("mrn"):
            existing_patient = db.query(Patient).filter(
                Patient.dataset_id == dataset_id,
                Patient.mrn == patient_data["mrn"]
            ).first()
        
        if existing_patient:
            # Update only missing/blank fields
            updated = False
            for field_name, new_value in patient_data.items():
                if field_name in ["dataset_id", "id", "created_at", "updated_at", "patient_key"]:
                    continue
                
                current_value = getattr(existing_patient, field_name, None)
                
                should_update = False
                if current_value is None:
                    should_update = True
                elif isinstance(current_value, str) and not current_value.strip():
                    should_update = True
                elif isinstance(current_value, (dict, list)) and len(current_value) == 0:
                    should_update = True
                
                if should_update and new_value is not None:
                    if isinstance(new_value, str) and new_value.strip():
                        setattr(existing_patient, field_name, new_value)
                        updated = True
                    elif isinstance(new_value, (dict, list)):
                        if len(new_value) > 0:
                            setattr(existing_patient, field_name, new_value)
                            updated = True
                    elif not isinstance(new_value, str):
                        setattr(existing_patient, field_name, new_value)
                        updated = True
            
            if updated:
                existing_patient.updated_at = datetime.utcnow()
                patients_updated += 1
        else:
            # Create new patient record
            try:
                patient = PatientCreate(**patient_data)
                db_patient = Patient(**patient.model_dump())
                db.add(db_patient)
                patients_created += 1
            except Exception as e:
                logger.error(f"Error creating patient record for row {row_idx + 1}: {e}", exc_info=True)
                logger.error(f"Patient data: {patient_data}")
                raise HTTPException(
                    status_code=400,
                    detail=f"Error creating patient record for row {row_idx + 1}: {str(e)}"
                )
    
    # Save column map to dataset
    try:
        dataset.column_map = mapping.column_map
        db.commit()
    except Exception as e:
        logger.error(f"Error saving column map: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Error saving column mapping: {str(e)}"
        )
    
    message_parts = []
    if patients_created > 0:
        message_parts.append(f"Created {patients_created} new patient record{'s' if patients_created != 1 else ''}")
    if patients_updated > 0:
        message_parts.append(f"Updated {patients_updated} existing patient record{'s' if patients_updated != 1 else ''}")
    
    message = " and ".join(message_parts) if message_parts else "No changes made"
    
    return {
        "message": message,
        "patients_created": patients_created,
        "patients_updated": patients_updated
    }


@router.get("/{dataset_id}", response_model=DatasetResponse)
async def get_dataset(
    dataset_id: uuid.UUID,
    db: Session = Depends(get_db),
    session_context: Tuple[User, DataSession] = Depends(get_current_session),
):
    """Get a dataset by ID"""
    from sqlalchemy import func
    current_user, data_session = session_context
    dataset = get_user_dataset(dataset_id, db, current_user, data_session)
    
    # Add patient count
    patient_count = db.query(func.count(Patient.id)).filter(
        Patient.dataset_id == dataset_id
    ).scalar() or 0
    
    dataset_dict = {
        "id": dataset.id,
        "name": dataset.name,
        "source_filename": dataset.source_filename,
        "stored_path": dataset.stored_path,
        "data_type": dataset.data_type,
        "column_map": dataset.column_map,
        "created_at": dataset.created_at,
        "patient_count": patient_count
    }
    return DatasetResponse(**dataset_dict)


@router.get("", response_model=List[DatasetResponse])
async def list_datasets(
    db: Session = Depends(get_db),
    session_context: Tuple[User, DataSession] = Depends(get_current_session),
):
    """List all datasets for the current user in the current unlocked session"""
    from sqlalchemy import func
    current_user, data_session = session_context
    datasets = db.query(Dataset).filter(
        Dataset.user_id == current_user.id,
        Dataset.session_id == data_session.id,
    ).order_by(Dataset.created_at.desc()).all()
    
    # Add patient count for each dataset
    result = []
    for dataset in datasets:
        patient_count = db.query(func.count(Patient.id)).filter(
            Patient.dataset_id == dataset.id
        ).scalar() or 0
        
        dataset_dict = {
            "id": dataset.id,
            "name": dataset.name,
            "source_filename": dataset.source_filename,
            "stored_path": dataset.stored_path,
            "data_type": dataset.data_type,
            "column_map": dataset.column_map,
            "created_at": dataset.created_at,
            "patient_count": patient_count
        }
        result.append(DatasetResponse(**dataset_dict))
    
    return result


@router.get("/{dataset_id}/reprocess-check", response_model=ReprocessCheckResponse)
async def reprocess_check(
    dataset_id: uuid.UUID,
    db: Session = Depends(get_db),
    session_context: Tuple[User, DataSession] = Depends(get_current_session),
):
    """Check for missing columns and data by comparing raw file with database"""
    current_user, data_session = session_context
    dataset = get_user_dataset(dataset_id, db, current_user, data_session)
    
    if not dataset.column_map:
        raise HTTPException(
            status_code=400,
            detail="Dataset has no column mapping. Please map columns first."
        )
    
    # Read the raw file
    file_path = Path(dataset.stored_path)
    filename_lower = file_path.name.lower()
    is_excel = filename_lower.endswith('.xlsx') or filename_lower.endswith('.xls')
    
    rows = []
    file_columns = []
    
    try:
        if is_excel:
            if not PANDAS_AVAILABLE:
                raise HTTPException(
                    status_code=400,
                    detail="Excel file support requires pandas"
                )
            df = pd.read_excel(file_path)
            file_columns = df.columns.tolist()
            rows = df.to_dict('records')
        else:
            # Read CSV
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    reader = csv.DictReader(f)
                    file_columns = list(reader.fieldnames or [])
                    rows = list(reader)
            except UnicodeDecodeError:
                with open(file_path, "r", encoding="latin-1") as f:
                    reader = csv.DictReader(f)
                    file_columns = list(reader.fieldnames or [])
                    rows = list(reader)
    except Exception as e:
        logger.error(f"Error reading file for reprocess check: {e}", exc_info=True)
        raise HTTPException(
            status_code=400,
            detail=f"Could not read file: {str(e)}"
        )
    
    # Find unmapped columns (columns in file that aren't in column_map)
    mapped_columns = set(dataset.column_map.values()) if dataset.column_map else set()
    unmapped_columns = [col for col in file_columns if col not in mapped_columns]
    
    # Get all patients from this dataset
    patients = db.query(Patient).filter(Patient.dataset_id == dataset_id).all()
    
    # Find columns that are in extra_fields
    extra_fields_columns = set()
    for patient in patients:
        if patient.extra_fields:
            extra_fields_columns.update(patient.extra_fields.keys())
    
    # Filter to only include columns that are in the CSV file
    extra_fields_columns = [col for col in extra_fields_columns if col in file_columns]
    
    # Create a mapping of patient_key -> patient for quick lookup
    patient_by_key = {p.patient_key: p for p in patients}
    
    # Check for missing data
    # Get all canonical fields that should be mapped
    metadata_fields = {"dataset_id", "patient_key", "raw", "extra_fields", "id", "created_at", "updated_at", "missing_fields", "imputed_fields"}
    schema_fields = set(PatientCreate.model_fields.keys())
    all_canonical_fields = [f for f in schema_fields if f not in metadata_fields]
    
    missing_data_summary = {}
    rows_with_missing_data = []
    
    # Check each row in the file
    for row_idx, row in enumerate(rows[:100]):  # Limit to first 100 rows for performance
        patient_key = str(row_idx + 1)
        patient = patient_by_key.get(patient_key)
        
        if not patient:
            continue  # Skip if patient doesn't exist in DB
        
        row_missing = {}
        
        # Check each mapped field
        for canonical_field, csv_column in dataset.column_map.items():
            if canonical_field not in all_canonical_fields:
                continue
            
            # Get value from CSV row
            csv_value = row.get(csv_column)
            
            # Check if value exists in CSV
            if csv_value is None or (isinstance(csv_value, str) and csv_value.strip() == ""):
                # Value is missing in CSV, skip
                continue
            
            # Check if value is missing in database
            db_value = getattr(patient, canonical_field, None)
            if db_value is None or (isinstance(db_value, str) and db_value.strip() == ""):
                # Value exists in CSV but missing in DB
                if canonical_field not in missing_data_summary:
                    missing_data_summary[canonical_field] = {
                        "field": canonical_field,
                        "csv_column": csv_column,
                        "missing_count": 0,
                        "sample_values": []
                    }
                
                missing_data_summary[canonical_field]["missing_count"] += 1
                
                # Store sample value (limit to 5 samples)
                if len(missing_data_summary[canonical_field]["sample_values"]) < 5:
                    missing_data_summary[canonical_field]["sample_values"].append({
                        "patient_key": patient_key,
                        "mrn": patient.mrn,
                        "value": str(csv_value)[:100]  # Truncate long values
                    })
                
                row_missing[canonical_field] = {
                    "csv_value": csv_value,
                    "csv_column": csv_column
                }
        
        if row_missing:
            rows_with_missing_data.append({
                "patient_key": patient_key,
                "mrn": patient.mrn,
                "first_name": patient.first_name,
                "last_name": patient.last_name,
                "missing_fields": row_missing
            })
    
    return ReprocessCheckResponse(
        unmapped_columns=unmapped_columns,
        extra_fields_columns=extra_fields_columns,
        missing_data_summary=missing_data_summary,
        total_rows_in_file=len(rows),
        total_patients_in_db=len(patients),
        rows_with_missing_data=rows_with_missing_data[:20]  # Limit to 20 rows
    )


@router.post("/{dataset_id}/add-unmapped-to-extra-fields")
async def add_unmapped_to_extra_fields(
    dataset_id: uuid.UUID,
    db: Session = Depends(get_db),
    session_context: Tuple[User, DataSession] = Depends(get_current_session),
):
    """For processed datasets: Add unmapped CSV columns to extra_fields automatically"""
    current_user, data_session = session_context
    dataset = get_user_dataset(dataset_id, db, current_user, data_session)
    
    # Check if dataset has patients (is processed)
    from sqlalchemy import func
    patient_count = db.query(func.count(Patient.id)).filter(
        Patient.dataset_id == dataset_id
    ).scalar() or 0
    
    if patient_count == 0:
        raise HTTPException(
            status_code=400,
            detail="Dataset has no patients. Use column mapping instead."
        )
    
    # Read the raw file to get unmapped columns
    file_path = Path(dataset.stored_path)
    filename_lower = file_path.name.lower()
    is_excel = filename_lower.endswith('.xlsx') or filename_lower.endswith('.xls')
    
    rows = []
    file_columns = []
    
    try:
        if is_excel:
            if not PANDAS_AVAILABLE:
                raise HTTPException(status_code=400, detail="Excel file support requires pandas")
            df = pd.read_excel(file_path)
            file_columns = df.columns.tolist()
            rows = df.to_dict('records')
        else:
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    reader = csv.DictReader(f)
                    file_columns = list(reader.fieldnames or [])
                    rows = list(reader)
            except UnicodeDecodeError:
                with open(file_path, "r", encoding="latin-1") as f:
                    reader = csv.DictReader(f)
                    file_columns = list(reader.fieldnames or [])
                    rows = list(reader)
    except Exception as e:
        logger.error(f"Error reading file: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=f"Could not read file: {str(e)}")
    
    # Find unmapped columns
    mapped_columns = set(dataset.column_map.values()) if dataset.column_map else set()
    unmapped_columns = [col for col in file_columns if col not in mapped_columns]
    
    if not unmapped_columns:
        return {
            "message": "No unmapped columns found",
            "columns_added": 0,
            "patients_updated": 0
        }
    
    # Get all patients from this dataset
    patients = db.query(Patient).filter(Patient.dataset_id == dataset_id).all()
    
    # Create patient_key -> patient mapping
    patient_by_key = {p.patient_key: p for p in patients}
    
    patients_updated = 0
    
    # Process each row and add unmapped columns to extra_fields
    for row_idx, row in enumerate(rows):
        patient_key = str(row_idx + 1)
        patient = patient_by_key.get(patient_key)
        
        if not patient:
            continue
        
        # Get existing extra_fields or create new dict
        extra_fields = patient.extra_fields.copy() if patient.extra_fields else {}
        updated = False
        
        # Add unmapped columns to extra_fields
        for csv_column in unmapped_columns:
            if csv_column in row:
                value = row[csv_column]
                
                # Skip if value is empty or already in extra_fields
                if value is None or csv_column in extra_fields:
                    continue
                
                # Handle pandas types
                if PANDAS_AVAILABLE:
                    try:
                        if pd.isna(value):
                            continue
                        elif isinstance(value, pd.Timestamp):
                            extra_fields[csv_column] = value.isoformat()
                        else:
                            extra_fields[csv_column] = value
                    except (AttributeError, TypeError):
                        extra_fields[csv_column] = str(value).strip() if value else None
                else:
                    extra_fields[csv_column] = str(value).strip() if value else None
                
                updated = True
        
        if updated:
            patient.extra_fields = extra_fields
            patient.updated_at = datetime.utcnow()
            patients_updated += 1
    
    try:
        db.commit()
    except Exception as e:
        logger.error(f"Error committing extra_fields update: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error updating patient records: {str(e)}")
    
    return {
        "message": f"Added {len(unmapped_columns)} unmapped column(s) to extra_fields for {patients_updated} patient(s)",
        "columns_added": len(unmapped_columns),
        "patients_updated": patients_updated,
        "columns": unmapped_columns
    }


@router.post("/{dataset_id}/reprocess-update")
async def reprocess_update(
    dataset_id: uuid.UUID,
    db: Session = Depends(get_db),
    session_context: Tuple[User, DataSession] = Depends(get_current_session),
):
    """Re-process dataset to update missing data from the raw file"""
    current_user, data_session = session_context
    dataset = get_user_dataset(dataset_id, db, current_user, data_session)
    
    if not dataset.column_map:
        raise HTTPException(
            status_code=400,
            detail="Dataset has no column mapping. Please map columns first."
        )
    
    # Read the raw file
    file_path = Path(dataset.stored_path)
    filename_lower = file_path.name.lower()
    is_excel = filename_lower.endswith('.xlsx') or filename_lower.endswith('.xls')
    
    rows = []
    
    try:
        if is_excel:
            if not PANDAS_AVAILABLE:
                raise HTTPException(
                    status_code=400,
                    detail="Excel file support requires pandas"
                )
            df = pd.read_excel(file_path)
            rows = df.to_dict('records')
        else:
            # Read CSV
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    reader = csv.DictReader(f)
                    rows = list(reader)
            except UnicodeDecodeError:
                with open(file_path, "r", encoding="latin-1") as f:
                    reader = csv.DictReader(f)
                    rows = list(reader)
    except Exception as e:
        logger.error(f"Error reading file for reprocess update: {e}", exc_info=True)
        raise HTTPException(
            status_code=400,
            detail=f"Could not read file: {str(e)}"
        )
    
    # Get all patients from this dataset
    patients = db.query(Patient).filter(Patient.dataset_id == dataset_id).all()
    patient_by_key = {p.patient_key: p for p in patients}
    
    # Get all canonical fields
    metadata_fields = {"dataset_id", "patient_key", "raw", "extra_fields", "id", "created_at", "updated_at", "missing_fields", "imputed_fields"}
    schema_fields = set(PatientCreate.model_fields.keys())
    all_canonical_fields = [f for f in schema_fields if f not in metadata_fields]
    
    # Define field types for proper conversion
    numeric_float_fields = ["points", "percent"]
    numeric_int_fields = []
    boolean_fields = ["pca_confirmed"]
    datetime_fields = ["date_of_service"]
    
    patients_updated = 0
    fields_updated = 0
    
    # Process each row
    for row_idx, row in enumerate(rows):
        patient_key = str(row_idx + 1)
        patient = patient_by_key.get(patient_key)
        
        if not patient:
            continue  # Skip if patient doesn't exist
        
        patient_changed = False
        
        # Update each mapped field
        for canonical_field, csv_column in dataset.column_map.items():
            if canonical_field not in all_canonical_fields:
                continue
            
            # Get value from CSV row
            csv_value = row.get(csv_column)
            
            # Skip if CSV value is empty
            if csv_value is None or (isinstance(csv_value, str) and csv_value.strip() == ""):
                continue
            
            # Check if DB value is missing - only update if field is truly empty/missing
            db_value = getattr(patient, canonical_field, None)
            
            # Determine if field is missing (should be updated)
            is_missing = False
            if db_value is None:
                is_missing = True
            elif isinstance(db_value, str) and not db_value.strip():
                is_missing = True  # Empty string is considered missing
            elif isinstance(db_value, (dict, list)) and len(db_value) == 0:
                is_missing = True  # Empty dict/list is considered missing
            # Note: 0, False, and other falsy but valid values are NOT considered missing
            
            if not is_missing:
                continue  # DB already has a value, skip updating this field
            
            # Convert and set the value
            try:
                # Handle pandas types
                if PANDAS_AVAILABLE:
                    if isinstance(csv_value, pd.Timestamp):
                        csv_value = csv_value.to_pydatetime()
                    elif pd.isna(csv_value):
                        continue
                
                # Type conversion
                if canonical_field in numeric_float_fields:
                    try:
                        csv_value = float(csv_value)
                    except (ValueError, TypeError):
                        continue
                elif canonical_field in numeric_int_fields:
                    try:
                        csv_value = int(csv_value)
                    except (ValueError, TypeError):
                        continue
                elif canonical_field in boolean_fields:
                    if isinstance(csv_value, bool):
                        pass
                    elif isinstance(csv_value, str):
                        csv_value = csv_value.lower() in ('true', '1', 'yes', 'y', 't')
                    else:
                        csv_value = bool(csv_value)
                elif canonical_field in datetime_fields:
                    csv_value = parse_date_string(str(csv_value))
                    if csv_value is None:
                        continue
                else:
                    csv_value = str(csv_value).strip()
                    if not csv_value:
                        continue
                
                # Set the value
                setattr(patient, canonical_field, csv_value)
                patient_changed = True
                fields_updated += 1
                
            except Exception as e:
                logger.warning(f"Error updating field {canonical_field} for patient {patient_key}: {e}")
                continue
        
        if patient_changed:
            patient.updated_at = datetime.utcnow()
            patients_updated += 1
    
    # Commit all changes
    try:
        db.commit()
    except Exception as e:
        logger.error(f"Error committing reprocess update: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Error updating patient records: {str(e)}"
        )
    
    return {
        "message": f"Updated {patients_updated} patient record(s) with {fields_updated} field(s)",
        "patients_updated": patients_updated,
        "fields_updated": fields_updated
    }


@router.delete("/{dataset_id}")
async def delete_dataset(
    dataset_id: uuid.UUID,
    db: Session = Depends(get_db),
    session_context: Tuple[User, DataSession] = Depends(get_current_session),
):
    """Delete a dataset if it has no patients (not yet processed)"""
    from sqlalchemy import func
    import os
    current_user, data_session = session_context
    dataset = get_user_dataset(dataset_id, db, current_user, data_session)

    # Check if dataset has patients
    patient_count = db.query(func.count(Patient.id)).filter(
        Patient.dataset_id == dataset_id
    ).scalar() or 0
    
    if patient_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete dataset: {patient_count} patient(s) have been created from this dataset. Please delete patients first."
        )
    
    # Delete the uploaded file if it exists
    file_path = Path(dataset.stored_path)
    if file_path.exists():
        try:
            os.remove(file_path)
        except Exception as e:
            # Log error but don't fail the deletion
            logger.warning(f"Could not delete file {file_path}: {e}")
    
    # Delete the dataset record
    db.delete(dataset)
    db.commit()
    
    return {"message": "Dataset deleted successfully"}


@router.get("/{dataset_id}/raw-data")
async def get_raw_data(
    dataset_id: uuid.UUID,
    db: Session = Depends(get_db),
    session_context: Tuple[User, DataSession] = Depends(get_current_session),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0)
):
    """Get raw data from the uploaded file (before mapping)"""
    current_user, data_session = session_context
    dataset = get_user_dataset(dataset_id, db, current_user, data_session)
    
    file_path = Path(dataset.stored_path)
    filename_lower = file_path.name.lower()
    is_excel = filename_lower.endswith('.xlsx') or filename_lower.endswith('.xls')
    
    rows = []
    total_rows = 0
    
    if is_excel:
        if not PANDAS_AVAILABLE:
            raise HTTPException(
                status_code=400,
                detail="Excel file support requires pandas"
            )
        try:
            df = pd.read_excel(file_path)
            total_rows = len(df)
            for idx, row in df.iloc[offset:offset+limit].iterrows():
                row_dict = {}
                for col, val in row.items():
                    if PANDAS_AVAILABLE:
                        if isinstance(val, pd.Timestamp):
                            row_dict[col] = val.isoformat() if pd.notna(val) else None
                        elif pd.isna(val):
                            row_dict[col] = None
                        else:
                            row_dict[col] = val
                    else:
                        row_dict[col] = val
                rows.append(row_dict)
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"Could not read Excel file: {str(e)}"
            )
    else:
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                all_rows = list(reader)
                total_rows = len(all_rows)
                rows = all_rows[offset:offset+limit]
        except UnicodeDecodeError:
            try:
                with open(file_path, "r", encoding="latin-1") as f:
                    reader = csv.DictReader(f)
                    all_rows = list(reader)
                    total_rows = len(all_rows)
                    rows = all_rows[offset:offset+limit]
            except Exception as e:
                raise HTTPException(
                    status_code=400,
                    detail=f"Could not read CSV file: {str(e)}"
                )
    
    return {
        "rows": rows,
        "total": total_rows,
        "offset": offset,
        "limit": limit,
        "columns": list(rows[0].keys()) if rows else []
    }
