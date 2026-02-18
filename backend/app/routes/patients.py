from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import or_
from app.db import get_db
from app.models import Patient, Dataset
from app.schemas import PatientResponse, PatientUpdate, PaginatedResponse, FillRequest, PatientCreate
from app.data.impute import fill_patients, get_missing_fields
from app.data.column_matcher import suggest_column_mappings, auto_map_columns
from uuid import UUID
import csv
import pandas as pd
from pathlib import Path
from datetime import datetime

router = APIRouter()


@router.get("/dataset/{dataset_id}", response_model=PaginatedResponse)
async def list_patients(
    dataset_id: UUID,
    search: Optional[str] = Query(None),
    missing_field: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """List patients in a dataset with filtering and pagination"""
    query = db.query(Patient).filter(Patient.dataset_id == dataset_id)
    
    # Search filter
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                Patient.patient_key.ilike(search_term),
                Patient.mrn.ilike(search_term),
                Patient.first_name.ilike(search_term),
                Patient.last_name.ilike(search_term),
                Patient.race.ilike(search_term),
            )
        )
    
    # Missing field filter
    if missing_field:
        # Filter patients where the field is null or empty
        field = getattr(Patient, missing_field, None)
        if field:
            query = query.filter(field.is_(None))
    
    total = query.count()
    patients = query.offset(offset).limit(limit).all()
    
    pages = (total + limit - 1) // limit if limit > 0 else 1
    
    return PaginatedResponse(
        items=patients,
        total=total,
        page=offset // limit + 1 if limit > 0 else 1,
        page_size=limit,
        pages=pages
    )


@router.post("", response_model=PatientResponse)
async def create_patient(
    patient_create: PatientCreate,
    db: Session = Depends(get_db)
):
    """Create a new patient record"""
    # Check if dataset exists
    from app.models import Dataset
    dataset = db.query(Dataset).filter(Dataset.id == patient_create.dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    
    # Check if patient_key already exists in dataset
    existing = db.query(Patient).filter(
        Patient.dataset_id == patient_create.dataset_id,
        Patient.patient_key == patient_create.patient_key
    ).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Patient with key '{patient_create.patient_key}' already exists in this dataset"
        )
    
    # Create patient
    patient = Patient(**patient_create.model_dump())
    db.add(patient)
    db.commit()
    db.refresh(patient)
    
    return patient


@router.get("/all", response_model=PaginatedResponse)
async def list_all_patients(
    search: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """List all patients across all datasets (for Data Manager)"""
    query = db.query(Patient)
    
    # Search filter
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                Patient.patient_key.ilike(search_term),
                Patient.mrn.ilike(search_term),
                Patient.first_name.ilike(search_term),
                Patient.last_name.ilike(search_term),
                Patient.race.ilike(search_term),
            )
        )
    
    total = query.count()
    patients = query.order_by(Patient.created_at.desc()).offset(offset).limit(limit).all()
    
    pages = (total + limit - 1) // limit if limit > 0 else 1
    
    # Convert Patient objects to dicts for proper serialization
    patient_dicts = []
    for patient in patients:
        patient_dict = {
            "id": patient.id,
            "dataset_id": patient.dataset_id,
            "patient_key": patient.patient_key,
            "date_of_service": patient.date_of_service,
            "location": patient.location,
            "mrn": patient.mrn,
            "first_name": patient.first_name,
            "last_name": patient.last_name,
            "reason_for_visit": patient.reason_for_visit,
            "points": patient.points,
            "percent": patient.percent,
            "category": patient.category,
            "pca_confirmed": patient.pca_confirmed,
            "gleason_grade": patient.gleason_grade,
            "age_group": patient.age_group,
            "family_history": patient.family_history,
            "race": patient.race,
            "genetic_mutation": patient.genetic_mutation,
            "raw": patient.raw,
            "extra_fields": patient.extra_fields,
            "created_at": patient.created_at,
            "updated_at": patient.updated_at,
        }
        patient_dicts.append(patient_dict)
    
    return PaginatedResponse(
        items=patient_dicts,
        total=total,
        page=offset // limit + 1 if limit > 0 else 1,
        page_size=limit,
        pages=pages
    )


