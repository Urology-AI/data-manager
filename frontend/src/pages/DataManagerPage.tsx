import { useState, useEffect, useMemo } from 'react'
import { patientsApi, fieldsApi } from '../api/client'
import { Patient, PaginatedResponse } from '../types'
import ExcelTable from '../components/ExcelTable'
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
  const [pendingUpdates, setPendingUpdates] = useState<Map<string, Map<string, any>>>(new Map())
  const [customFields, setCustomFields] = useState<string[]>([])
  const [newCustomFieldName, setNewCustomFieldName] = useState('')
  const [showAddField, setShowAddField] = useState(false)

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

  const handleUpdate = async (patientId: string, field: string, value: any) => {
    // Add to pending updates
    const updates = pendingUpdates.get(patientId) || new Map()
    updates.set(field, value)
    setPendingUpdates(new Map(pendingUpdates.set(patientId, updates)))

    // Debounce: save after 500ms of no changes
    setTimeout(async () => {
      const currentUpdates = pendingUpdates.get(patientId)
      if (currentUpdates && currentUpdates.has(field)) {
        try {
          const updateData: any = {}
          
          // Check if this is a custom field
          const isCustomField = customFields.includes(field)
          
          if (isCustomField) {
            // For custom fields, we need to update extra_fields
            // Get current patient to merge extra_fields
            const patient = patientData?.items.find(p => p.id === patientId)
            if (patient) {
              const currentExtraFields = (patient as any).extra_fields || {}
              currentExtraFields[field] = value
              updateData.extra_fields = currentExtraFields
            }
          } else {
            // For canonical fields, update directly
            // Only include the fields that were actually updated
            currentUpdates.forEach((val, fld) => {
              updateData[fld] = val
            })
          }
          
          // Use single patient update endpoint instead of bulk-update
          await patientsApi.update(patientId, updateData)
          
          // Remove from pending
          const remaining = new Map(pendingUpdates)
          remaining.delete(patientId)
          setPendingUpdates(remaining)
          
          // Reload data
          await loadPatientData()
        } catch (error: any) {
          console.error('Failed to update patient:', error)
          
          let errorMsg = 'Failed to update patient'
          if (error.response?.data) {
            if (Array.isArray(error.response.data.detail)) {
              errorMsg = error.response.data.detail.map((d: any) => d.msg || d).join(', ')
            } else if (typeof error.response.data.detail === 'string') {
              errorMsg = error.response.data.detail
            } else {
              errorMsg = JSON.stringify(error.response.data.detail)
            }
          } else if (error.message) {
            errorMsg = error.message
          }
          
          alert(`Failed to update patient: ${errorMsg}`)
        }
      }
    }, 500)
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

  const displayFields = useMemo(() => {
    const canonical = canonicalFields.filter(f => visibleFields.has(f.field))
    const custom = customFields
      .filter(f => visibleFields.has(f))
      .map(field => ({
        field,
        label: field,
        type: 'string',
        domain: 'Custom',
        required: false
      }))
    return [...canonical, ...custom]
  }, [canonicalFields, customFields, visibleFields])

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
      </div>

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

        {loading && !patientData ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
            <div className="loading" style={{ margin: '0 auto' }}></div>
            <p style={{ marginTop: '1rem' }}>Loading patient data...</p>
          </div>
        ) : patientData && patientData.items.length > 0 ? (
          <>
            <ExcelTable
              columns={[
                { key: 'patient_key', label: 'Patient Key', type: 'string', editable: false },
                ...displayFields.map(field => ({
                  key: field.field,
                  label: field.label,
                  type: field.type,
                  editable: true
                }))
              ]}
              data={patientData.items.map(patient => {
                const row: any = { ...patient }
                // Handle custom fields stored in extra_fields
                displayFields.forEach(field => {
                  if (field.domain === 'Custom' && patient.extra_fields) {
                    row[field.field] = patient.extra_fields[field.field]
                  }
                })
                return row
              })}
              onCellUpdate={(rowIndex, columnKey, value) => {
                const patient = patientData.items[rowIndex]
                if (patient) {
                  handleUpdate(patient.id, columnKey, value)
                }
              }}
              loading={false}
              maxHeight="70vh"
            />
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
