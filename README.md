# Data Manager

A full-stack application for managing patient data - upload CSV/Excel files, map columns, and view/manage patient records.

## Features

- **HIPAA Compliant**: Encryption at rest for PHI, audit logging, secure access controls
- **User Authentication**: Secure login, registration, password reset with email verification
- **Data Manager**: Upload CSV/Excel files, manage columns, and edit patient data all in one place
- **CSV/Excel Dataset Upload**: Upload patient datasets in CSV or Excel format
- **MRN-based Matching**: Automatically link patient data across files using Medical Record Numbers
- **Column Mapping**: Map CSV/Excel columns to canonical patient fields
- **Custom Fields**: Add and remove custom columns dynamically
- **Inline Editing**: Click any cell to edit patient data directly
- **Missing Data Analysis**: View missingness summary per dataset and per patient
- **Data Filling**: Fill missing data using strict mode, imputation mode, or compute BMI
- **Data Viewing**: View all patient data in a searchable, paginated table
- **Data Export**: Export patient data as CSV
- **Incremental Updates**: Upload new files to add/update existing patient records

## Tech Stack

### Backend
- FastAPI (Python)
- SQLAlchemy (ORM)
- Alembic (Migrations)
- PostgreSQL (Database)
- Pandas (Excel support)

### Frontend
- React 18
- TypeScript
- Vite
- TanStack Table
- React Hook Form
- Zod
- Axios

## HIPAA Compliance

This application implements HIPAA-compliant security measures:

- **Encryption at Rest**: All PHI fields (MRN, first_name, last_name) are encrypted using AES-128
- **Encryption in Transit**: HTTPS/TLS required (configure at deployment)
- **Access Controls**: User authentication and authorization required
- **Audit Logging**: All PHI access is logged with user, timestamp, IP address, and action
- **Secure Key Management**: Encryption keys stored as environment variables

**⚠️ IMPORTANT**: Before deploying to production:

1. Generate an encryption key:
   ```bash
   python backend/generate_encryption_key.py
   ```

2. Set required environment variables (see [HIPAA_COMPLIANCE.md](HIPAA_COMPLIANCE.md))

3. Configure HTTPS/TLS for encryption in transit

See [HIPAA_COMPLIANCE.md](HIPAA_COMPLIANCE.md) for detailed compliance information.

## Quick Start

### Using Docker Compose (Recommended)

1. **Start all services:**
   ```bash
   docker compose up
   ```

2. **Install pandas for Excel support (if needed):**
   ```bash
   docker compose exec backend pip install pandas openpyxl
   ```
   Or rebuild containers to include pandas:
   ```bash
   ./rebuild.sh
   ```
   
   **Note**: CSV files work out of the box. Excel files (.xlsx, .xls) require pandas and openpyxl.

3. **Access the application:**
   - Migrations run automatically on backend startup
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:8000
   - API Docs: http://localhost:8000/docs

### Local Development

#### Backend Setup

1. **Create virtual environment:**
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Set up PostgreSQL:**
   - Install PostgreSQL locally or use Docker:
     ```bash
     docker run -d --name postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=datamanagerdb -p 5432:5432 postgres:15-alpine
     ```

4. **Set environment variables:**
   ```bash
   export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/datamanagerdb
   export ENCRYPTION_KEY=$(python backend/generate_encryption_key.py | grep ENCRYPTION_KEY | cut -d'"' -f2)
   export SECRET_KEY="your-secret-key-for-jwt"
   ```

5. **Start the server:**
   ```bash
   uvicorn app.main:app --reload
   ```
   - Migrations run automatically on startup

#### Frontend Setup

1. **Install dependencies:**
   ```bash
   cd frontend
   npm install
   ```

2. **Start development server:**
   ```bash
   npm run dev
   ```

3. **Access the app:**
   - Frontend: http://localhost:5173

## Database Migrations

Migrations run automatically on backend startup. To manually create or apply migrations:

### Create a new migration:
```bash
cd backend
alembic revision --autogenerate -m "Description of changes"
```

### Apply migrations:
```bash
alembic upgrade head
```

### Rollback:
```bash
alembic downgrade -1
```

## API Endpoints

### Datasets
- `POST /api/datasets/upload` - Upload CSV (.csv) or Excel (.xlsx, .xls) dataset
- `GET /api/datasets` - List all datasets
- `GET /api/datasets/{id}` - Get dataset details
- `GET /api/datasets/{id}/columns` - Get detected CSV/Excel columns
- `GET /api/datasets/{id}/suggest-mappings` - Get suggested column mappings
- `POST /api/datasets/{id}/map` - Map columns and create/update patients
- `GET /api/datasets/{id}/raw-data` - Get raw file data

### Patients
- `GET /api/patients/all` - List all patients across all datasets (with pagination and search)
- `GET /api/patients/dataset/{dataset_id}` - List patients in dataset (with pagination and search)
- `GET /api/patients/{id}` - Get patient details
- `POST /api/patients` - Create a new patient
- `PATCH /api/patients/{id}` - Update patient
- `PATCH /api/patients/bulk-update` - Bulk update multiple patients
- `POST /api/patients/upload-file` - Upload CSV (.csv) or Excel (.xlsx, .xls) file to add/update patients (matches by MRN)
- `POST /api/patients/dataset/{dataset_id}/fill` - Fill missing data (strict/impute/compute_bmi)
- `GET /api/patients/dataset/{dataset_id}/missingness` - Get missingness summary
- `GET /api/patients/custom-fields` - Get list of all custom fields
- `POST /api/patients/add-custom-field` - Add a custom field to all patients
- `DELETE /api/patients/remove-custom-field` - Remove a custom field from all patients

### Fields
- `GET /api/canonical-fields` - Get all canonical field definitions

## Project Structure

```
data-manager/
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI app
│   │   ├── db.py             # Database setup
│   │   ├── models.py         # SQLAlchemy models
│   │   ├── schemas.py        # Pydantic schemas
│   │   ├── routes/           # API routes
│   │   │   ├── datasets.py  # Dataset management
│   │   │   ├── patients.py  # Patient management
│   │   │   └── fields.py    # Field definitions
│   │   └── epsa/
│   │       └── impute.py    # Data imputation logic
│   ├── alembic/              # Migrations
│   ├── uploads/              # Uploaded files
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── pages/            # Page components
│   │   │   ├── DatasetsPage.tsx
│   │   │   ├── DatasetDetailPage.tsx
│   │   │   ├── PatientsPage.tsx
│   │   │   ├── DataViewerPage.tsx
│   │   │   └── DataManagerPage.tsx
│   │   ├── components/       # Reusable components
│   │   ├── api/              # API client
│   │   └── types.ts          # TypeScript types
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
├── rebuild.sh                # Rebuild Docker containers
└── README.md
```

## Development Notes

- **File Format Support**: 
  - CSV files (.csv) are supported natively with automatic encoding detection (UTF-8, Latin-1)
  - Excel files (.xlsx, .xls) require pandas and openpyxl: `pip install pandas openpyxl`
- CSV/Excel files are stored in `backend/uploads/` directory
- Database migrations are automatically applied on backend startup
- The frontend uses Vite dev server for hot reloading
- Patient data is stored incrementally - new uploads update existing records or add new ones
- Both CSV and Excel files support MRN-based patient matching across datasets

## License

MIT