@router.patch("/bulk-update")
async def bulk_update_patients(
    updates: List[Dict[str, Any]],
    db: Session = Depends(get_db)
):
    """Bulk update multiple patients"""
    updated_count = 0
    errors = []
    
    for update_data in updates:
        patient_id = update_data.get("id")
        if not patient_id:
            errors.append({"row": update_data, "error": "Missing patient ID"})
            continue
        
        try:
            patient = db.query(Patient).filter(Patient.id == UUID(patient_id)).first()
            if not patient:
                errors.append({"row": update_data, "error": f"Patient {patient_id} not found"})
                continue
            
            # Handle extra_fields separately
            extra_fields_update = update_data.get("extra_fields")
            if extra_fields_update:
                # Merge with existing extra_fields
                existing_extra = patient.extra_fields or {}
                existing_extra.update(extra_fields_update)
                patient.extra_fields = existing_extra
            
            # Update other fields (exclude 'id' and 'extra_fields')
            update_fields = {k: v for k, v in update_data.items() if k not in ["id", "extra_fields"]}
            for field, value in update_fields.items():
                if hasattr(patient, field):
                    # Handle empty strings as None
                    if value == "":
                        value = None
                    setattr(patient, field, value)
            
            patient.updated_at = datetime.utcnow()
            db.commit()
            updated_count += 1
        except Exception as e:
            db.rollback()
            errors.append({"row": update_data, "error": str(e)})
    
    return {
        "updated_count": updated_count,
        "errors": errors
    }


@router.get("/{patient_id}", response_model=PatientResponse)
async def get_patient(
    patient_id: UUID,
    db: Session = Depends(get_db)
):
    """Get a patient by ID"""
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    return patient


@router.patch("/{patient_id}", response_model=PatientResponse)
async def update_patient(
    patient_id: UUID,
    patient_update: PatientUpdate,
    db: Session = Depends(get_db)
):
    """Update a patient's canonical fields"""
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    update_data = patient_update.model_dump(exclude_unset=True)
    
    # Handle extra_fields if present (for custom fields)
    if "extra_fields" in update_data:
        existing_extra = patient.extra_fields or {}
        if isinstance(update_data["extra_fields"], dict):
            existing_extra.update(update_data["extra_fields"])
        patient.extra_fields = existing_extra
        del update_data["extra_fields"]
    
    for field, value in update_data.items():
        if hasattr(patient, field):
            # Handle empty strings as None
            if value == "":
                value = None
            # Handle date strings - convert to datetime if needed
            elif field == "date_of_service" and isinstance(value, str) and value:
                try:
                    from dateutil import parser as date_parser
                    value = date_parser.parse(value)
                except Exception:
                    # If parsing fails, try to keep as string or set to None
                    logger.warning(f"Could not parse date_of_service: {value}")
                    value = None
            setattr(patient, field, value)
    
    from datetime import datetime
    patient.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(patient)
    return patient


@router.post("/dataset/{dataset_id}/fill")
async def fill_missing_data(
    dataset_id: UUID,
    fill_request: FillRequest,
    db: Session = Depends(get_db)
):
    """Fill missing data for patients in a dataset"""
    patient_id_list = [str(pid) for pid in fill_request.patient_ids] if fill_request.patient_ids else None
    stats = fill_patients(db, str(dataset_id), fill_request.mode, patient_id_list)
    
    return stats


@router.get("/dataset/{dataset_id}/missingness")
async def get_missingness_summary(
    dataset_id: UUID,
    db: Session = Depends(get_db)
):
    """Get missingness summary for a dataset"""
    patients = db.query(Patient).filter(Patient.dataset_id == dataset_id).all()
    
    canonical_fields = [
        # Patient identification
        "date_of_service", "location", "mrn", "first_name", "last_name", "reason_for_visit",
        # Clinical data
        "points", "percent", "category", "pca_confirmed", "gleason_grade",
        # Demographics
        "age_group", "race", "family_history", "genetic_mutation",
    ]
    
    missingness = {}
    total_patients = len(patients)
    
    for field in canonical_fields:
        missing_count = sum(1 for p in patients if getattr(p, field) is None or (isinstance(getattr(p, field), str) and getattr(p, field).strip() == ""))
        missingness[field] = {
            "missing_count": missing_count,
            "missing_percentage": (missing_count / total_patients * 100) if total_patients > 0 else 0
        }
    
    return {
        "total_patients": total_patients,
        "missingness": missingness
    }


