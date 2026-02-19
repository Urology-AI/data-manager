"""
API endpoint to return canonical field definitions dynamically
This allows the frontend to automatically adapt when new fields are added to the Patient model
"""
from fastapi import APIRouter, Depends
from app.schemas import PatientCreate
from app.auth import get_current_active_user
from app.models import User
from typing import Dict, Any, List
import inspect
from datetime import datetime

router = APIRouter()


def get_field_info(field_name: str, field_info: Any) -> Dict[str, Any]:
    """Extract field metadata from Pydantic field"""
    field_type = "string"
    domain = "Other"
    
    # Determine type
    if hasattr(field_info.annotation, '__origin__'):
        # Handle Optional[Type] or Union types
        args = getattr(field_info.annotation, '__args__', [])
        if args:
            base_type = args[0]
            if base_type == int:
                field_type = "integer"
            elif base_type == float:
                field_type = "float"
            elif base_type == bool:
                field_type = "boolean"
            elif base_type == datetime:
                field_type = "datetime"
    elif field_info.annotation == int:
        field_type = "integer"
    elif field_info.annotation == float:
        field_type = "float"
    elif field_info.annotation == bool:
        field_type = "boolean"
    elif field_info.annotation == datetime:
        field_type = "datetime"
    
    # Determine domain based on field name
    if field_name in ['mrn', 'first_name', 'last_name', 'date_of_service', 'location', 'reason_for_visit']:
        domain = "Patient Identification"
    elif field_name in ['age_group', 'race', 'family_history', 'genetic_mutation']:
        domain = "Demographics"
    elif field_name in ['pca_confirmed', 'gleason_grade', 'points', 'percent', 'category']:
        domain = "Clinical Data"
    else:
        domain = "Other"
    
    # Generate label
    label = field_name.replace('_', ' ').title()
    if field_name == 'mrn':
        label = 'MRN'
    elif field_name == 'fn' or field_name == 'first_name':
        label = 'First Name (FN)'
    elif field_name == 'ln' or field_name == 'last_name':
        label = 'Last Name (LN)'
    elif field_name == 'pca_confirmed':
        label = 'PCa confirmed?'
    elif field_name == 'gleason_grade':
        label = 'Gleason Grade (GG)'
    elif field_name == 'family_history':
        label = 'FH of prostate'
    elif field_name == 'genetic_mutation':
        label = 'Genetic'
    elif field_name == 'date_of_service':
        label = 'Date of Service'
    elif field_name == 'reason_for_visit':
        label = 'Reason for Visit'
    
    return {
        "field": field_name,
        "label": label,
        "type": field_type,
        "domain": domain,
        "required": field_info.is_required() if hasattr(field_info, 'is_required') else False
    }


@router.get("/canonical-fields", response_model=Dict[str, Any])
async def get_canonical_fields(
    current_user: User = Depends(get_current_active_user)
):
    """
    Return all canonical fields dynamically from the PatientCreate schema.
    This endpoint allows the frontend to automatically adapt when new fields are added.
    """
    # Get all fields from PatientCreate schema
    metadata_fields = {"dataset_id", "patient_key", "raw", "extra_fields", "id", "created_at", "updated_at", "missing_fields", "imputed_fields"}
    
    fields = []
    schema_fields = PatientCreate.model_fields
    
    for field_name, field_info in schema_fields.items():
        # Skip metadata fields
        if field_name in metadata_fields:
            continue
        
        field_data = get_field_info(field_name, field_info)
        fields.append(field_data)
    
    # Group by domain
    domains = {}
    for field in fields:
        domain = field["domain"]
        if domain not in domains:
            domains[domain] = []
        domains[domain].append(field)
    
    return {
        "fields": fields,
        "domains": domains,
        "field_map": {f["field"]: f for f in fields}
    }
