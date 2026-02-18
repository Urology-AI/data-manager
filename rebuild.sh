#!/bin/bash
# Script to rebuild Docker containers with latest code
# NOTE: This will NOT delete your database! The postgres_data volume persists.

echo "🔄 Rebuilding Docker containers..."
echo "⚠️  Database will be preserved (postgres_data volume is not removed)"

# Stop existing containers (without removing volumes)
docker compose down --remove-orphans

# Rebuild and start containers
echo "🔨 Building backend..."
docker compose build --no-cache backend

echo "🚀 Starting containers..."
docker compose up -d

# Wait for database to be ready
echo "⏳ Waiting for database to be ready..."
sleep 5

# Run database migrations
echo "📊 Applying database migrations..."
# Only apply existing migrations - do NOT auto-generate (prevents infinite loops)
docker compose exec -T backend alembic upgrade head || {
    echo "⚠️  Migration failed - check for errors above"
    echo "💡 If you see 'Can't locate revision', you may need to fix the migration chain"
    echo "💡 Run: docker compose exec backend alembic stamp head"
}

echo ""
echo "✅ Containers rebuilt and started!"
echo ""
echo "📊 Database is safe - postgres_data volume preserved"
echo "📝 To view logs: docker compose logs -f"
echo "📦 To install pandas: docker compose exec backend pip install pandas openpyxl"
echo "🔄 To create new migration: docker compose exec backend alembic revision --autogenerate -m 'Description'"
echo ""
echo "⚠️  To DELETE database (use with caution): docker compose down -v"