@router.post("/upload-file")
async def upload_file_to_update_patients(
    file: UploadFile = File(...),
    match_by_mrn: bool = Query(True, description="Match existing patients by MRN"),
    db: Session = Depends(get_db)
):
    """Upload Excel or CSV file to update/add patient data. Matches existing patients by MRN if available."""
    filename_lower = file.filename.lower()
    is_excel = filename_lower.endswith('.xlsx') or filename_lower.endswith('.xls')
    is_csv = filename_lower.endswith('.csv')
    
    if not (is_excel or is_csv):
        raise HTTPException(
            status_code=400,
            detail=f"File must be Excel (.xlsx, .xls) or CSV (.csv). Got: {file.filename}"
        )
    
    # Read file
    try:
        if is_excel:
            df = pd.read_excel(file.file)
        else:
            # Read CSV with multiple encoding attempts
            try:
                df = pd.read_csv(file.file, encoding='utf-8')
            except UnicodeDecodeError:
                try:
                    file.file.seek(0)  # Reset file pointer
                    df = pd.read_csv(file.file, encoding='latin-1')
                except Exception as e:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Could not read CSV file: {str(e)}"
                    )
        
        rows = df.to_dict('records')
        columns = df.columns.tolist()
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Could not read file: {str(e)}"
        )
    
    # Get or create a default dataset for Data Manager uploads
    default_dataset = db.query(Dataset).filter(Dataset.name == "Data Manager Uploads").first()
    if not default_dataset:
        default_dataset = Dataset(
            name="Data Manager Uploads",
            source_filename=file.filename,
            stored_path=""
        )
        db.add(default_dataset)
        db.commit()
        db.refresh(default_dataset)
    
    # Process rows
    patients_created = 0
    patients_updated = 0
    
    # Get canonical fields
    metadata_fields = {"dataset_id", "patient_key", "raw", "extra_fields", "id", "created_at", "updated_at", "missing_fields", "imputed_fields"}
    schema_fields = set(PatientCreate.model_fields.keys())
    all_canonical_fields = [f for f in schema_fields if f not in metadata_fields]
    
    # Field type definitions
    numeric_float_fields = ["points", "percent"]
    numeric_int_fields = []
    boolean_fields = ["pca_confirmed"]
    datetime_fields = ["date_of_service"]
    string_fields = ["mrn", "first_name", "last_name", "location", "reason_for_visit", "age_group", "race", "family_history", "genetic_mutation", "gleason_grade", "category"]
    
    # Auto-map columns using generic data type for Data Manager uploads
    existing_mapping = {}
    auto_mapped = auto_map_columns(columns, existing_mapping, min_confidence=0.7, data_type="generic")
    
    for row_idx, row in enumerate(rows):
        # Store raw data
        raw_data = {}
        for key, value in row.items():
            try:
                if isinstance(value, pd.Timestamp):
                    raw_data[key] = value.isoformat()
                elif pd.isna(value):
                    raw_data[key] = None
                else:
                    raw_data[key] = value
            except (AttributeError, TypeError):
                raw_data[key] = value
        
        # Determine patient key and MRN
        mrn_value = None
        patient_key = None
        
        # Try to find MRN in various column names (case-insensitive)
        mrn_columns = [col for col in columns if col.lower() in ['mrn', 'medical_record_number', 'patient_id']]
        if mrn_columns and row.get(mrn_columns[0]):
            mrn_value = str(row[mrn_columns[0]]).strip()
            patient_key = mrn_value
        
        if not patient_key:
            if "patient_key" in columns and row.get("patient_key"):
                patient_key = str(row["patient_key"]).strip()
            else:
                patient_key = f"row_{row_idx + 1}"
        
        # Find existing patient: first by MRN (across all datasets), then by patient_key in default dataset
        existing_patient = None
        if match_by_mrn and mrn_value:
            # Match by MRN across ALL datasets
            existing_patient = db.query(Patient).filter(
                Patient.mrn == mrn_value
            ).first()
        
        # If not found by MRN, try patient_key in default dataset
        if not existing_patient:
            existing_patient = db.query(Patient).filter(
                Patient.dataset_id == default_dataset.id,
                Patient.patient_key == patient_key
            ).first()
        
        # Build patient data
        patient_data = {
            "dataset_id": default_dataset.id,
            "patient_key": patient_key,
            "raw": raw_data
        }
        
        # Initialize all canonical fields
        for canonical_field in all_canonical_fields:
            patient_data[canonical_field] = None
        
        # Track which columns were mapped and which are extra
        mapped_columns = set()
        extra_fields_data = {}
        
        # Map columns using auto-mapped suggestions
        
        for canonical_field in all_canonical_fields:
            # Try auto-mapped first
            csv_column = auto_mapped.get(canonical_field)
            if not csv_column:
                # Try exact match
                csv_column = canonical_field if canonical_field in columns else None
            
            if csv_column and csv_column in row:
                mapped_columns.add(csv_column)
                value = row[csv_column]
                
                # Handle pandas NaN
                try:
                    if pd.isna(value):
                        value = None
                except (TypeError, AttributeError):
                    pass
                
                if value is None:
                    continue
                
                # Type conversion
                if canonical_field in numeric_int_fields:
                    try:
                        if isinstance(value, str):
                            value = int(float(value)) if value.strip() else None
                        else:
                            value = int(value) if value else None
                    except (ValueError, TypeError):
                        value = None
                elif canonical_field in numeric_float_fields:
                    try:
                        value = float(value) if value else None
                    except (ValueError, TypeError):
                        value = None
                elif canonical_field in boolean_fields:
                    value = bool(value) if value else None
                elif canonical_field in datetime_fields:
                    try:
                        if isinstance(value, str):
                            value = datetime.fromisoformat(value.replace('Z', '+00:00'))
                        elif isinstance(value, pd.Timestamp):
                            value = value.to_pydatetime()
                    except (ValueError, TypeError):
                        value = None
                elif canonical_field in string_fields:
                    value = str(value).strip() if value else None
                
                patient_data[canonical_field] = value
        
        # Store unmapped columns in extra_fields
        for col in columns:
            if col not in mapped_columns and row.get(col) is not None:
                value = row[col]
                # Handle pandas types
                try:
                    if isinstance(value, pd.Timestamp):
                        extra_fields_data[col] = value.isoformat()
                    elif pd.isna(value):
                        extra_fields_data[col] = None
                    else:
                        extra_fields_data[col] = value
                except (TypeError, AttributeError):
                    extra_fields_data[col] = value
        
        # Set MRN if we found it
        if mrn_value:
            patient_data["mrn"] = mrn_value
        
        # Set extra_fields
        if extra_fields_data:
            patient_data["extra_fields"] = extra_fields_data
        
        # Update existing or create new
        if existing_patient:
            # Update only non-null fields (incremental update)
            for field, value in patient_data.items():
                if field not in ["dataset_id", "patient_key", "raw", "id", "extra_fields"] and value is not None:
                    if hasattr(existing_patient, field):
                        setattr(existing_patient, field, value)
            
            # Merge extra_fields (don't overwrite, merge)
            if extra_fields_data:
                existing_extra = existing_patient.extra_fields or {}
                existing_extra.update(extra_fields_data)
                existing_patient.extra_fields = existing_extra
            
            existing_patient.raw = raw_data
            existing_patient.updated_at = datetime.utcnow()
            patients_updated += 1
        else:
            # Create new patient
            new_patient = Patient(**patient_data)
            db.add(new_patient)
            patients_created += 1
        
        if (row_idx + 1) % 100 == 0:
            db.commit()
    
    db.commit()
    
    return {
        "patients_created": patients_created,
        "patients_updated": patients_updated,
        "total_rows": len(rows),
        "columns": columns,
        "suggestions": suggestions,
        "auto_mapped": auto_mapped,
        "matched_by_mrn": match_by_mrn
    }


