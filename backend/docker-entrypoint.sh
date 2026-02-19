#!/bin/bash
set -e

echo "🚀 Starting backend..."

# Wait for PostgreSQL to be ready
if [ -n "$DATABASE_URL" ] && [[ "$DATABASE_URL" == postgresql* ]]; then
    echo "⏳ Waiting for PostgreSQL to be ready..."
    until pg_isready -h postgres -U postgres > /dev/null 2>&1; do
        echo "   PostgreSQL is unavailable - sleeping"
        sleep 1
    done
    echo "✅ PostgreSQL is ready!"
fi

# Run database migrations
echo "📦 Running database migrations..."
alembic upgrade head || {
    echo "⚠️  Migration failed, trying to create tables directly..."
    # If migrations fail, try to create tables directly (for SQLite or first run)
    python -c "from app.db import Base, engine; Base.metadata.create_all(bind=engine)" || {
        echo "⚠️  Could not create tables, but continuing..."
    }
}

echo "✅ Migrations complete!"

# Start the application
echo "🎯 Starting FastAPI server..."
exec "$@"
