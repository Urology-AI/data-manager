# Database Structure - Data Manager

## Overview
The database stores **patient data** where each row in the `patients` table represents one patient record with their data fields.

## Why PostgreSQL?
While you mentioned "SQL isn't the best for this", we're using PostgreSQL with **JSON fields** (`raw` and `extra_fields`) which gives us:
- ✅ Structured data in columns (fast queries, indexing)
- ✅ Flexible JSON fields for dynamic/extra data
- ✅ Best of both worlds: SQL reliability + NoSQL flexibility

## Database Schema

### `datasets` Table
Stores information about uploaded files:
- `id` - Unique identifier
- `name` - Dataset name (usually filename)
- `source_filename` - Original filename
- `stored_path` - Path to uploaded file
- `data_type` - Type of data: `"epsa"`, `"generic"`, or `"custom"` (NEW!)
- `column_map` - JSON mapping of CSV columns to canonical fields
- `created_at` - Upload timestamp

### `patients` Table
Each row = one patient with their data:

#### Patient Identification Fields
- `id` - Unique patient ID
- `dataset_id` - Which dataset this patient came from
- `patient_key` - Unique key within dataset (usually MRN or row number)
- `mrn` - Medical Record Number (for matching across datasets)
- `first_name` - Patient first name
- `last_name` - Patient last name
- `date_of_service` - When patient was seen
- `location` - Where patient was seen
- `reason_for_visit` - Why patient came in

**Why first_name/last_name?** These are standard patient identification fields used to:
- Match patients across datasets
- Display patient info in the UI
- Search/filter patients
- Maintain HIPAA compliance (identifiers needed for medical records)

#### Clinical Data Fields
- `points` - Numeric score/points
- `percent` - Percentage value
- `category` - Category classification
- `pca_confirmed` - Boolean: PCa confirmed?
- `gleason_grade` - Gleason grade (GG)
- `age_group` - Age group classification
- `family_history` - Family history (FH of prostate)
- `race` - Race/ethnicity
- `genetic_mutation` - Genetic risk factors

#### Flexible Data Storage
- `raw` - JSON field storing ALL original CSV/Excel data (complete backup)
- `extra_fields` - JSON field storing unmapped columns that don't fit canonical fields

## How It Works

1. **Upload File** → Dataset Manager
   - User selects data type: "ePSA", "Generic", or "Custom"
   - File is uploaded and stored
   - Columns are detected

2. **Map Columns** → Dataset Manager
   - System suggests mappings based on data type
   - User confirms/adjusts mappings
   - Unmapped columns go to `extra_fields`

3. **Create Patients** → Dataset Manager
   - Each CSV/Excel row becomes one patient record
   - Data is mapped to canonical fields
   - Extra columns stored in `extra_fields` JSON

4. **View/Edit Data** → Data Manager
   - View all patients across all datasets
   - Edit any field inline
   - Add/remove custom columns (stored in `extra_fields`)

## Data Type Selection

When uploading, you can select:
- **"epsa"** - Uses ePSA-specific field patterns for matching
- **"generic"** - Uses general patterns (default)
- **"custom"** - For future custom data types

This allows the column matcher to use appropriate patterns for different data types.

## Notes

- **Each patient = one row** in the database (not normalized across tables)
- **Extra data** goes in JSON fields (`extra_fields`) for flexibility
- **All original data** preserved in `raw` JSON field
- **MRN matching** allows updating existing patients across datasets
- **PostgreSQL JSON** gives us NoSQL-like flexibility within SQL structure