@router.post("/add-custom-field")
async def add_custom_field_to_patients(
    field_name: str = Query(..., description="Name of the custom field to add"),
    default_value: Optional[str] = Query(None, description="Default value for existing patients"),
    db: Session = Depends(get_db)
):
    """Add a custom field to all patients (stored in extra_fields)"""
    # Validate field name
    if not field_name or not field_name.strip():
        raise HTTPException(status_code=400, detail="Field name cannot be empty")
    
    field_name = field_name.strip()
    
    # Check if it's a canonical field (shouldn't be added as custom)
    schema_fields = set(PatientCreate.model_fields.keys())
    if field_name in schema_fields:
        raise HTTPException(
            status_code=400,
            detail=f"Field '{field_name}' is a canonical field and cannot be added as a custom field"
        )
    
    # Add field to all patients
    patients = db.query(Patient).all()
    updated_count = 0
    
    for patient in patients:
        if patient.extra_fields is None:
            patient.extra_fields = {}
        
        # Only add if doesn't exist or if default_value is provided
        if field_name not in patient.extra_fields:
            patient.extra_fields[field_name] = default_value
            updated_count += 1
    
    db.commit()
    
    return {
        "field_name": field_name,
        "patients_updated": updated_count,
        "total_patients": len(patients)
    }


@router.delete("/remove-custom-field")
async def remove_custom_field_from_patients(
    field_name: str = Query(..., description="Name of the custom field to remove"),
    db: Session = Depends(get_db)
):
    """Remove a custom field from all patients"""
    if not field_name or not field_name.strip():
        raise HTTPException(status_code=400, detail="Field name cannot be empty")
    
    field_name = field_name.strip()
    
    # Remove field from all patients
    patients = db.query(Patient).all()
    removed_count = 0
    
    for patient in patients:
        if patient.extra_fields and field_name in patient.extra_fields:
            del patient.extra_fields[field_name]
            removed_count += 1
        
        # Clean up empty extra_fields
        if patient.extra_fields == {}:
            patient.extra_fields = None
    
    db.commit()
    
    return {
        "field_name": field_name,
        "patients_updated": removed_count,
        "total_patients": len(patients)
    }


@router.get("/custom-fields")
async def get_custom_fields(
    db: Session = Depends(get_db)
):
    """Get list of all custom fields (from extra_fields) across all patients"""
    patients = db.query(Patient).all()
    custom_fields = set()
    
    for patient in patients:
        if patient.extra_fields:
            custom_fields.update(patient.extra_fields.keys())
    
    return {
        "custom_fields": sorted(list(custom_fields))
    }
