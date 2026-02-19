# Default image when building from repo root (e.g. Docker Hub automated builds).
# For local development with both frontend and backend, use: docker compose up --build
#
# This image uses ephemeral/session-based storage by default (SQLite).
# Set EPHEMERAL_STORAGE=false and DATABASE_URL to use PostgreSQL instead.
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies (minimal for SQLite, add postgresql-client if needed)
RUN apt-get update && apt-get install -y \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy backend application code
COPY backend/ .

EXPOSE 8000

# Use ephemeral storage by default (SQLite, cleared on restart)
# Override with: docker run -e EPHEMERAL_STORAGE=false -e DATABASE_URL=postgresql://...
ENV EPHEMERAL_STORAGE=true
ENV CLEAR_ON_STARTUP=true

# Run migrations and start server
# Note: Alembic migrations are primarily for PostgreSQL. For SQLite, tables are created automatically.
CMD alembic upgrade head || true && uvicorn app.main:app --host 0.0.0.0 --port 8000
