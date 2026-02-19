"""
Session management routes for ephemeral data management.
Allows clearing all data to start fresh sessions.
"""
import logging
import shutil
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import delete
from app.db import get_db
from app.models import Dataset, Patient, User, DataSession
from app.auth import get_current_session
from typing import Tuple

logger = logging.getLogger(__name__)
router = APIRouter()

# Upload directory path
UPLOAD_DIR = Path("uploads")


@router.delete("/clear-all")
async def clear_all_data(
    db: Session = Depends(get_db),
    session_context: Tuple[User, DataSession] = Depends(get_current_session),
):
    """
    Clear all data for the current unlocked session - deletes all datasets and patients in this session, and their uploaded files.
    """
    current_user, data_session = session_context
    try:
        datasets = db.query(Dataset).filter(
            Dataset.user_id == current_user.id,
            Dataset.session_id == data_session.id,
        ).all()
        
        deleted_files = []
        for dataset in datasets:
            file_path = Path(dataset.stored_path)
            if file_path.exists():
                try:
                    file_path.unlink()
                    deleted_files.append(str(file_path))
                    logger.info(f"Deleted file: {file_path}")
                except Exception as e:
                    logger.warning(f"Could not delete file {file_path}: {e}")
        
        patient_count = db.query(Patient).join(Dataset).filter(
            Dataset.user_id == current_user.id,
            Dataset.session_id == data_session.id,
        ).count()
        db.query(Patient).join(Dataset).filter(
            Dataset.user_id == current_user.id,
            Dataset.session_id == data_session.id,
        ).delete(synchronize_session=False)
        logger.info(f"Deleted {patient_count} patient records")
        
        dataset_count = len(datasets)
        db.query(Dataset).filter(
            Dataset.user_id == current_user.id,
            Dataset.session_id == data_session.id,
        ).delete(synchronize_session=False)
        logger.info(f"Deleted {dataset_count} dataset records")
        
        # Commit all deletions
        db.commit()
        
        return {
            "message": "All data cleared successfully",
            "deleted": {
                "datasets": dataset_count,
                "patients": patient_count,
                "files": len(deleted_files)
            }
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error clearing data: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to clear data: {str(e)}"
        )


@router.get("/stats")
async def get_session_stats(
    db: Session = Depends(get_db),
    session_context: Tuple[User, DataSession] = Depends(get_current_session),
):
    """Get current unlocked session's statistics (datasets, patients, files in this session)."""
    current_user, data_session = session_context
    from sqlalchemy import func
    
    dataset_count = db.query(func.count(Dataset.id)).filter(
        Dataset.user_id == current_user.id,
        Dataset.session_id == data_session.id,
    ).scalar() or 0
    
    patient_count = db.query(func.count(Patient.id)).join(Dataset).filter(
        Dataset.user_id == current_user.id,
        Dataset.session_id == data_session.id,
    ).scalar() or 0
    
    user_datasets = db.query(Dataset).filter(
        Dataset.user_id == current_user.id,
        Dataset.session_id == data_session.id,
    ).all()
    file_count = sum(1 for d in user_datasets if Path(d.stored_path).exists())
    
    return {
        "datasets": dataset_count,
        "patients": patient_count,
        "uploaded_files": file_count
    }
