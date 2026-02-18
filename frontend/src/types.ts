export interface Dataset {
  id: string
  name: string
  source_filename: string
  stored_path: string
  data_type?: string
  column_map?: Record<string, string>
  created_at: string
  patient_count?: number  // Number of patients created from this dataset
}

export interface Patient {
  id: string
  dataset_id: string
  patient_key: string
  
  // Patient identification & demographics
  date_of_service?: string
  location?: string
  mrn?: string
  first_name?: string
  last_name?: string
  reason_for_visit?: string
  
  // Data fields
  points?: number
  percent?: number
  category?: string
  pca_confirmed?: boolean
  gleason_grade?: string
  age_group?: string
  family_history?: string
  race?: string
  genetic_mutation?: string
  
  // Metadata
  raw?: Record<string, any>
  extra_fields?: Record<string, any>
  
  created_at: string
  updated_at: string
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  pages: number
}

export interface ReprocessCheckResponse {
  unmapped_columns: string[]
  extra_fields_columns: string[]
  missing_data_summary: Record<string, {
    field: string
    csv_column: string
    missing_count: number
    sample_values: Array<{
      patient_key: string
      mrn?: string
      value: string
    }>
  }>
  total_rows_in_file: number
  total_patients_in_db: number
  rows_with_missing_data: Array<{
    patient_key: string
    mrn?: string
    first_name?: string
    last_name?: string
    missing_fields: Record<string, {
      csv_value: any
      csv_column: string
    }>
  }>
}
