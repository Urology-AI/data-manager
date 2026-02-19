#!/bin/bash
set -e

echo "🚀 Starting backend..."

# Create Firebase credentials file from environment variable if it exists
if [ -n "$FIREBASE_CREDENTIALS_JSON" ] && [ -n "$FIREBASE_SERVICE_ACCOUNT_KEY_PATH" ]; then
    echo "📦 Creating Firebase credentials file..."
    echo "$FIREBASE_CREDENTIALS_JSON" > "$FIREBASE_SERVICE_ACCOUNT_KEY_PATH"
    echo "✅ Firebase credentials file created at $FIREBASE_SERVICE_ACCOUNT_KEY_PATH"
fi


# Wait for PostgreSQL to be ready
if [ -n "$DATABASE_URL" ] && [[ "$DATABASE_URL" == postgresql* ]]; then
    echo "⏳ Waiting for PostgreSQL to be ready..."

    # Export the DATABASE_URL so it's available to alembic
    export DATABASE_URL

    # Extract host and user from DATABASE_URL (e.g., postgresql://user:pass@host:port/db)
    DB_HOST=$(echo $DATABASE_URL | sed -n 's|.*@\([^:]*\):.*|\1|p')
    DB_USER=$(echo $DATABASE_URL | sed -n 's|postgresql://\([^:]*\):.*|\1|p')

    until pg_isready -h "$DB_HOST" -U "$DB_USER" > /dev/null 2>&1; do
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
