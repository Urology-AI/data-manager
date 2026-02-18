import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Float, DateTime, ForeignKey, JSON, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.db import Base


class Dataset(Base):
    __tablename__ = "datasets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    source_filename = Column(String, nullable=False)
    stored_path = Column(String, nullable=False)
    data_type = Column(String, nullable=True, default="generic")  # e.g., "epsa", "generic", "custom"
    column_map = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    patients = relationship("Patient", back_populates="dataset", cascade="all, delete-orphan")


class Patient(Base):
    __tablename__ = "patients"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    dataset_id = Column(UUID(as_uuid=True), ForeignKey("datasets.id"), nullable=False)
    patient_key = Column(String, nullable=False)

    # Patient identification & demographics
    date_of_service = Column(DateTime, nullable=True)
    location = Column(String, nullable=True)
    mrn = Column(String, nullable=True)
    first_name = Column(String, nullable=True)
    last_name = Column(String, nullable=True)
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
