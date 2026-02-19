from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from app.db import engine, Base, DATABASE_URL
from app.routes import datasets, patients, fields, session, auth
from app.middleware import AuditMiddleware
from app.audit import AuditLog
import logging
from alembic import command
from alembic.config import Config
import os
import time
from sqlalchemy import text

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def wait_for_database(max_retries=30, retry_delay=1):
    """Wait for database to be ready"""
    for i in range(max_retries):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            logger.info("✅ Database connection ready")
            return True
        except Exception as e:
            if i < max_retries - 1:
                logger.debug(f"Waiting for database... ({i+1}/{max_retries})")
                time.sleep(retry_delay)
            else:
                logger.warning(f"⚠️  Database not ready after {max_retries} retries: {e}")
                return False
    return False

def run_migrations_automatically():
    """Automatically detect and apply database migrations on startup"""
    try:
        # Wait for database to be ready
        if not wait_for_database():
            logger.warning("⚠️  Skipping migrations - database not ready")
            return
        
        logger.info("🔄 Applying database migrations...")
        
        # Get Alembic config - handle both local and Docker paths
        current_dir = os.path.dirname(os.path.abspath(__file__))
        backend_dir = os.path.dirname(current_dir)
        alembic_ini_path = os.path.join(backend_dir, "alembic.ini")
        
        # Fallback: try relative to current working directory
        if not os.path.exists(alembic_ini_path):
            alembic_ini_path = "alembic.ini"
        
        if not os.path.exists(alembic_ini_path):
            logger.warning(f"⚠️  Could not find alembic.ini at {alembic_ini_path}")
            return
        
        alembic_cfg = Config(alembic_ini_path)
        alembic_cfg.set_main_option("sqlalchemy.url", DATABASE_URL)
        
        # Apply any pending migrations first
        try:
            command.upgrade(alembic_cfg, "head")
            logger.info("✅ Pending migrations applied")
        except Exception as e:
            logger.error(f"❌ Migration upgrade failed: {e}")
            logger.error("💡 Please check the migration files and fix any errors")
            return  # Don't try to create new migrations if upgrade failed
        
        # NOTE: Auto-generation of migrations is DISABLED on startup to prevent infinite loops
        # Migrations should be created manually using: alembic revision --autogenerate -m "description"
        
    except Exception as e:
        logger.error(f"❌ Could not run automatic migrations: {e}", exc_info=True)
        logger.info("💡 Database will use existing schema")

# Run migrations automatically on startup
run_migrations_automatically()

# Create tables (fallback if migrations don't cover everything)
# This includes User, Dataset, Patient, and AuditLog tables
# AuditLog uses the same Base, so it will be created automatically
Base.metadata.create_all(bind=engine)

# Auto-clear data on startup if EPHEMERAL_STORAGE and CLEAR_ON_STARTUP are enabled
CLEAR_ON_STARTUP = os.getenv("CLEAR_ON_STARTUP", "false").lower() == "true"
USE_EPHEMERAL_STORAGE = os.getenv("EPHEMERAL_STORAGE", "false").lower() == "true"

if CLEAR_ON_STARTUP or USE_EPHEMERAL_STORAGE:
    try:
        from app.db import SessionLocal
        from app.models import Dataset, Patient
        from sqlalchemy import delete
        from pathlib import Path
        
        logger.info("🔄 Clearing all data on startup (ephemeral/session mode)...")
        db = SessionLocal()
        try:
            # Delete all patients
            patient_count = db.query(Patient).count()
            db.execute(delete(Patient))
            
            # Delete all datasets and their files
            datasets = db.query(Dataset).all()
            dataset_count = len(datasets)
            upload_dir = Path("uploads")
            
            for dataset in datasets:
                file_path = Path(dataset.stored_path)
                if file_path.exists():
                    try:
                        file_path.unlink()
                    except Exception:
                        pass
            
            db.execute(delete(Dataset))
            db.commit()
            
            # Clean upload directory
            if upload_dir.exists():
                for file_path in upload_dir.iterdir():
                    if file_path.is_file():
                        try:
                            file_path.unlink()
                        except Exception:
                            pass
            
            logger.info(f"✅ Cleared {dataset_count} datasets and {patient_count} patients on startup")
        except Exception as e:
            db.rollback()
            logger.warning(f"⚠️  Could not clear data on startup: {e}")
        finally:
            db.close()
    except Exception as e:
        logger.warning(f"⚠️  Could not initialize data clearing: {e}")

app = FastAPI(
    title="Data Manager API",
    description="API for managing patient data - upload files, manage columns, and edit records",
    version="1.0.0"
)

# Audit middleware (must be first to capture request metadata)
app.add_middleware(AuditMiddleware)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix="/api/auth", tags=["authentication"])
app.include_router(datasets.router, prefix="/api/datasets", tags=["datasets"])
app.include_router(patients.router, prefix="/api/patients", tags=["patients"])
app.include_router(fields.router, prefix="/api", tags=["fields"])
app.include_router(session.router, prefix="/api/session", tags=["session"])


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.get("/")
async def root():
    return {"message": "Data Manager API"}
