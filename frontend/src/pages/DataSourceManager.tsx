import { useState, useEffect } from 'react'
import { Database, FolderOpen, CheckCircle, AlertCircle, XCircle, RefreshCw, X, Upload, Download, Shield } from 'lucide-react'
import { SUPABASE_CONFIG, isSupabaseConfigured } from '../config/supabase'
import '../App.css'

interface TableInfo {
  name: string
  columns: ColumnInfo[]
  row_count: number
}

interface ColumnInfo {
  name: string
  type: string
  is_nullable: boolean
  default_value?: string
}

interface DataSource {
  type: 'csv' | 'supabase'
  name: string
  description: string
  status: 'connected' | 'disconnected' | 'error'
}

function DataSourceManager() {
  const [tables, setTables] = useState<TableInfo[]>([])
  const [selectedTable, setSelectedTable] = useState<string>('')
  const [tableData, setTableData] = useState<any[]>([])
  const [loadingTables, setLoadingTables] = useState(false)
  const [loadingData, setLoadingData] = useState(false)
  const [error, setError] = useState<string>('')

  // Data sources status
  const [dataSources] = useState<DataSource[]>([
    {
      type: 'csv',
      name: 'CSV Upload',
      description: 'Uploaded data files with patient records',
      status: 'connected'
    },
    {
      type: 'supabase',
      name: 'Database Storage',
      description: `Connected to ${SUPABASE_CONFIG.URL}`,
      status: isSupabaseConfigured() ? 'connected' : 'disconnected'
    }
  ])

  const loadTables = async () => {
    if (!isSupabaseConfigured()) {
      setError('Supabase not configured. Please check your .env file.')
      return
    }

    setLoadingTables(true)
    setError('')
    
    try {
      // Get table information using PostgreSQL information schema
      const response = await fetch(`${SUPABASE_CONFIG.URL}/rest/v1/rpc/get_table_info`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_CONFIG.API_KEY,
          'Authorization': `Bearer ${SUPABASE_CONFIG.API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      })

      if (!response.ok) {
        // Fallback: try to get common tables
        const commonTables = ['patients', 'users', 'profiles', 'patient_data', 'medical_records']
        const tableInfos: TableInfo[] = []
        
        for (const tableName of commonTables) {
          try {
            const countResponse = await fetch(`${SUPABASE_CONFIG.URL}/rest/v1/${tableName}?select=count`, {
              headers: {
                'apikey': SUPABASE_CONFIG.API_KEY,
                'Authorization': `Bearer ${SUPABASE_CONFIG.API_KEY}`,
                'Prefer': 'count=exact'
              }
            })
            
            if (countResponse.ok) {
              const count = parseInt(countResponse.headers.get('content-range')?.split('/')[1] || '0')
              tableInfos.push({
                name: tableName,
                columns: [],
                row_count: count
              })
            }
          } catch (err) {
            // Table doesn't exist, skip it
          }
        }
        
        setTables(tableInfos)
      } else {
        const data = await response.json()
        setTables(data)
      }
    } catch (err: any) {
      console.error('Failed to load tables:', err)
      setError(`Failed to load tables: ${err.message}`)
    } finally {
      setLoadingTables(false)
    }
  }

  const loadTableData = async (tableName: string) => {
    if (!isSupabaseConfigured()) return

    setLoadingData(true)
    setError('')
    
    try {
      const response = await fetch(`${SUPABASE_CONFIG.URL}/rest/v1/${tableName}?limit=100`, {
        headers: {
          'apikey': SUPABASE_CONFIG.API_KEY,
          'Authorization': `Bearer ${SUPABASE_CONFIG.API_KEY}`
        }
      })

      if (!response.ok) {
        throw new Error(`Failed to load data: ${response.statusText}`)
      }

      const data = await response.json()
      setTableData(data)
      setSelectedTable(tableName)
    } catch (err: any) {
      console.error('Failed to load table data:', err)
      setError(`Failed to load table data: ${err.message}`)
    } finally {
      setLoadingData(false)
    }
  }

  useEffect(() => {
    if (isSupabaseConfigured()) {
      loadTables()
    }
  }, [])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected': return '#10b981'
      case 'disconnected': return '#f59e0b'
      case 'error': return '#ef4444'
      default: return '#6b7280'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected': return <CheckCircle size={16} />
      case 'disconnected': return <AlertCircle size={16} />
      case 'error': return <XCircle size={16} />
      default: return <AlertCircle size={16} />
    }
  }

  return (
    <div>
      <div className="section-header">
        <div>
          <h1 className="section-title">Data Sources</h1>
          <p className="section-description">
            Manage and view data from multiple sources. Process data between uploaded files and database storage.
          </p>
        </div>
      </div>

      {/* Data Sources Overview */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3 style={{ marginTop: 0, color: 'var(--text-primary)' }}>Connected Data Sources</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
          {dataSources.map((source, index) => (
            <div key={index} style={{
              padding: '1rem',
              border: `1px solid var(--border)`,
              borderRadius: '8px',
              backgroundColor: 'var(--surface-secondary)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ marginRight: '0.5rem', color: 'var(--text-secondary)' }}>
                  {source.type === 'csv' ? <FolderOpen size={20} /> : <Database size={20} />}
                </span>
                <strong style={{ color: 'var(--text-primary)' }}>{source.name}</strong>
                <span style={{ 
                  marginLeft: '0.5rem', 
                  color: getStatusColor(source.status)
                }}>
                  {getStatusIcon(source.status)}
                </span>
              </div>
              <p style={{ 
                color: 'var(--text-secondary)', 
                fontSize: '14px',
                margin: '0.5rem 0'
              }}>
                {source.description}
              </p>
              <div style={{
                padding: '0.25rem 0.5rem',
                backgroundColor: `${getStatusColor(source.status)}20`,
                color: getStatusColor(source.status),
                borderRadius: '4px',
                fontSize: '12px',
                display: 'inline-block'
              }}>
                {source.status.toUpperCase()}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Database Tables */}
      {isSupabaseConfigured() && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ marginTop: 0, color: 'var(--text-primary)' }}>Database Tables</h3>
            <button className="button" onClick={loadTables} disabled={loadingTables} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {loadingTables ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <RefreshCw size={16} />
                  Refresh Tables
                </>
              )}
            </button>
          </div>

          {error && (
            <div style={{
              padding: '0.75rem',
              backgroundColor: '#ef444420',
              border: '1px solid #ef4444',
              borderRadius: '4px',
              color: '#ef4444',
              marginBottom: '1rem'
            }}>
              Error: {error}
            </div>
          )}

          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {tables.length === 0 && !loadingTables ? (
              <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>
                No tables found. Create tables in your database to get started.
              </p>
            ) : (
              tables.map((table) => (
                <div key={table.name} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.75rem',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  backgroundColor: 'var(--surface)',
                  cursor: 'pointer'
                }}
                onClick={() => loadTableData(table.name)}
                >
                  <div>
                    <strong style={{ color: 'var(--text-primary)' }}>{table.name}</strong>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {table.row_count} rows • {table.columns.length} columns
                    </div>
                  </div>
                  <button className="button" style={{ padding: '0.25rem 0.5rem', fontSize: '12px' }}>
                    View Data
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Table Data Viewer */}
      {selectedTable && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ marginTop: 0, color: 'var(--text-primary)' }}>
              {selectedTable} Data {loadingData ? '(Loading...)' : `(${tableData.length} rows)`}
            </h3>
            <button className="button" onClick={() => setSelectedTable('')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <X size={16} />
              Close
            </button>
          </div>

          {loadingData ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
              <div className="loading" style={{ margin: '0 auto' }}></div>
              <p style={{ marginTop: '1rem' }}>Loading table data...</p>
            </div>
          ) : tableData.length > 0 ? (
            <div style={{ 
              overflowX: 'auto', 
              maxHeight: '60vh', 
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
                    {Object.keys(tableData[0] || {}).map((key) => (
                      <th key={key} style={{ 
                        border: '1px solid var(--border)', 
                        padding: '12px 8px', 
                        textAlign: 'left',
                        fontWeight: 'bold',
                        color: 'var(--text-primary)'
                      }}>
                        {key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableData.map((row, index) => (
                    <tr key={index} style={{ 
                      backgroundColor: index % 2 === 0 ? 'var(--surface)' : 'var(--surface-secondary)',
                      borderBottom: '1px solid var(--border)'
                    }}>
                      {Object.values(row).map((value: any, cellIndex) => (
                        <td key={cellIndex} style={{ 
                          border: '1px solid var(--border)', 
                          padding: '10px 8px',
                          color: 'var(--text-primary)',
                          maxWidth: '200px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {value === null ? 'NULL' : String(value)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
              No data found in this table.
            </div>
          )}
        </div>
      )}

      {/* Data Processing Actions */}
      <div className="card">
        <h3 style={{ marginTop: 0, color: 'var(--text-primary)' }}>Data Processing</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
          <button className="button" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
            <Upload size={16} />
            Export to Database
          </button>
          <button className="button" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
            <Download size={16} />
            Import from Database
          </button>
          <button className="button" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
            <RefreshCw size={16} />
            Sync Data Sources
          </button>
          <button className="button" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
            <Shield size={16} />
            Validate Data
          </button>
        </div>
      </div>
    </div>
  )
}

export default DataSourceManager
