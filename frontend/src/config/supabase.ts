// Supabase Configuration
// Add your Supabase credentials here to pre-configure the connection

export const SUPABASE_CONFIG = {
  // 🔗 Replace with your actual Supabase URL
  URL: import.meta.env.VITE_SUPABASE_URL || 'https://your-project-id.supabase.co',
  
  // 🔑 Replace with your actual Supabase API Key
  // Use service_role key for full access, or anon key for read-only
  API_KEY: import.meta.env.VITE_SUPABASE_API_KEY || 'your-supabase-api-key-here',
  
  // 📊 Default table name for patient data
  PATIENTS_TABLE: import.meta.env.VITE_SUPABASE_PATIENTS_TABLE || 'patients',
  
  // 🏥 Optional: Default schema for patient records
  DEFAULT_SCHEMA: [
    { field: 'id', label: 'Patient ID', type: 'string', required: true },
    { field: 'mrn', label: 'Medical Record Number', type: 'string', required: true },
    { field: 'first_name', label: 'First Name', type: 'string', required: true },
    { field: 'last_name', label: 'Last Name', type: 'string', required: true },
    { field: 'email', label: 'Email', type: 'string', required: false },
    { field: 'phone', label: 'Phone', type: 'string', required: false },
    { field: 'age', label: 'Age', type: 'number', required: false },
    { field: 'glucose_level', label: 'Glucose Level', type: 'number', required: false },
    { field: 'bmi', label: 'BMI', type: 'number', required: false },
    { field: 'blood_pressure', label: 'Blood Pressure', type: 'number', required: false },
    { field: 'pregnancies', label: 'Pregnancies', type: 'number', required: false },
    { field: 'insulin_level', label: 'Insulin Level', type: 'number', required: false },
    { field: 'skin_thickness', label: 'Skin Thickness', type: 'number', required: false },
    { field: 'diabetes_pedigree', label: 'Diabetes Pedigree', type: 'number', required: false },
    { field: 'outcome', label: 'Diabetes Outcome', type: 'number', required: false },
    { field: 'created_at', label: 'Created At', type: 'timestamp', required: true }
  ]
}

// 🔧 Helper function to check if Supabase is configured
export const isSupabaseConfigured = (): boolean => {
  return SUPABASE_CONFIG.URL !== 'https://your-project-id.supabase.co' && 
         SUPABASE_CONFIG.API_KEY !== 'your-supabase-api-key-here'
}

// 🚀 Initialize Supabase client (when configured)
export const createSupabaseClient = () => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_API_KEY environment variables.')
  }
  
  // This would be used when we implement the actual Supabase client
  // import { createClient } from '@supabase/supabase-js'
  // return createClient(SUPABASE_CONFIG.URL, SUPABASE_CONFIG.API_KEY)
  
  return { url: SUPABASE_CONFIG.URL, key: SUPABASE_CONFIG.API_KEY }
}
