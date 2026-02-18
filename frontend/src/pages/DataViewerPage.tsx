import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { datasetsApi, patientsApi, fieldsApi } from '../api/client'
import { Dataset, Patient, PaginatedResponse } from '../types'
import '../App.css'

interface CanonicalField {
  field: string
  label: string
  type: string
  domain: string
  required: boolean
}

function DataViewerPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [dataset, setDataset] = useState<Dataset | null>(null)
  const [patientData, setPatientData] = useState<PaginatedResponse<Patient> | null>(null)
  const [canonicalFields, setCanonicalFields] = useState<CanonicalField[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(50)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (id) {
      loadDataset()
      loadCanonicalFields()
    }
  }, [id])

  useEffect(() => {
    if (id) {
      loadPatientData()
    }
  }, [id, page, pageSize, search])

  const loadDataset = async () => {
    if (!id) return
    try {
      const data = await datasetsApi.get(id)
      setDataset(data)
    } catch (error) {
      console.error('Failed to load dataset:', error)
    }
  }

  const loadCanonicalFields = async () => {
    try {
      const data = await fieldsApi.getCanonicalFields()
      setCanonicalFields(data.fields || [])
    } catch (err) {
      console.error('Failed to load canonical fields:', err)
      setCanonicalFields([])
    }
  }

  const loadPatientData = async () => {
    if (!id) return
    try {
      setLoading(true)
      const offset = page * pageSize
      const data = await patientsApi.list(id, {
        search: search || undefined,
        limit: pageSize,
        offset: offset,
      })
      setPatientData(data)
    } catch (error) {
      console.error('Failed to load patient data:', error)
    } finally {
      setLoading(false)
    }
  }

  const exportToCSV = () => {
    if (!patientData || !patientData.items.length) return
    
    // Get all field names from canonical fields
    const headers = ['patient_key', ...canonicalFields.map(f => f.field)]
    const csvRows = [
      headers.join(','),
      ...patientData.items.map(patient => 
        headers.map(header => {
          const value = (patient as any)[header]
          if (value === null || value === undefined) return ''
          // Handle arrays/objects
          if (Array.isArray(value)) {
            return `"${value.join('; ')}"`
          }
          if (typeof value === 'object') {
            return `"${JSON.stringify(value)}"`
          }
          // Escape quotes and wrap in quotes if contains comma or quote
          const stringValue = String(value)
          if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
            return `"${stringValue.replace(/"/g, '""')}"`
          }
          return stringValue
        }).join(',')
      )
    ]
    
    const csvContent = csvRows.join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${dataset?.source_filename || 'data'}_processed_export.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  }

  if (loading && !patientData) {
    return <div className="card"><p>Loading...</p></div>
  }

  if (!dataset) {
    return <div className="card"><p>Dataset not found</p></div>
  }

  const totalPages = patientData ? Math.ceil(patientData.total / pageSize) : 0
  const displayFields = canonicalFields.filter(f => 
    f.domain !== 'Other'
  )

  return (
    <div>
      <div className="section-header">
        <div>
          <h1 className="section-title">Database Viewer: {dataset.name}</h1>
          <p className="section-description">
            View all patient records from this dataset in the database.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="button button-secondary" onClick={() => navigate(`/datasets/${id}/patients`)}>
            View Patients Table
          </button>
          <button className="button" onClick={() => navigate(`/datasets/${id}`)}>
            ← Back to Dataset
          </button>
        </div>
      </div>
      
      <div className="info-box" style={{ marginBottom: '1rem' }}>
        <p style={{ margin: 0 }}>
          <strong>📊 Database View:</strong> This shows all patient records stored in the database. 
          Upload additional Excel/CSV files to add more patients incrementally to the existing database.
        </p>
      </div>

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
          {patientData && patientData.items.length > 0 && (
            <button className="button button-secondary" onClick={exportToCSV}>
              Export to CSV
            </button>
          )}
        </div>

        {patientData && patientData.items.length > 0 ? (
          <>
            <div style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>
              Showing {patientData.items.length} of {patientData.total} patients in database
            </div>
            <div style={{ overflowX: 'auto', maxHeight: '70vh', overflowY: 'auto' }}>
              <table className="table" style={{ fontSize: '0.9rem' }}>
                <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--bg-secondary)', zIndex: 1 }}>
                  <tr>
                    <th style={{ padding: '0.5rem', border: '1px solid var(--border)', whiteSpace: 'nowrap' }}>#</th>
                    <th style={{ padding: '0.5rem', border: '1px solid var(--border)', whiteSpace: 'nowrap' }}>Patient Key</th>
                    {displayFields.map((field) => (
                      <th key={field.field} style={{ padding: '0.5rem', border: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                        {field.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {patientData.items.map((patient, idx) => (
                    <tr key={patient.id}>
                      <td style={{ padding: '0.5rem', border: '1px solid var(--border)', fontWeight: 'bold' }}>
                        {page * pageSize + idx + 1}
                      </td>
                      <td style={{ padding: '0.5rem', border: '1px solid var(--border)' }}>
                        {patient.patient_key}
                      </td>
                      {displayFields.map((field) => {
                        const value = (patient as any)[field.field]
                        let displayValue = '-'
                        
                        if (value !== null && value !== undefined && value !== '') {
                          if (field.type === 'float' && typeof value === 'number') {
                            displayValue = value.toFixed(2)
                          } else if (field.type === 'boolean') {
                            displayValue = value ? 'Yes' : 'No'
                          } else if (field.type === 'datetime' && typeof value === 'string') {
                            displayValue = new Date(value).toLocaleDateString()
                          } else if (Array.isArray(value)) {
                            displayValue = value.join(', ')
                          } else {
                            displayValue = String(value)
                          }
                        }
                        
                        return (
                          <td key={field.field} style={{ padding: '0.5rem', border: '1px solid var(--border)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {displayValue}
                          </td>
                        )
                      })}
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
        ) : (
          <p>No patient data available. Please map columns first.</p>
        )}
      </div>
    </div>
  )
}

export default DataViewerPage
