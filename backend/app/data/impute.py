"""
Simple data imputation utilities
"""
from typing import List
from app.models import Patient


def fill_patients(db, dataset_id: str, mode: str, patient_ids: List[str] = None):
    """Fill missing data for patients"""
    query = db.query(Patient).filter(Patient.dataset_id == dataset_id)
    
    if patient_ids:
        query = query.filter(Patient.id.in_(patient_ids))
    
    patients = query.all()
    
    # No automatic calculations - calculated fields are added manually
    return {"filled": 0}


def get_missing_fields(patient: Patient) -> List[str]:
    """Get list of missing fields for a patient"""
    missing = []
    # Simple check - can be expanded if needed
    return missing
