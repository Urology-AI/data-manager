import os
import re
import logging
from sqlalchemy import create_engine, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.engine import Engine

# Support both PostgreSQL and SQLite for ephemeral/session-based storage
# Use SQLite if EPHEMERAL_STORAGE=true or if DATABASE_URL is set to sqlite://
# Default to PostgreSQL for backward compatibility
USE_EPHEMERAL_STORAGE = os.getenv("EPHEMERAL_STORAGE", "false").lower() == "true"
DEFAULT_DATABASE_URL = os.getenv("DATABASE_URL")

if USE_EPHEMERAL_STORAGE and not DEFAULT_DATABASE_URL:
    # Use SQLite file-based database for ephemeral storage
    # File will be cleared on container restart or via API
    DATABASE_URL = "sqlite:///./data_manager_session.db"
elif DEFAULT_DATABASE_URL and DEFAULT_DATABASE_URL.startswith("sqlite"):
    DATABASE_URL = DEFAULT_DATABASE_URL
else:
    DATABASE_URL = DEFAULT_DATABASE_URL or "postgresql://postgres:postgres@localhost:5432/datamanagerdb"

Base = declarative_base()


def redact_sensitive_data(text):
    """Redact MRN, first_name, and last_name from text"""
    if not isinstance(text, str):
        return text
    
    # More comprehensive patterns to catch various formats
    # Redact MRN patterns (alphanumeric codes, can be in quotes or not)
    # Handle: 'mrn': 'J029843', "mrn": "J029843", 'mrn': J029843
    text = re.sub(r"['\"]?mrn['\"]?\s*:\s*['\"]?([A-Z0-9]+)['\"]?", r"'mrn': '[REDACTED]'", text, flags=re.IGNORECASE)
    
    # Redact first_name patterns - match any value after the key (including commas, spaces, etc.)
    # Handle: 'first_name': 'Williams Jr, Grady', "first_name": "Williams Jr, Grady"
    text = re.sub(r"['\"]?first_name['\"]?\s*:\s*['\"]([^'\"]+)['\"]", r"'first_name': '[REDACTED]'", text, flags=re.IGNORECASE)
    
    # Redact last_name patterns
    text = re.sub(r"['\"]?last_name['\"]?\s*:\s*['\"]([^'\"]+)['\"]", r"'last_name': '[REDACTED]'", text, flags=re.IGNORECASE)
    
    # Also handle in raw data and other formats (FN, LN)
    text = re.sub(r"['\"]?FN['\"]?\s*:\s*['\"]([^'\"]+)['\"]", r"'FN': '[REDACTED]'", text, flags=re.IGNORECASE)
    text = re.sub(r"['\"]?LN['\"]?\s*:\s*['\"]([^'\"]+)['\"]", r"'LN': '[REDACTED]'", text, flags=re.IGNORECASE)
    
    # Handle cases in 'raw' nested dictionaries
    text = re.sub(r"'raw':\s*\{[^}]*'FN':\s*['\"]([^'\"]+)['\"]", r"'raw': {...'FN': '[REDACTED]'", text, flags=re.IGNORECASE)
    text = re.sub(r"'raw':\s*\{[^}]*'LN':\s*['\"]([^'\"]+)['\"]", r"'raw': {...'LN': '[REDACTED]'", text, flags=re.IGNORECASE)
    
    return text


# Set up logging filter for SQLAlchemy to redact sensitive patient information
class SensitiveDataFilter(logging.Filter):
    def filter(self, record):
        # Only redact from string messages, don't modify args to avoid breaking uvicorn's format
        try:
            if hasattr(record, 'msg') and isinstance(record.msg, str):
                record.msg = redact_sensitive_data(record.msg)
        except Exception:
            # If anything goes wrong, just pass through unchanged
            pass
        return True


# Apply filter to SQLAlchemy loggers only
# Don't apply to uvicorn.access as it breaks the access log format
sqlalchemy_logger = logging.getLogger('sqlalchemy.engine')
sqlalchemy_logger.addFilter(SensitiveDataFilter())


# Use SQLAlchemy event listener to intercept and redact SQL statements
@event.listens_for(Engine, "before_cursor_execute")
def receive_before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    """Intercept SQL statements and redact PHI before logging"""
    # Redact sensitive data from SQL statement string
    redacted_statement = redact_sensitive_data(statement)
    
    # Redact sensitive data from parameters
    if parameters:
        if isinstance(parameters, dict):
            redacted_params = {}
            for key, value in parameters.items():
                if key in ['mrn', 'first_name', 'last_name', 'FN', 'LN']:
                    redacted_params[key] = '[REDACTED]'
                else:
                    redacted_params[key] = value
            parameters = redacted_params
        elif isinstance(parameters, (list, tuple)):
            # For positional parameters, we can't easily identify which is which
            # So we'll redact any string that looks like a name or MRN
            redacted_params = []
            for param in parameters:
                if isinstance(param, str):
                    # Check if it looks like a name or MRN
                    if re.match(r'^[A-Z][a-z]+', param) or re.match(r'^[A-Z0-9]{6,}', param):
                        redacted_params.append('[REDACTED]')
                    else:
                        redacted_params.append(param)
                else:
                    redacted_params.append(param)
            parameters = tuple(redacted_params) if isinstance(parameters, tuple) else redacted_params
    
    return redacted_statement, parameters


# Configure engine based on database type
if DATABASE_URL.startswith("sqlite"):
    # SQLite-specific configuration for ephemeral storage
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},  # Needed for SQLite
        pool_pre_ping=True
    )
else:
    # PostgreSQL configuration
    engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    """Dependency for getting database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
