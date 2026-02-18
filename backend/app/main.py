from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.db import engine, Base, DATABASE_URL
from app.routes import datasets, patients, fields
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
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Data Manager API",
    description="API for managing patient data - upload files, manage columns, and edit records",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(datasets.router, prefix="/api/datasets", tags=["datasets"])
app.include_router(patients.router, prefix="/api/patients", tags=["patients"])
app.include_router(fields.router, prefix="/api", tags=["fields"])


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.get("/")
async def root():
    return {"message": "Data Manager API"}
