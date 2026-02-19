# Docker Data Persistence Guide

## ✅ Automatic Migrations

The backend **automatically runs database migrations** on startup via `docker-entrypoint.sh`:

1. Waits for PostgreSQL to be ready
2. Runs `alembic upgrade head` to apply all migrations
3. Falls back to creating tables if migrations fail (for first run)
4. Starts the FastAPI server

**No manual migration steps needed!** 🎉

## ✅ Data Persistence

### PostgreSQL Volume (Persistent)

The `docker-compose.yml` uses a **named volume** for PostgreSQL:

```yaml
volumes:
  postgres_data:/var/lib/postgresql/data
```

This means:
- ✅ **Data persists** across container restarts
- ✅ **Data persists** when you run `docker compose down`
- ✅ **Data persists** when you rebuild containers
- ❌ **Data is lost** only when you run `docker compose down -v` (removes volumes)

### Configuration

Set in `.env`:
```bash
# Use PostgreSQL for persistent storage (recommended)
EPHEMERAL_STORAGE=false

# Don't clear data on startup
CLEAR_ON_STARTUP=false
```

### Verify Data Persistence

1. **Start containers:**
   ```bash
   docker compose up -d
   ```

2. **Create some data** (login, create session, upload dataset)

3. **Restart containers:**
   ```bash
   docker compose restart
   ```

4. **Check data is still there** ✅

5. **Stop and start:**
   ```bash
   docker compose down
   docker compose up -d
   ```

6. **Data should still be there** ✅

## Storage Modes

### Persistent Mode (Recommended)
```bash
# .env
EPHEMERAL_STORAGE=false
CLEAR_ON_STARTUP=false
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/datamanagerdb
```

- Uses PostgreSQL
- Data stored in Docker volume `postgres_data`
- Data persists across restarts
- **Recommended for production**

### Ephemeral Mode (Development/Testing)
```bash
# .env
EPHEMERAL_STORAGE=true
CLEAR_ON_STARTUP=true
```

- Uses SQLite file
- Data cleared on container restart
- Good for testing/development

## Backup PostgreSQL Data

### Manual Backup
```bash
# Backup
docker compose exec postgres pg_dump -U postgres datamanagerdb > backup.sql

# Restore
docker compose exec -T postgres psql -U postgres datamanagerdb < backup.sql
```

### Volume Backup
```bash
# Backup volume
docker run --rm -v data-manager_postgres_data:/data -v $(pwd):/backup alpine tar czf /backup/postgres_backup.tar.gz /data

# Restore volume
docker run --rm -v data-manager_postgres_data:/data -v $(pwd):/backup alpine tar xzf /backup/postgres_backup.tar.gz -C /
```

## Troubleshooting

### Migrations Not Running

Check logs:
```bash
docker compose logs backend | grep -i migration
```

Manual migration:
```bash
docker compose exec backend alembic upgrade head
```

### Data Not Persisting

1. **Check volume exists:**
   ```bash
   docker volume ls | grep postgres_data
   ```

2. **Check volume is mounted:**
   ```bash
   docker compose exec postgres ls -la /var/lib/postgresql/data
   ```

3. **Verify EPHEMERAL_STORAGE:**
   ```bash
   docker compose exec backend env | grep EPHEMERAL_STORAGE
   ```
   Should be `EPHEMERAL_STORAGE=false`

### Reset Database (⚠️ Deletes All Data)

```bash
# Stop containers and remove volumes
docker compose down -v

# Start fresh
docker compose up -d
```

## Production Checklist

- [x] `EPHEMERAL_STORAGE=false` in `.env`
- [x] `CLEAR_ON_STARTUP=false` in `.env`
- [x] PostgreSQL volume configured (`postgres_data`)
- [x] Migrations run automatically on startup
- [x] Regular backups configured
- [x] `SECRET_KEY` set securely
- [x] Database credentials secured

## Summary

✅ **Migrations**: Run automatically on startup  
✅ **Data Persistence**: PostgreSQL volume persists data  
✅ **No Manual Steps**: Just run `docker compose up`  

Your data will persist across container restarts! 🎉
