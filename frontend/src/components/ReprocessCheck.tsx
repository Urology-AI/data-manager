import { useState, useEffect } from 'react'
import { datasetsApi } from '../api/client'
import { ReprocessCheckResponse } from '../types'
import '../App.css'

interface ReprocessCheckProps {
  datasetId: string
  onAddMissingColumns?: (columns: string[]) => void
  isProcessed?: boolean
}

function ReprocessCheck({ datasetId, onAddMissingColumns, isProcessed = false }: ReprocessCheckProps) {
  const [checkResult, setCheckResult] = useState<ReprocessCheckResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [addingToExtraFields, setAddingToExtraFields] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [updateMessage, setUpdateMessage] = useState<string | null>(null)

  const runCheck = async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await datasetsApi.reprocessCheck(datasetId)
      setCheckResult(result)
    } catch (err: any) {
      console.error('Failed to run reprocess check:', err)
      setError(err.response?.data?.detail || err.message || 'Failed to check for missing data')
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateMissingData = async () => {
    if (!window.confirm(
      'This will update patient records with missing data from the CSV file.\n\n' +
      'Only fields that are currently empty in the database will be filled.\n\n' +
      'Continue?'
    )) {
      return
    }

    try {
      setUpdating(true)
      setError(null)
      setUpdateMessage(null)
      const result = await datasetsApi.reprocessUpdate(datasetId)
      setUpdateMessage(result.message || 'Update completed successfully')
      // Re-run check to show updated status
      await runCheck()
    } catch (err: any) {
      console.error('Failed to update missing data:', err)
      setError(err.response?.data?.detail || err.message || 'Failed to update missing data')
    } finally {
      setUpdating(false)
    }
  }

  useEffect(() => {
    // Auto-run check when component mounts
    if (datasetId) {
      runCheck()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetId])

  if (loading && !checkResult) {
    return (
      <div className="card">
        <p style={{ textAlign: 'center', padding: '2rem' }}>Checking for missing columns and data...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="card" style={{ backgroundColor: 'var(--bg-error)', borderColor: 'var(--error)' }}>
        <h3 style={{ color: 'var(--error)', marginTop: 0 }}>❌ Error</h3>
        <p style={{ color: 'var(--text-primary)' }}>{error}</p>
        <button className="button" onClick={runCheck}>Retry Check</button>
      </div>
    )
  }

  if (!checkResult) {
    return null
  }

  const handleAddToExtraFields = async () => {
    try {
      setAddingToExtraFields(true)
      setError(null)
      setUpdateMessage(null)
      const result = await datasetsApi.addUnmappedToExtraFields(datasetId)
      setUpdateMessage(result.message || 'Unmapped columns added to extra_fields')
      // Re-run check to show updated status
      await runCheck()
    } catch (err: any) {
      console.error('Failed to add to extra_fields:', err)
      setError(err.response?.data?.detail || err.message || 'Failed to add columns to extra_fields')
    } finally {
      setAddingToExtraFields(false)
    }
  }

  const hasUnmappedColumns = checkResult.unmapped_columns.length > 0
  const hasExtraFieldsColumns = checkResult.extra_fields_columns.length > 0
  const hasMissingData = Object.keys(checkResult.missing_data_summary).length > 0

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0 }}>🔍 Re-process Check</h2>
        <button className="button button-secondary" onClick={runCheck} disabled={loading}>
          {loading ? 'Checking...' : '🔄 Re-check'}
        </button>
      </div>

      <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px' }}>
        <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
          <strong>File:</strong> {checkResult.total_rows_in_file} rows | 
          <strong> Database:</strong> {checkResult.total_patients_in_db} patients
        </p>
      </div>

      {updateMessage && (
        <div style={{ 
          padding: '1rem', 
          marginBottom: '1rem',
          backgroundColor: 'var(--bg-success)', 
          borderRadius: '8px',
          border: '1px solid var(--success)',
          color: 'var(--text-primary)'
        }}>
          ✅ {updateMessage}
        </div>
      )}

      {!hasUnmappedColumns && !hasExtraFieldsColumns && !hasMissingData && (
        <div style={{ 
          padding: '2rem', 
          textAlign: 'center', 
          backgroundColor: 'var(--bg-success)', 
          borderRadius: '8px',
          border: '1px solid var(--success)'
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✅</div>
          <p style={{ color: 'var(--text-primary)', margin: 0 }}>
            <strong>All columns are mapped and data is up to date!</strong>
          </p>
        </div>
      )}

      {hasUnmappedColumns && (
        <div style={{ marginBottom: '2rem' }}>
          <h3 style={{ color: '#f59e0b', marginBottom: '1rem' }}>
            ⚠️ Unmapped Columns ({checkResult.unmapped_columns.length})
          </h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            These columns exist in the file but are not mapped to any database field:
          </p>
          <div style={{ 
            display: 'flex', 
            flexWrap: 'wrap', 
            gap: '0.5rem',
            marginBottom: '1rem'
          }}>
            {checkResult.unmapped_columns.map(col => (
              <span 
                key={col}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  color: 'var(--text-primary)',
                  fontSize: '0.9rem'
                }}
              >
                {col}
              </span>
            ))}
          </div>
          {isProcessed && (
            <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <button 
                className="button"
                onClick={handleAddToExtraFields}
                disabled={addingToExtraFields}
              >
                {addingToExtraFields ? '⏳ Adding...' : '➕ Add to Extra Fields'}
              </button>
              {onAddMissingColumns && (
                <button 
                  className="button button-secondary"
                  onClick={() => {
                    onAddMissingColumns(checkResult.unmapped_columns)
                  }}
                >
                  📝 Create Columns (Map to Canonical Fields)
                </button>
              )}
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', width: '100%', marginTop: '0.5rem' }}>
                <strong>Choose:</strong> Add to extra_fields (ignore for now) or create canonical fields (map them now).
              </p>
            </div>
          )}
          {!isProcessed && onAddMissingColumns && (
            <button 
              className="button"
              onClick={() => {
                onAddMissingColumns(checkResult.unmapped_columns)
              }}
            >
              📝 Map These Columns
            </button>
          )}
        </div>
      )}

      {hasExtraFieldsColumns && (
        <div style={{ marginBottom: '2rem' }}>
          <h3 style={{ color: '#3b82f6', marginBottom: '1rem' }}>
            📊 Columns in Extra Fields ({checkResult.extra_fields_columns.length})
          </h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            These columns are currently stored in extra_fields. You can create canonical fields from them or keep them in extra_fields.
          </p>
          <div style={{ 
            display: 'flex', 
            flexWrap: 'wrap', 
            gap: '0.5rem',
            marginBottom: '1rem'
          }}>
            {checkResult.extra_fields_columns.map(col => (
              <span 
                key={col}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: 'rgba(59, 130, 246, 0.1)',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  borderRadius: '6px',
                  color: '#3b82f6',
                  fontSize: '0.9rem',
                  fontWeight: 'bold'
                }}
              >
                {col}
              </span>
            ))}
          </div>
          {onAddMissingColumns && (
            <div style={{ marginTop: '1rem' }}>
              <button 
                className="button"
                onClick={() => {
                  onAddMissingColumns(checkResult.extra_fields_columns)
                }}
              >
                📝 Create Canonical Fields from These
              </button>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                Map these extra_fields columns to canonical fields. After mapping, you can auto-fill the data.
              </p>
            </div>
          )}
        </div>
      )}

      {hasMissingData && (
        <div>
          <h3 style={{ color: '#f59e0b', marginBottom: '1rem' }}>
            ⚠️ Missing Data ({Object.keys(checkResult.missing_data_summary).length} fields)
          </h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            These fields have data in the CSV file but are missing in the database:
          </p>
          
          {Object.values(checkResult.missing_data_summary).map((summary) => (
            <div 
              key={summary.field}
              style={{
                marginBottom: '1.5rem',
                padding: '1rem',
                backgroundColor: 'var(--bg-secondary)',
                borderRadius: '8px',
                border: '1px solid var(--border)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <strong style={{ color: 'var(--text-primary)' }}>
                  {summary.field} ({summary.csv_column})
                </strong>
                <span style={{ 
                  padding: '0.25rem 0.75rem', 
                  backgroundColor: 'rgba(239, 68, 68, 0.2)',
                  color: '#fca5a5',
                  borderRadius: '4px',
                  fontSize: '0.85rem'
                }}>
                  {summary.missing_count} missing
                </span>
              </div>
              
              {summary.sample_values.length > 0 && (
                <div style={{ marginTop: '0.75rem' }}>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                    Sample values from CSV:
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {summary.sample_values.map((sample, idx) => (
                      <div 
                        key={idx}
                        style={{
                          padding: '0.5rem',
                          backgroundColor: 'var(--bg-primary)',
                          border: '1px solid var(--border)',
                          borderRadius: '4px',
                          fontSize: '0.85rem'
                        }}
                      >
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                          {sample.mrn || sample.patient_key}
                        </div>
                        <div style={{ color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                          {sample.value}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}

          {hasMissingData && (
            <div style={{ marginTop: '1.5rem', marginBottom: '1.5rem' }}>
              <button 
                className="button"
                onClick={handleUpdateMissingData}
                disabled={updating}
                style={{ fontSize: '1rem', padding: '0.75rem 1.5rem' }}
              >
                {updating ? '⏳ Updating...' : '🔄 Update Missing Data from CSV'}
              </button>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                This will fill empty database fields with values from the CSV file.
              </p>
            </div>
          )}

          {checkResult.rows_with_missing_data.length > 0 && (
            <div style={{ marginTop: '2rem' }}>
              <h4 style={{ color: 'var(--text-primary)', marginBottom: '1rem' }}>
                Sample Rows with Missing Data ({checkResult.rows_with_missing_data.length} shown)
              </h4>
              <div style={{ 
                maxHeight: '400px', 
                overflowY: 'auto',
                border: '1px solid var(--border)',
                borderRadius: '8px'
              }}>
                <table className="table" style={{ margin: 0 }}>
                  <thead>
                    <tr>
                      <th>MRN</th>
                      <th>Name</th>
                      <th>Missing Fields</th>
                    </tr>
                  </thead>
                  <tbody>
                    {checkResult.rows_with_missing_data.map((row, idx) => (
                      <tr key={idx}>
                        <td>{row.mrn || row.patient_key}</td>
                        <td>
                          {row.first_name || ''} {row.last_name || ''}
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                            {Object.keys(row.missing_fields).map(field => (
                              <span 
                                key={field}
                                style={{
                                  padding: '0.25rem 0.5rem',
                                  backgroundColor: 'rgba(239, 68, 68, 0.2)',
                                  color: '#fca5a5',
                                  borderRadius: '4px',
                                  fontSize: '0.75rem'
                                }}
                              >
                                {field}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default ReprocessCheck
