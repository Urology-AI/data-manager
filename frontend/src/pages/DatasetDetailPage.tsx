import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { datasetsApi } from '../api/client'
import { Dataset } from '../types'
import ColumnMapper from '../components/ColumnMapper'
import MissingnessPanel from '../components/MissingnessPanel'
import ReprocessCheck from '../components/ReprocessCheck'
import ExcelTable from '../components/ExcelTable'
import '../App.css'

function DatasetDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [dataset, setDataset] = useState<Dataset | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showMapper, setShowMapper] = useState(false)
  const [viewMode, setViewMode] = useState<'raw' | null>(null)
  const [rawData, setRawData] = useState<any[]>([])
  const [loadingData, setLoadingData] = useState(false)
  const [unmappedColumnsToMap, setUnmappedColumnsToMap] = useState<string[] | undefined>(undefined)

  useEffect(() => {
    if (id) {
      loadDataset()
    }
  }, [id])

  useEffect(() => {
    if (!id) return
    
    if (viewMode === 'raw') {
      loadRawData()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, viewMode])

  const loadDataset = async () => {
    if (!id) return
    try {
      setLoading(true)
      setError(null)
      const data = await datasetsApi.get(id)
      setDataset(data)
      // Show mapper if column_map is not set
      setShowMapper(!data.column_map)
      // Clear unmapped columns when loading dataset (unless explicitly set via "Map These Columns")
      // This ensures manual mapper opening shows only unmapped fields
      if (data.column_map) {
        setUnmappedColumnsToMap(undefined)
      }
    } catch (error: any) {
      console.error('Failed to load dataset:', error)
      const errorMsg = error.response?.data?.detail || error.message || 'Failed to load dataset'
      setError(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  const loadRawData = async () => {
    if (!id) return
    try {
      setLoadingData(true)
      const data = await datasetsApi.getRawData(id, 100, 0)
      setRawData(data.rows || [])
    } catch (error) {
      console.error('Failed to load raw data:', error)
    } finally {
      setLoadingData(false)
    }
  }

  const handleMappingSuccess = () => {
    setShowMapper(false)
    loadDataset()
  }

  const handleAddMissingColumns = (columns: string[]) => {
    // Store unmapped columns and show the mapper
    setUnmappedColumnsToMap(columns)
    setShowMapper(true)
    // Scroll to mapper after a brief delay
    setTimeout(() => {
      const mapperElement = document.querySelector('.card h2')
      if (mapperElement) {
        mapperElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }, 100)
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <p>Loading dataset...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="card" style={{ backgroundColor: 'var(--bg-error)', borderColor: 'var(--error)' }}>
        <h2 style={{ color: 'var(--error)', marginTop: 0 }}>❌ Error</h2>
        <p style={{ color: 'var(--text-primary)' }}>{error}</p>
        <button className="button" onClick={() => navigate('/datasets')}>
          Go Back to Datasets
        </button>
      </div>
    )
  }

  if (!dataset) {
    return (
      <div className="card">
        <h2>Dataset not found</h2>
        <p>The dataset you're looking for doesn't exist or has been deleted.</p>
        <button className="button" onClick={() => navigate('/datasets')}>
          Go Back to Datasets
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="section-header">
        <div>
          <h1 className="section-title">Dataset: {dataset.name}</h1>
          <p className="section-description">
            Map columns and pre-process this dataset before adding to the database.
          </p>
        </div>
      </div>
      
      <div className="card">
        <h2>📋 Details</h2>
        <p><strong>Filename:</strong> {dataset.source_filename}</p>
        <p><strong>Data Type:</strong> {dataset.data_type || 'generic'}</p>
        <p><strong>Created:</strong> {new Date(dataset.created_at).toLocaleString()}</p>
        <p><strong>Status:</strong> {
          (dataset.patient_count || 0) > 0 ? (
            <span style={{ color: '#22c55e' }}>
              ✅ Processed ({dataset.patient_count} patient{(dataset.patient_count || 0) !== 1 ? 's' : ''} added)
            </span>
          ) : (
            <span style={{ color: '#f59e0b' }}>⏳ Not yet processed</span>
          )
        }</p>
        <p><strong>Mapped:</strong> {dataset.column_map ? 'Yes' : 'No'}</p>
        {dataset.column_map && !showMapper && (
          <div style={{ marginTop: '1rem' }}>
            <button
              className="button button-secondary"
              onClick={() => {
                setUnmappedColumnsToMap(undefined)  // Clear unmapped columns for manual opening
                setShowMapper(true)
              }}
            >
              🔗 Edit Column Mapping
            </button>
          </div>
        )}
      </div>

      {showMapper && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ margin: 0 }}>🔗 Column Mapping</h2>
            {dataset.column_map && (
              <button
                className="button button-secondary"
                onClick={() => {
                  setShowMapper(false)
                  setUnmappedColumnsToMap(undefined)  // Clear when closing mapper manually
                }}
              >
                Close Mapper
              </button>
            )}
          </div>
          <ColumnMapper 
            datasetId={id!} 
            onSuccess={() => {
              handleMappingSuccess()
              setUnmappedColumnsToMap(undefined)  // Clear after successful mapping
            }}
            existingColumnMap={dataset.column_map || undefined}
            unmappedColumns={unmappedColumnsToMap}
            isProcessed={(dataset.patient_count || 0) > 0}
          />
        </div>
      )}

      {dataset.column_map && (
        <>
          <div className="card">
            <ReprocessCheck 
              datasetId={id!} 
              onAddMissingColumns={handleAddMissingColumns}
              isProcessed={(dataset.patient_count || 0) > 0}
            />
          </div>

          <div className="card">
            <MissingnessPanel datasetId={id!} />
          </div>

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
              <h2 style={{ margin: 0 }}>📄 Raw File Data</h2>
              <button
                className={`button ${viewMode === 'raw' ? '' : 'button-secondary'}`}
                onClick={() => setViewMode(viewMode === 'raw' ? null : 'raw')}
              >
                {viewMode === 'raw' ? '✓' : ''} View Raw Data
              </button>
            </div>

            {viewMode === 'raw' && (
              <div>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                  Raw CSV/Excel data before mapping. Columns shown as they appear in the file.
                </p>
                {rawData.length > 0 ? (
                  <ExcelTable
                    columns={rawData[0] ? Object.keys(rawData[0]).map(key => ({
                      key,
                      label: key,
                      type: 'string',
                      editable: false
                    })) : []}
                    data={rawData}
                    loading={loadingData}
                    maxHeight="60vh"
                  />
                ) : (
                  <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>
                    No raw data available
                  </p>
                )}
              </div>
            )}

            {!viewMode && (
              <div style={{ 
                textAlign: 'center', 
                padding: '2rem', 
                color: 'var(--text-muted)',
                backgroundColor: 'var(--bg-primary)',
                borderRadius: '8px',
                border: '1px dashed var(--border)'
              }}>
                <p style={{ marginBottom: '0.5rem' }}>Click "View Raw Data" to see the original file contents.</p>
                <p style={{ fontSize: '0.9rem' }}>To view and edit all patient data, go to <strong>Data Manager</strong>.</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default DatasetDetailPage
