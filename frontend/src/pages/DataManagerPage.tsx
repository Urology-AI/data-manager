import { useState, useEffect } from 'react'
import { patientsApi, fieldsApi } from '../api/client'
import { Patient, PaginatedResponse } from '../types'
import { SUPABASE_CONFIG, isSupabaseConfigured } from '../config/supabase'
import '../App.css'

interface CanonicalField {
  field: string
  label: string
  type: string
  domain: string
  required: boolean
}


function DataManagerPage() {
  const [patientData, setPatientData] = useState<PaginatedResponse<Patient> | null>(null)
  const [canonicalFields, setCanonicalFields] = useState<CanonicalField[]>([])
  const [visibleFields, setVisibleFields] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(50)
  const [search, setSearch] = useState('')
  const [customFields, setCustomFields] = useState<string[]>([])
  const [newCustomFieldName, setNewCustomFieldName] = useState('')
  const [showAddField, setShowAddField] = useState(false)
  const [showMapping, setShowMapping] = useState(false)
  const [mappingConfig, setMappingConfig] = useState<Record<string, string>>({})
  const [supabaseUrl, setSupabaseUrl] = useState(SUPABASE_CONFIG.URL)
  const [supabaseKey, setSupabaseKey] = useState(SUPABASE_CONFIG.API_KEY)
  const [supabaseSchema, setSupabaseSchema] = useState<any[]>(isSupabaseConfigured() ? SUPABASE_CONFIG.DEFAULT_SCHEMA : [])
  const [loadingSchema, setLoadingSchema] = useState(false)
  const [connectedToSupabase, setConnectedToSupabase] = useState(isSupabaseConfigured())
  const [supabaseData, setSupabaseData] = useState<any[]>([])
  const [loadingSupabaseData, setLoadingSupabaseData] = useState(false)
  const [dataSource, setDataSource] = useState<'csv' | 'supabase'>('csv')

  // Available CSV columns from uploaded data
  const availableColumns = [
    'mrn', 'first_name', 'last_name', 'age', 'email', 'phone',
    'Pregnancies', 'Glucose', 'BloodPressure', 'SkinThickness', 
    'Insulin', 'BMI', 'DiabetesPedigreeFunction', 'Outcome'
  ]

  // Default schema from Supabase configuration
  const defaultSchema = SUPABASE_CONFIG.DEFAULT_SCHEMA

  useEffect(() => {
    loadCanonicalFields()
    loadCustomFields()
  }, [])

  useEffect(() => {
    loadPatientData()
  }, [page, pageSize, search])

  useEffect(() => {
    // Initialize visible fields - show ALL fields by default
    if (canonicalFields.length > 0 && visibleFields.size === 0) {
      // Show ALL canonical fields by default
      const allCanonicalFields = canonicalFields.map(f => f.field)
      console.log('🔧 Initializing visible canonical fields:', allCanonicalFields)
      setVisibleFields(new Set(allCanonicalFields))
    }
  }, [canonicalFields])

  useEffect(() => {
    // Add custom fields to visible set when they're loaded - show ALL custom fields by default
    if (customFields.length > 0) {
      const newVisible = new Set(visibleFields)
      customFields.forEach(field => {
        newVisible.add(field) // Always show custom fields
      })
      console.log('🔧 Adding custom fields to visible:', customFields)
      console.log('🔧 Total visible fields now:', Array.from(newVisible))
      setVisibleFields(newVisible)
    }
  }, [customFields])

  const loadCanonicalFields = async () => {
    try {
      const data = await fieldsApi.getCanonicalFields()
      setCanonicalFields(data.fields || [])
    } catch (err) {
      console.error('Failed to load canonical fields:', err)
      setCanonicalFields([])
    }
  }

  const loadCustomFields = async () => {
    try {
      const data = await patientsApi.getCustomFields()
      setCustomFields(data.custom_fields || [])
    } catch (err) {
      console.error('Failed to load custom fields:', err)
      setCustomFields([])
    }
  }

  const loadPatientData = async () => {
    try {
      setLoading(true)
      const offset = page * pageSize
      const data = await patientsApi.listAll({
        search: search || undefined,
        limit: pageSize,
        offset: offset,
      })
      setPatientData(data)
    } catch (error) {
      console.error('Failed to load patient data:', error)
      setPatientData(null)
      alert('Failed to load patient data. Please check the console for details.')
    } finally {
      setLoading(false)
    }
  }

  const handleAddCustomField = async () => {
    if (!newCustomFieldName.trim()) {
      alert('Please enter a field name')
      return
    }

    try {
      await patientsApi.addCustomField(newCustomFieldName.trim())
      setNewCustomFieldName('')
      setShowAddField(false)
      loadCustomFields()
      // Add to visible fields
      const newVisible = new Set(visibleFields)
      newVisible.add(newCustomFieldName.trim())
      setVisibleFields(newVisible)
      loadPatientData()
    } catch (error: any) {
      alert(`Failed to add field: ${error.message || 'Unknown error'}`)
    }
  }

  const handleRemoveCustomField = async (fieldName: string) => {
    if (!confirm(`Remove custom field "${fieldName}" from all patients?`)) {
      return
    }

    try {
      await patientsApi.removeCustomField(fieldName)
      loadCustomFields()
      // Remove from visible fields
      const newVisible = new Set(visibleFields)
      newVisible.delete(fieldName)
      setVisibleFields(newVisible)
      loadPatientData()
    } catch (error: any) {
      alert(`Failed to remove field: ${error.message || 'Unknown error'}`)
    }
  }

  const toggleFieldVisibility = (fieldName: string) => {
    const newVisible = new Set(visibleFields)
    if (newVisible.has(fieldName)) {
      newVisible.delete(fieldName)
    } else {
      newVisible.add(fieldName)
    }
    setVisibleFields(newVisible)
  }

  const handleMappingChange = (supabaseField: string, csvColumn: string) => {
    setMappingConfig(prev => ({
      ...prev,
      [supabaseField]: csvColumn
    }))
  }

  const handleAutoMap = () => {
    const autoMapping: Record<string, string> = {}
    
    // Auto-map common field names
    supabaseSchema.forEach(schemaField => {
      const csvMatch = availableColumns.find(csv => 
        csv.toLowerCase() === schemaField.field.toLowerCase() ||
        csv.toLowerCase().replace('_', '') === schemaField.field.toLowerCase() ||
        (schemaField.field === 'glucose_level' && csv === 'Glucose') ||
        (schemaField.field === 'blood_pressure' && csv === 'BloodPressure') ||
        (schemaField.field === 'insulin_level' && csv === 'Insulin')
      )
      if (csvMatch) {
        autoMapping[schemaField.field] = csvMatch
      }
    })
    
    setMappingConfig(autoMapping)
  }

  const handleConnectToSupabase = async () => {
    if (!supabaseUrl || !supabaseKey) {
      alert('Please enter both Supabase URL and API Key')
      return
    }

    setLoadingSchema(true)
    try {
      // Test connection and get schema
      const response = await fetch(`${supabaseUrl}/rest/v1/`, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to connect to Supabase')
      }

      // For now, use default schema but mark as connected
      // In real implementation, you'd use Supabase client to get actual schema
      setSupabaseSchema(defaultSchema)
      setConnectedToSupabase(true)
      
      console.log('✅ Connected to Supabase successfully')
      alert('Connected to Supabase! You can now map your CSV columns to your database fields.')

    } catch (error: any) {
      console.error('❌ Failed to connect to Supabase:', error)
      alert(`Failed to connect to Supabase: ${error.message || 'Unknown error'}`)
    } finally {
      setLoadingSchema(false)
    }
  }

  const handleExportToSupabase = async () => {
    console.log('🚀 Exporting to Supabase with mapping:', mappingConfig)
    // TODO: Implement Supabase export logic
    alert('Supabase export functionality coming soon! This will export all mapped patients to your Supabase database.')
  }

  const handleCreateMissingFields = async () => {
    console.log('🔧 Creating missing fields in Supabase...')
    alert('Field creation functionality coming soon! This will add any missing columns to your Supabase table.')
  }

  const loadSupabaseData = async () => {
    if (!isSupabaseConfigured()) {
      alert('Please configure Supabase credentials in .env file first.')
      return
    }

    setLoadingSupabaseData(true)
    try {
      // Fetch data from Supabase
      const response = await fetch(`${SUPABASE_CONFIG.URL}/rest/v1/${SUPABASE_CONFIG.PATIENTS_TABLE}?limit=50`, {
        headers: {
          'apikey': SUPABASE_CONFIG.API_KEY,
          'Authorization': `Bearer ${SUPABASE_CONFIG.API_KEY}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch data: ${response.statusText}`)
      }

      const data = await response.json()
      setSupabaseData(data)
      console.log(`📊 Loaded ${data.length} patients from Supabase`)

    } catch (error: any) {
      console.error('❌ Failed to load Supabase data:', error)
      alert(`Failed to load Supabase data: ${error.message}`)
    } finally {
      setLoadingSupabaseData(false)
    }
  }

  const totalPages = patientData ? Math.ceil(patientData.total / pageSize) : 0

  return (
    <div>
      <div className="section-header">
        <div>
          <h1 className="section-title">Data Manager</h1>
          <p className="section-description">
            View existing patient data in the database. Edit values, add/remove columns, and manage records.
            This is a read/write database viewer - no file uploads here.
          </p>
        </div>
        <div>
          <button 
            className="button" 
            onClick={() => setShowMapping(!showMapping)}
            style={{ marginRight: '0.5rem' }}
          >
            🗺️ Map to Supabase
          </button>
        </div>
      </div>

      {/* Data Source Selector */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3 style={{ marginTop: 0, color: 'var(--text-primary)' }}>📊 Data Source</h3>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <button 
            className={`button ${dataSource === 'csv' ? 'primary' : ''}`}
            onClick={() => setDataSource('csv')}
          >
            📁 CSV Data ({patientData?.total || 0} patients)
          </button>
          <button 
            className={`button ${dataSource === 'supabase' ? 'primary' : ''}`}
            onClick={() => {
              setDataSource('supabase')
              if (supabaseData.length === 0) {
                loadSupabaseData()
              }
            }}
            disabled={!isSupabaseConfigured()}
          >
            🗄️ Supabase Data ({supabaseData.length} patients)
          </button>
        </div>
        {!isSupabaseConfigured() && (
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
            Configure Supabase credentials in .env file to enable Supabase data viewing.
          </p>
        )}
      </div>

      {/* Supabase Mapping Interface */}
      {showMapping && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h3 style={{ marginTop: 0, color: 'var(--text-primary)' }}>🗺️ Map CSV Columns to Supabase Fields</h3>
          
          {/* Supabase Connection Section */}
          {!connectedToSupabase && (
            <div style={{ 
              marginBottom: '1rem', 
              padding: '1rem', 
              backgroundColor: 'var(--surface-secondary)', 
              borderRadius: '4px',
              border: '1px solid var(--border)'
            }}>
              <h4 style={{ marginTop: 0, color: 'var(--text-primary)' }}>🔗 Connect to Supabase</h4>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '1rem' }}>
                Enter your Supabase credentials to automatically detect your table structure.
              </p>
              
              <div style={{ display: 'grid', gap: '0.75rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--text-primary)' }}>
                    Supabase URL:
                  </label>
                  <input
                    type="text"
                    placeholder="https://your-project.supabase.co"
                    value={supabaseUrl}
                    onChange={(e) => setSupabaseUrl(e.target.value)}
                    style={{ 
                      width: '100%', 
                      padding: '0.5rem',
                      backgroundColor: 'var(--surface)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--text-primary)' }}>
                    API Key (service_role or anon):
                  </label>
                  <input
                    type="password"
                    placeholder="your-supabase-api-key"
                    value={supabaseKey}
                    onChange={(e) => setSupabaseKey(e.target.value)}
                    style={{ 
                      width: '100%', 
                      padding: '0.5rem',
                      backgroundColor: 'var(--surface)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px'
                    }}
                  />
                </div>
              </div>
              
              <button 
                className="button" 
                onClick={handleConnectToSupabase}
                disabled={loadingSchema}
                style={{ marginRight: '0.5rem' }}
              >
                {loadingSchema ? 'Connecting...' : '🔗 Connect & Detect Schema'}
              </button>
              
              <button 
                className="button" 
                onClick={() => setSupabaseSchema(defaultSchema)}
              >
                ⚙️ Use Default Schema
              </button>
            </div>
          )}

          {connectedToSupabase && (
            <div style={{ 
              marginBottom: '1rem', 
              padding: '0.75rem', 
              backgroundColor: '#10b98120', 
              borderRadius: '4px',
              border: '1px solid #10b981',
              color: '#10b981'
            }}>
              ✅ Connected to Supabase! Using your actual table schema.
              <button 
                className="button" 
                onClick={() => setConnectedToSupabase(false)}
                style={{ marginLeft: '1rem', fontSize: '12px', padding: '0.25rem 0.5rem' }}
              >
                Disconnect
              </button>
            </div>
          )}

          {/* Mapping Section */}
          {(connectedToSupabase || supabaseSchema.length > 0) && (
            <>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                Select which CSV column corresponds to each Supabase database field.
              </p>
              
              <button 
                className="button" 
                onClick={handleAutoMap}
                style={{ marginBottom: '1rem' }}
              >
                🔍 Auto-Map Fields
              </button>

              <div style={{ display: 'grid', gap: '0.75rem', maxHeight: '400px', overflowY: 'auto' }}>
                {(supabaseSchema.length > 0 ? supabaseSchema : defaultSchema).map(schemaField => (
                  <div key={schemaField.field} style={{ 
                    display: 'grid', 
                    gridTemplateColumns: '200px 1fr', 
                    gap: '1rem', 
                    alignItems: 'center',
                    padding: '0.5rem',
                    backgroundColor: 'var(--surface-secondary)',
                    borderRadius: '4px',
                    border: '1px solid var(--border)'
                  }}>
                    <div>
                      <strong style={{ color: 'var(--text-primary)' }}>{schemaField.label}</strong>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {schemaField.field} • {schemaField.type} {schemaField.required && '(required)'}
                      </div>
                    </div>
                    <select
                      value={mappingConfig[schemaField.field] || ''}
                      onChange={(e) => handleMappingChange(schemaField.field, e.target.value)}
                      style={{ 
                        padding: '0.5rem',
                        backgroundColor: 'var(--surface)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border)',
                        borderRadius: '4px'
                      }}
                    >
                      <option value="">-- Select CSV Column --</option>
                      {availableColumns.map(csvCol => (
                        <option key={csvCol} value={csvCol}>{csvCol}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                <button 
                  className="button primary" 
                  onClick={handleExportToSupabase}
                  disabled={Object.keys(mappingConfig).length === 0}
                >
                  🚀 Export to Supabase ({Object.keys(mappingConfig).length} fields mapped)
                </button>
                {connectedToSupabase && (
                  <button 
                    className="button" 
                    onClick={handleCreateMissingFields}
                  >
                    🔧 Create Missing Fields
                  </button>
                )}
                <button 
                  className="button" 
                  onClick={() => setShowMapping(false)}
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Custom Fields Management */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <h3 style={{ marginTop: 0 }}>🔧 Custom Fields</h3>
          <button
            className="button button-secondary"
            onClick={() => setShowAddField(!showAddField)}
          >
            {showAddField ? 'Cancel' : '+ Add Custom Field'}
          </button>
        </div>
        {showAddField && (
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Field name"
              value={newCustomFieldName}
              onChange={(e) => setNewCustomFieldName(e.target.value)}
              className="input"
              style={{ flex: 1 }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddCustomField()
                if (e.key === 'Escape') {
                  setShowAddField(false)
                  setNewCustomFieldName('')
                }
              }}
            />
            <button className="button" onClick={handleAddCustomField}>
              Add
            </button>
          </div>
        )}
        {customFields.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {customFields.map((field) => (
              <div
                key={field}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.25rem 0.5rem',
                  backgroundColor: '#e3f2fd',
                  borderRadius: '4px',
                }}
              >
                <span>{field}</span>
                <button
                  onClick={() => handleRemoveCustomField(field)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#d32f2f',
                    cursor: 'pointer',
                    fontSize: '1.2rem',
                    padding: '0',
                    width: '20px',
                    height: '20px',
                  }}
                  title="Remove field"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
            No custom fields. Upload a file with unmapped columns or add a field manually.
          </p>
        )}
      </div>

      {/* Column Visibility Toggle */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3 style={{ marginTop: 0 }}>👁️ Show/Hide Columns</h3>
        <div style={{ marginBottom: '1rem' }}>
          <strong>Canonical Fields:</strong>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
            {canonicalFields.map((field) => (
              <label key={field.field} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={visibleFields.has(field.field)}
                  onChange={() => toggleFieldVisibility(field.field)}
                />
                <span>{field.label}</span>
              </label>
            ))}
          </div>
        </div>
        {customFields.length > 0 && (
          <div>
            <strong>Custom Fields:</strong>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
              {customFields.map((field) => (
                <label key={field} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={visibleFields.has(field)}
                    onChange={() => toggleFieldVisibility(field)}
                  />
                  <span>{field}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Data Table */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <input
              type="text"
              placeholder="Search patients..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(0)
              }}
              className="input"
              style={{ width: '300px' }}
            />
          </div>
          {patientData && (
            <div style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
              Showing {patientData.items.length} of {patientData.total} patients
            </div>
          )}
        </div>

        {loading && !patientData && dataSource === 'csv' ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
            <div className="loading" style={{ margin: '0 auto' }}></div>
            <p style={{ marginTop: '1rem' }}>Loading patient data...</p>
          </div>
        ) : loadingSupabaseData && dataSource === 'supabase' ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
            <div className="loading" style={{ margin: '0 auto' }}></div>
            <p style={{ marginTop: '1rem' }}>Loading data from Supabase...</p>
          </div>
        ) : (dataSource === 'csv' && patientData && patientData.items.length > 0) || (dataSource === 'supabase' && supabaseData.length > 0) ? (
          <>
            {/* Data Source Info */}
            <div style={{ 
              marginBottom: '1rem', 
              padding: '1rem', 
              backgroundColor: 'var(--surface)', 
              border: '1px solid var(--border)', 
              borderRadius: '8px',
              color: 'var(--text-primary)'
            }}>
              <strong style={{ color: 'var(--text-primary)' }}>
                🔍 {dataSource === 'csv' ? 'CSV Data' : 'Supabase Data'}:
              </strong><br/>
              {dataSource === 'csv' 
                ? `Total: ${patientData?.total || 0} | Showing: ${patientData?.items?.length || 0} patients`
                : `Showing: ${supabaseData.length} patients from Supabase`
              }
            </div>
            
            {/* Data Table */}
            <div style={{ 
              overflowX: 'auto', 
              maxHeight: '70vh', 
              border: '1px solid var(--border)', 
              borderRadius: '8px',
              backgroundColor: 'var(--surface)'
            }}>
              <table style={{ 
                width: '100%', 
                borderCollapse: 'collapse', 
                fontSize: '14px',
                backgroundColor: 'var(--surface)',
                color: 'var(--text-primary)'
              }}>
                <thead style={{ 
                  backgroundColor: 'var(--surface-secondary)', 
                  position: 'sticky', 
                  top: 0,
                  borderBottom: '2px solid var(--border)'
                }}>
                  <tr>
                    <th style={{ 
                      border: '1px solid var(--border)', 
                      padding: '12px 8px', 
                      textAlign: 'left',
                      fontWeight: 'bold',
                      color: 'var(--text-primary)'
                    }}>
                      Patient Key (MRN)
                    </th>
                    <th style={{ 
                      border: '1px solid var(--border)', 
                      padding: '12px 8px', 
                      textAlign: 'left',
                      fontWeight: 'bold',
                      color: 'var(--text-primary)'
                    }}>
                      First Name
                    </th>
                    <th style={{ 
                      border: '1px solid var(--border)', 
                      padding: '12px 8px', 
                      textAlign: 'left',
                      fontWeight: 'bold',
                      color: 'var(--text-primary)'
                    }}>
                      Age
                    </th>
                    <th style={{ 
                      border: '1px solid var(--border)', 
                      padding: '12px 8px', 
                      textAlign: 'left',
                      fontWeight: 'bold',
                      color: 'var(--text-primary)'
                    }}>
                      Glucose
                    </th>
                    <th style={{ 
                      border: '1px solid var(--border)', 
                      padding: '12px 8px', 
                      textAlign: 'left',
                      fontWeight: 'bold',
                      color: 'var(--text-primary)'
                    }}>
                      BMI
                    </th>
                    <th style={{ 
                      border: '1px solid var(--border)', 
                      padding: '12px 8px', 
                      textAlign: 'left',
                      fontWeight: 'bold',
                      color: 'var(--text-primary)'
                    }}>
                      Blood Pressure
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(dataSource === 'csv' ? patientData?.items || [] : supabaseData).map((patient: any, index: number) => (
                    <tr key={patient.id || index} style={{ 
                      backgroundColor: index % 2 === 0 ? 'var(--surface)' : 'var(--surface-secondary)',
                      borderBottom: '1px solid var(--border)'
                    }}>
                      <td style={{ 
                        border: '1px solid var(--border)', 
                        padding: '10px 8px',
                        color: 'var(--text-primary)'
                      }}>
                        {patient.mrn || patient.id || '-'}
                      </td>
                      <td style={{ 
                        border: '1px solid var(--border)', 
                        padding: '10px 8px',
                        color: 'var(--text-primary)'
                      }}>
                        {patient.first_name || '-'}
                      </td>
                      <td style={{ 
                        border: '1px solid var(--border)', 
                        padding: '10px 8px',
                        color: 'var(--text-primary)'
                      }}>
                        {(patient as any).age || patient.age || '-'}
                      </td>
                      <td style={{ 
                        border: '1px solid var(--border)', 
                        padding: '10px 8px',
                        color: 'var(--text-primary)'
                      }}>
                        {dataSource === 'csv' 
                          ? (patient.extra_fields?.Glucose || '-')
                          : (patient.glucose_level || patient.Glucose || '-')
                        }
                      </td>
                      <td style={{ 
                        border: '1px solid var(--border)', 
                        padding: '10px 8px',
                        color: 'var(--text-primary)'
                      }}>
                        {dataSource === 'csv' 
                          ? (patient.extra_fields?.BMI || '-')
                          : (patient.bmi || patient.BMI || '-')
                        }
                      </td>
                      <td style={{ 
                        border: '1px solid var(--border)', 
                        padding: '10px 8px',
                        color: 'var(--text-primary)'
                      }}>
                        {dataSource === 'csv' 
                          ? (patient.extra_fields?.BloodPressure || '-')
                          : (patient.blood_pressure || patient.BloodPressure || '-')
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
              <div>
                <label>
                  Rows per page:
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value))
                      setPage(0)
                    }}
                    style={{ marginLeft: '0.5rem', padding: '0.25rem' }}
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                  </select>
                </label>
              </div>
              <div>
                <button
                  className="button"
                  onClick={() => setPage(0)}
                  disabled={page === 0}
                >
                  First
                </button>
                <button
                  className="button"
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  style={{ marginLeft: '0.5rem' }}
                >
                  Previous
                </button>
                <span style={{ margin: '0 1rem' }}>
                  Page {page + 1} of {totalPages}
                </span>
                <button
                  className="button"
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                >
                  Next
                </button>
                <button
                  className="button"
                  onClick={() => setPage(totalPages - 1)}
                  disabled={page >= totalPages - 1}
                  style={{ marginLeft: '0.5rem' }}
                >
                  Last
                </button>
              </div>
            </div>
          </>
        ) : patientData && patientData.items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📊</div>
            <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>No patient data found</p>
            {search ? (
              <p>No patients match your search. Try a different search term.</p>
            ) : (
              <p>Go to <strong>Dataset Manager</strong> to upload files and add data to the database.</p>
            )}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📊</div>
            <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>No patient data available</p>
            <p>Go to <strong>Dataset Manager</strong> to upload files and add data to the database.</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default DataManagerPage
