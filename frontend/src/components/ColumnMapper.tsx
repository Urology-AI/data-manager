import { useState, useEffect } from 'react'
import { datasetsApi, fieldsApi } from '../api/client'
import '../App.css'

interface ColumnMapperProps {
  datasetId: string
  onSuccess?: () => void
  existingColumnMap?: Record<string, string>  // Existing mappings - if provided, only show unmapped fields
  unmappedColumns?: string[]  // Specific columns to map (from reprocess check)
  isProcessed?: boolean  // Whether dataset already has patients (is processed)
}

interface CanonicalField {
  field: string
  label: string
  type: string
  domain: string
  required: boolean
}

function ColumnMapper({ datasetId, onSuccess, existingColumnMap, unmappedColumns, isProcessed = false }: ColumnMapperProps) {
  const [columns, setColumns] = useState<string[]>([])
  const [columnMap, setColumnMap] = useState<Record<string, string>>({})
  const [suggestions, setSuggestions] = useState<Record<string, { column: string; confidence: number }>>({})
  const [loading, setLoading] = useState(true)
  const [mapping, setMapping] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [domains, setDomains] = useState<Record<string, CanonicalField[]>>({})
  const [unmappedCsvColumns, setUnmappedCsvColumns] = useState<string[]>([])
  
  // Determine if we're in "re-map" mode (only show unmapped fields)
  const isRemapMode = !!existingColumnMap && Object.keys(existingColumnMap).length > 0

  useEffect(() => {
    loadCanonicalFields()
    loadColumns()
    // loadColumns() already calls loadSuggestions() automatically
    
    // If we have existing mappings, initialize columnMap with them
    if (existingColumnMap) {
      setColumnMap(existingColumnMap)
    }
  }, [datasetId, existingColumnMap])

  const loadCanonicalFields = async () => {
    try {
      const data = await fieldsApi.getCanonicalFields()
      setDomains(data.domains || {})
    } catch (err) {
      console.error('Failed to load canonical fields:', err)
      // Fallback to empty object if API fails
      setDomains({})
    }
  }

  const loadColumns = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await datasetsApi.getColumns(datasetId)
      const csvColumns = data?.columns || []
      
      if (!csvColumns || csvColumns.length === 0) {
        setError('No columns detected in the uploaded file. Please check the file format.')
        setColumns([])
        return
      }
      
      setColumns(csvColumns)
      
      // Load suggestions immediately after columns are loaded
      // This auto-populates dropdowns with DB schema field matches
      await loadSuggestions()
    } catch (err: any) {
      console.error('Failed to load columns:', err)
      const errorMsg = err.response?.data?.detail || err.message || 'Failed to load columns'
      setError(errorMsg)
      setColumns([])
    } finally {
      setLoading(false)
    }
  }

  const loadSuggestions = async () => {
    try {
      setLoadingSuggestions(true)
      const data = await datasetsApi.getSuggestions(datasetId)
      
      if (data.suggestions) {
        setSuggestions(data.suggestions)
      }
      
      // Ensure columns are set if they come from suggestions endpoint
      // This is a fallback in case getColumns didn't work
      if (data.columns && data.columns.length > 0) {
        if (columns.length === 0 || JSON.stringify(columns) !== JSON.stringify(data.columns)) {
          setColumns(data.columns)
        }
      }
      
      // Calculate unmapped CSV columns (columns not in existing mapping)
      if (existingColumnMap && columns.length > 0) {
        const mappedCsvCols = new Set(Object.values(existingColumnMap))
        const unmapped = columns.filter(col => !mappedCsvCols.has(col))
        setUnmappedCsvColumns(unmapped)
      } else if (unmappedColumns && unmappedColumns.length > 0) {
        // Use provided unmapped columns from reprocess check
        setUnmappedCsvColumns(unmappedColumns)
      } else {
        setUnmappedCsvColumns([])
      }
      
      // SIMPLE: Auto-apply ALL suggestions automatically - match CSV columns to DB fields
      const autoMappings: Record<string, string> = {}
      
      // Use auto_mapped from backend if available
      if (data.auto_mapped) {
        Object.assign(autoMappings, data.auto_mapped)
      }
      
      // Also auto-apply ALL suggestions - if there's a suggestion, use it
      // Prioritize critical fields (mrn, first_name, last_name)
      const criticalFields = ['mrn', 'first_name', 'last_name']
      const otherFields: string[] = []
      
      if (data.suggestions) {
        Object.keys(data.suggestions).forEach(field => {
          if (criticalFields.includes(field)) {
            criticalFields.push(field) // Keep order
          } else {
            otherFields.push(field)
          }
        })
        
        // Apply critical fields first
        criticalFields.forEach(field => {
          if (data.suggestions[field] && !autoMappings[field]) {
            autoMappings[field] = data.suggestions[field].column
          }
        })
        
        // Then apply other fields
        otherFields.forEach(field => {
          if (data.suggestions[field] && !autoMappings[field]) {
            autoMappings[field] = data.suggestions[field].column
          }
        })
      }
      
      // Merge with existing mappings (don't overwrite user selections)
      const mergedMappings = { ...columnMap, ...autoMappings }
      
      // Set all mappings at once
      if (Object.keys(autoMappings).length > 0) {
        setColumnMap(mergedMappings)
      }
    } catch (err) {
      console.error('Failed to load suggestions:', err)
    } finally {
      setLoadingSuggestions(false)
    }
  }

  const handleAutoMap = async () => {
    await loadSuggestions()
  }

  const handleMapChange = (canonicalField: string, csvColumn: string) => {
    setColumnMap((prev) => ({
      ...prev,
      [canonicalField]: csvColumn || '',
    }))
  }

  const handleSubmit = async () => {
    try {
      setMapping(true)
      setError(null)
      
      // Validate that at least one column is mapped
      const mappedColumns = Object.values(columnMap).filter(col => col && col.trim() !== '')
      if (mappedColumns.length === 0) {
        setError('Please map at least one CSV column to a canonical field before submitting.')
        setMapping(false)
        return
      }
      
      // Remove empty mappings
      const cleanColumnMap: Record<string, string> = {}
      Object.keys(columnMap).forEach(key => {
        if (columnMap[key] && columnMap[key].trim() !== '') {
          cleanColumnMap[key] = columnMap[key]
        }
      })
      
      // If in re-map mode, merge with existing mappings (preserve existing, add new)
      let finalColumnMap = cleanColumnMap
      if (isRemapMode && existingColumnMap) {
        finalColumnMap = { ...existingColumnMap, ...cleanColumnMap }
      }
      
      const result = await datasetsApi.mapColumns(datasetId, finalColumnMap)
      
      // Show success message
      const successMsg = result.message || `Successfully created ${result.patients_created || 0} patient(s)`
      alert(`✅ ${successMsg}`)
      
      if (onSuccess) {
        onSuccess()
      }
    } catch (err: any) {
      const errorDetail = err.response?.data?.detail || err.message || 'Mapping failed'
      setError(`Mapping failed: ${errorDetail}`)
      
      // Scroll to error
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } finally {
      setMapping(false)
    }
  }

  if (loading) {
    return <p>Loading columns...</p>
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div>
          <h3>
            {isRemapMode ? '🔗 Map Additional Columns' : 'Map CSV Columns to Canonical Fields'}
          </h3>
          <p>
            {isRemapMode && isProcessed && unmappedColumns && unmappedColumns.length > 0
              ? 'This dataset is already processed. Unmapped CSV columns will be added to extra_fields or you can map them to existing canonical fields below.'
              : isRemapMode 
              ? 'Map the remaining unmapped CSV columns to canonical fields. Existing mappings are preserved.'
              : 'Select which CSV column corresponds to each canonical field. You can skip fields.'}
          </p>
          {isRemapMode && existingColumnMap && (
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
              📋 {Object.keys(existingColumnMap).length} field(s) already mapped.
              {isProcessed && unmappedColumns && unmappedColumns.length > 0
                ? ' Unmapped CSV columns will be stored in extra_fields unless mapped below.'
                : unmappedColumns && unmappedColumns.length > 0 
                ? ' Map unmapped CSV columns to any canonical field below.'
                : ' Showing only unmapped canonical fields.'}
            </p>
          )}
        </div>
        <button
          className="button button-secondary"
          onClick={handleAutoMap}
          disabled={loadingSuggestions || columns.length === 0}
          style={{ marginLeft: '1rem' }}
        >
          {loadingSuggestions ? 'Analyzing...' : '🔍 Auto-Map Columns'}
        </button>
      </div>
      
      {error && (
        <div style={{ 
          color: '#fca5a5', 
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          padding: '1rem', 
          borderRadius: '0.5rem',
          marginBottom: '1rem' 
        }}>
          <strong style={{ color: '#ef4444' }}>❌ Error:</strong>
          <div style={{ marginTop: '0.5rem' }}>{error}</div>
        </div>
      )}

      {/* Show unmapped CSV columns prominently if in re-map mode */}
      {isRemapMode && unmappedCsvColumns.length > 0 && (
        <div style={{ 
          backgroundColor: isProcessed 
            ? 'rgba(59, 130, 246, 0.1)' 
            : 'rgba(251, 191, 36, 0.1)', 
          padding: '1rem', 
          borderRadius: '0.5rem', 
          marginBottom: '1rem',
          fontSize: '0.875rem',
          border: `1px solid ${isProcessed ? 'rgba(59, 130, 246, 0.3)' : 'rgba(251, 191, 36, 0.3)'}`
        }}>
          <strong style={{ color: isProcessed ? '#3b82f6' : '#f59e0b' }}>
            {isProcessed ? '📊' : '⚠️'} Unmapped CSV Columns ({unmappedCsvColumns.length}):
          </strong>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
            {isProcessed 
              ? 'This dataset is already processed. These columns don\'t exist in the database yet. They will be added to extra_fields, or you can map them to existing canonical fields below.'
              : 'These columns are not mapped to any canonical field. Map them below or they will be stored in extra_fields.'}
          </p>
          <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {unmappedCsvColumns.map((col, idx) => (
              <span 
                key={idx}
                style={{
                  backgroundColor: 'rgba(251, 191, 36, 0.2)',
                  color: '#f59e0b',
                  padding: '0.25rem 0.5rem',
                  borderRadius: '0.25rem',
                  border: '1px solid rgba(251, 191, 36, 0.4)',
                  fontWeight: 'bold'
                }}
              >
                {col}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Debug: Show all available CSV columns */}
      {columns.length > 0 && !isRemapMode && (
        <div style={{ 
          backgroundColor: 'var(--bg-tertiary)', 
          padding: '1rem', 
          borderRadius: '0.5rem', 
          marginBottom: '1rem',
          fontSize: '0.875rem',
          border: '1px solid var(--border)'
        }}>
          <strong style={{ color: 'var(--text-primary)' }}>📋 Available CSV Columns ({columns.length}):</strong>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
            Unmapped columns will automatically be stored in <code>extra_fields</code>.
          </p>
          <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {columns.map((col, idx) => (
              <span 
                key={idx}
                style={{
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  padding: '0.25rem 0.5rem',
                  borderRadius: '0.25rem',
                  border: '1px solid var(--border)'
                }}
              >
                {col}
              </span>
            ))}
          </div>
        </div>
      )}

      {columns.length === 0 && !loading && (
        <div style={{ 
          backgroundColor: 'rgba(239, 68, 68, 0.1)', 
          padding: '1rem', 
          borderRadius: '0.5rem', 
          marginBottom: '1rem',
          color: '#fca5a5',
          border: '1px solid rgba(239, 68, 68, 0.2)'
        }}>
          ⚠️ <strong>No CSV columns detected.</strong> Please check:
          <ul style={{ marginTop: '0.5rem', marginLeft: '1.5rem' }}>
            <li>The file was uploaded successfully</li>
            <li>The file has a header row</li>
            <li>The file format is correct (CSV or Excel)</li>
          </ul>
        </div>
      )}

      {/* Group fields by domain - dynamically from API */}
      {/* Exclude Legacy and Other domains */}
      {Object.keys(domains)
        .filter(domain => domain !== 'Legacy' && domain !== 'Other')
        .sort()
        .map((domain) => {
        let domainFields = domains[domain] || []
        
        // If in re-map mode, filter to only show unmapped canonical fields
        // Exception: If unmappedColumns is provided AND dataset is NOT processed,
        // show all canonical fields so user can map unmapped CSV columns to any field
        // If dataset IS processed, only show unmapped canonical fields (unmapped CSV columns go to extra_fields)
        if (isRemapMode && existingColumnMap) {
          const hasUnmappedCsvColumns = unmappedColumns && unmappedColumns.length > 0
          
          // If dataset is processed, always show only unmapped canonical fields
          // (unmapped CSV columns will go to extra_fields unless explicitly mapped)
          if (isProcessed || !hasUnmappedCsvColumns) {
            // Normal re-map mode: only show unmapped canonical fields
            domainFields = domainFields.filter(fieldDef => {
              const fieldName = fieldDef.field
              return !existingColumnMap[fieldName]
            })
          }
          // If hasUnmappedCsvColumns AND NOT processed: show all fields (user can map unmapped CSV columns)
        }
        
        if (domainFields.length === 0) return null
        
        return (
          <div key={domain} style={{ marginBottom: '2rem' }}>
            <h4 style={{ marginBottom: '0.5rem', color: '#646cff' }}>{domain}</h4>
            <table className="table">
              <thead>
                <tr>
                  <th>Canonical Field</th>
                  <th>CSV Column</th>
                </tr>
              </thead>
              <tbody>
                {domainFields.map((fieldDef) => {
                  const { field, label, type } = fieldDef
                  const suggestion = suggestions[field]
                  const isAutoMapped = columnMap[field] && suggestion && columnMap[field] === suggestion.column
                  
                  return (
                    <tr key={field} style={{ backgroundColor: isAutoMapped ? 'rgba(34, 197, 94, 0.1)' : 'transparent' }}>
                      <td>
                        <strong>{field}</strong>
                        <br />
                        <small style={{ color: '#888' }}>{label} ({type})</small>
                        {suggestion && (
                          <div style={{ marginTop: '0.25rem' }}>
                            <small style={{ color: '#22c55e' }}>
                              💡 Suggested: {suggestion.column} ({Math.round(suggestion.confidence * 100)}% match)
                            </small>
                          </div>
                        )}
                      </td>
                      <td>
                        {columns.length === 0 ? (
                          <div style={{ color: '#ef4444', padding: '0.5rem' }}>
                            ⚠️ No CSV columns detected. Please check the file upload.
                          </div>
                        ) : (
                          <select
                            className="select"
                            value={columnMap[field] || ''}
                            onChange={(e) => handleMapChange(field, e.target.value)}
                            style={{
                              borderColor: isAutoMapped ? '#22c55e' : undefined,
                              fontWeight: isAutoMapped ? 'bold' : 'normal',
                              minWidth: '200px',
                              backgroundColor: unmappedColumns && unmappedColumns.includes(columnMap[field] || '') 
                                ? 'rgba(251, 191, 36, 0.2)' 
                                : undefined
                            }}
                          >
                            <option value="">-- Skip --</option>
                            {columns.map((col) => {
                              const isUnmappedColumn = unmappedColumns && unmappedColumns.includes(col)
                              const isAlreadyMapped = existingColumnMap && Object.values(existingColumnMap).includes(col)
                              return (
                                <option 
                                  key={col} 
                                  value={col}
                                  style={{
                                    backgroundColor: isUnmappedColumn ? 'rgba(251, 191, 36, 0.3)' : undefined,
                                    fontWeight: isUnmappedColumn ? 'bold' : 'normal'
                                  }}
                                >
                                  {col}
                                  {suggestion && col === suggestion.column ? ' ⭐' : ''}
                                  {isUnmappedColumn ? ' 🔴' : ''}
                                  {isAlreadyMapped && !isUnmappedColumn ? ' ✓' : ''}
                                </option>
                              )
                            })}
                          </select>
                        )}
                        {suggestion && !columnMap[field] && (
                          <button
                            type="button"
                            className="button"
                            style={{ 
                              marginLeft: '0.5rem', 
                              padding: '0.25rem 0.5rem',
                              fontSize: '0.875rem'
                            }}
                            onClick={() => handleMapChange(field, suggestion.column)}
                          >
                            Use Suggestion
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      })}

      <button
        className="button"
        onClick={handleSubmit}
        disabled={mapping}
        style={{ marginTop: '1rem' }}
      >
        {mapping ? 'Creating Patients...' : 'Create Patient Records'}
      </button>
    </div>
  )
}

export default ColumnMapper
