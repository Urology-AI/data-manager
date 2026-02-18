import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { datasetsApi } from '../api/client'
import { Dataset } from '../types'
import UploadDataset from '../components/UploadDataset'
import '../App.css'

function DatasetsPage() {
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    loadDatasets()
  }, [])

  const loadDatasets = async () => {
    try {
      setLoading(true)
      const data = await datasetsApi.list()
      setDatasets(data)
    } catch (error) {
      console.error('Failed to load datasets:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleUploadSuccess = () => {
    loadDatasets()
  }

  const handleDelete = async (datasetId: string, datasetName: string) => {
    if (!window.confirm(`Are you sure you want to delete "${datasetName}"?\n\nThis will permanently delete the uploaded file. This action cannot be undone.`)) {
      return
    }

    try {
      setDeletingId(datasetId)
      await datasetsApi.delete(datasetId)
      // Reload datasets after deletion
      await loadDatasets()
    } catch (error: any) {
      const errorMsg = error.response?.data?.detail || error.message || 'Failed to delete dataset'
      alert(`Error: ${errorMsg}`)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div>
      <div className="section-header">
        <div>
          <h1 className="section-title">Dataset Manager</h1>
          <p className="section-description">
            Upload and manage CSV/Excel files. Map columns, pre-process data, and add to database.
            Handle both new uploads and existing datasets here.
          </p>
        </div>
      </div>
      
      <div className="card">
        <h2>📤 Upload New Dataset</h2>
        <UploadDataset onSuccess={handleUploadSuccess} />
      </div>

      <div className="card">
        <h2>📋 Existing Datasets</h2>
        {loading ? (
          <p>Loading...</p>
        ) : datasets.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📤</div>
            <p style={{ fontSize: '1.1rem' }}>No datasets uploaded yet.</p>
            <p>Upload your first CSV or Excel file to get started.</p>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Name</th>
                <th>Filename</th>
                <th>Data Type</th>
                <th>Patients</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {datasets.map((dataset) => {
                const patientCount = dataset.patient_count || 0
                const isProcessed = patientCount > 0
                const hasMapping = !!dataset.column_map
                
                return (
                  <tr key={dataset.id}>
                    <td>
                      {isProcessed ? (
                        <span style={{ color: '#22c55e', fontSize: '1.2rem' }} title={`${patientCount} patient(s) added to database`}>
                          ✅
                        </span>
                      ) : (
                        <span style={{ color: '#f59e0b', fontSize: '1.2rem' }} title="Not yet processed">
                          ⏳
                        </span>
                      )}
                    </td>
                    <td>{dataset.name}</td>
                    <td>{dataset.source_filename}</td>
                    <td>{dataset.data_type || 'generic'}</td>
                    <td>
                      {isProcessed ? (
                        <strong style={{ color: '#22c55e' }}>{patientCount}</strong>
                      ) : (
                        <span style={{ color: '#6b7280' }}>0</span>
                      )}
                    </td>
                    <td>{new Date(dataset.created_at).toLocaleDateString()}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button
                          className="button"
                          onClick={() => navigate(`/datasets/${dataset.id}`)}
                        >
                          {isProcessed ? 'View' : 'Process'}
                        </button>
                        {hasMapping && (
                          <button
                            className="button button-secondary"
                            onClick={() => navigate(`/datasets/${dataset.id}/view`)}
                          >
                            View Data
                          </button>
                        )}
                        {!isProcessed && (
                          <button
                            className="button button-secondary"
                            onClick={() => handleDelete(dataset.id, dataset.name)}
                            disabled={deletingId === dataset.id}
                            style={{
                              backgroundColor: 'rgba(239, 68, 68, 0.1)',
                              color: '#fca5a5',
                              borderColor: 'rgba(239, 68, 68, 0.3)'
                            }}
                            title="Delete this unmapped dataset"
                          >
                            {deletingId === dataset.id ? 'Deleting...' : '🗑️ Delete'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export default DatasetsPage
