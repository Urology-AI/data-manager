"""
HIPAA-compliant audit logging for PHI access.
Tracks who accessed what patient data and when.
"""
import logging
import os
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.db import Base as DBBase, DATABASE_URL
import uuid

# Use PostgreSQL UUID if available, otherwise use String for SQLite compatibility
if DATABASE_URL.startswith("sqlite"):
    UUIDType = String(36)
    def uuid_default():
        return str(uuid.uuid4())
else:
    from sqlalchemy.dialects.postgresql import UUID as PostgresUUID
    UUIDType = PostgresUUID(as_uuid=True)
    def uuid_default():
        return uuid.uuid4()


class AuditLog(DBBase):
    """
    Audit log table for HIPAA compliance.
    Records all access to PHI (Protected Health Information).
    """
    __tablename__ = "audit_logs"

    id = Column(UUIDType, primary_key=True, default=uuid_default)
    user_id = Column(UUIDType, ForeignKey("users.id"), nullable=False, index=True)
    action = Column(String, nullable=False)  # 'view', 'create', 'update', 'delete', 'export'
    resource_type = Column(String, nullable=False)  # 'patient', 'dataset'
    resource_id = Column(UUIDType, nullable=False, index=True)
    patient_id = Column(UUIDType, nullable=True, index=True)  # If accessing a patient
    field_accessed = Column(String, nullable=True)  # Which PHI field was accessed
    ip_address = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    details = Column(Text, nullable=True)  # JSON string with additional details
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    user = relationship("User", foreign_keys=[user_id])


# Configure audit logger
audit_logger = logging.getLogger("audit")
audit_logger.setLevel(logging.INFO)

# Create file handler for audit logs if AUDIT_LOG_FILE is set
audit_log_file = os.getenv("AUDIT_LOG_FILE")
if audit_log_file:
    file_handler = logging.FileHandler(audit_log_file)
    file_handler.setLevel(logging.INFO)
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    file_handler.setFormatter(formatter)
    audit_logger.addHandler(file_handler)


def log_phi_access(
    db_session,
    user_id,
    action: str,
    resource_type: str,
    resource_id,
    patient_id=None,
    field_accessed=None,
    ip_address=None,
    user_agent=None,
    details=None
):
    """
    Log access to PHI for HIPAA compliance.
    
    Args:
        db_session: Database session
        user_id: ID of user accessing the data
        action: Action performed ('view', 'create', 'update', 'delete', 'export')
        resource_type: Type of resource ('patient', 'dataset')
        resource_id: ID of the resource accessed
        patient_id: ID of patient if accessing patient data
        field_accessed: Specific PHI field accessed (e.g., 'mrn', 'first_name', 'last_name')
        ip_address: IP address of the request
        user_agent: User agent string
        details: Additional details as JSON string
    """
    try:
        audit_entry = AuditLog(
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            patient_id=patient_id,
            field_accessed=field_accessed,
            ip_address=ip_address,
            user_agent=user_agent,
            details=details
        )
        db_session.add(audit_entry)
        db_session.commit()
        
        # Also log to file/console
        log_message = (
            f"PHI_ACCESS - User: {user_id}, Action: {action}, "
            f"Resource: {resource_type}/{resource_id}, "
            f"Patient: {patient_id}, Field: {field_accessed}"
        )
        audit_logger.info(log_message)
        
    except Exception as e:
        db_session.rollback()
        audit_logger.error(f"Failed to log PHI access: {e}", exc_info=True)
