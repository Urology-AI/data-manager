import { useState } from 'react'
import apiClient from '../api/client'
import '../App.css'

interface Endpoint {
  method: string
  path: string
  description: string
  category: string
  requiresAuth?: boolean
}

const ENDPOINTS: Endpoint[] = [
  // Datasets
  {
    method: 'POST',
    path: '/api/datasets/upload',
    description: 'Upload a CSV dataset file',
    category: 'Datasets',
  },
  {
    method: 'GET',
    path: '/api/datasets',
    description: 'List all datasets',
    category: 'Datasets',
  },
  {
    method: 'GET',
    path: '/api/datasets/{id}',
    description: 'Get dataset details',
    category: 'Datasets',
  },
  {
    method: 'GET',
    path: '/api/datasets/{id}/columns',
    description: 'Get detected CSV columns',
    category: 'Datasets',
  },
  {
    method: 'POST',
    path: '/api/datasets/{id}/map',
    description: 'Map CSV columns to canonical fields and create patients',
    category: 'Datasets',
  },
  // Patients
  {
    method: 'GET',
    path: '/api/patients/dataset/{dataset_id}',
    description: 'List patients in a dataset with filtering',
    category: 'Patients',
  },
  {
    method: 'GET',
    path: '/api/patients/{id}',
    description: 'Get patient details',
    category: 'Patients',
  },
  {
    method: 'PATCH',
    path: '/api/patients/{id}',
    description: 'Update patient fields',
    category: 'Patients',
  },
  {
    method: 'POST',
    path: '/api/patients/dataset/{dataset_id}/fill',
    description: 'Fill missing data (strict/impute)',
    category: 'Patients',
  },
  {
    method: 'GET',
    path: '/api/patients/dataset/{dataset_id}/missingness',
    description: 'Get missingness summary for a dataset',
    category: 'Patients',
  },
  // Health
  {
    method: 'GET',
    path: '/health',
    description: 'Health check endpoint',
    category: 'System',
  },
]

function ApiExplorerPage() {
  const [selectedEndpoint, setSelectedEndpoint] = useState<Endpoint | null>(null)
  const [requestBody, setRequestBody] = useState('{}')
  const [response, setResponse] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const categories = Array.from(new Set(ENDPOINTS.map(e => e.category)))

  const handleTestEndpoint = async () => {
    if (!selectedEndpoint) return

    try {
      setLoading(true)
      setError(null)
      setResponse(null)

      const path = selectedEndpoint.path.replace(/{[^}]+}/g, '1') // Replace path params with dummy values
      let result

      switch (selectedEndpoint.method) {
        case 'GET':
          result = await apiClient.get(path)
          break
        case 'POST':
          const body = requestBody ? JSON.parse(requestBody) : {}
          result = await apiClient.post(path, body)
          break
        case 'PATCH':
          const patchBody = requestBody ? JSON.parse(requestBody) : {}
          result = await apiClient.patch(path, patchBody)
          break
        default:
          throw new Error(`Method ${selectedEndpoint.method} not supported`)
      }

      setResponse(result.data)
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Request failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h1>API Explorer</h1>
      <p>Explore and test all available API endpoints.</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        <div>
          <h2>Available Endpoints</h2>
          {categories.map((category) => (
            <div key={category} className="card" style={{ marginBottom: '1rem' }}>
              <h3>{category}</h3>
              {ENDPOINTS.filter(e => e.category === category).map((endpoint) => (
                <div
                  key={`${endpoint.method}-${endpoint.path}`}
                  onClick={() => setSelectedEndpoint(endpoint)}
                  style={{
                    padding: '0.75rem',
                    margin: '0.5rem 0',
                    border: selectedEndpoint === endpoint ? '2px solid #646cff' : '1px solid #333',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    backgroundColor: selectedEndpoint === endpoint ? '#2a2a2a' : 'transparent',
                  }}
                >
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <span
                      className="badge"
                      style={{
                        backgroundColor:
                          endpoint.method === 'GET'
                            ? '#22c55e'
                            : endpoint.method === 'POST'
                            ? '#3b82f6'
                            : endpoint.method === 'PATCH'
                            ? '#eab308'
                            : '#ef4444',
                        minWidth: '60px',
                        textAlign: 'center',
                      }}
                    >
                      {endpoint.method}
                    </span>
                    <code style={{ flex: 1 }}>{endpoint.path}</code>
                  </div>
                  <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9em', color: '#888' }}>
                    {endpoint.description}
                  </p>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div>
          {selectedEndpoint ? (
            <div className="card">
              <h2>Test Endpoint</h2>
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span
                    className="badge"
                    style={{
                      backgroundColor:
                        selectedEndpoint.method === 'GET'
                          ? '#22c55e'
                          : selectedEndpoint.method === 'POST'
                          ? '#3b82f6'
                          : '#eab308',
                    }}
                  >
                    {selectedEndpoint.method}
                  </span>
                  <code>{selectedEndpoint.path}</code>
                </div>
                <p style={{ color: '#888', fontSize: '0.9em' }}>{selectedEndpoint.description}</p>
              </div>

              {(selectedEndpoint.method === 'POST' || selectedEndpoint.method === 'PATCH') && (
                <div style={{ marginBottom: '1rem' }}>
                  <label>Request Body (JSON)</label>
                  <textarea
                    value={requestBody}
                    onChange={(e) => setRequestBody(e.target.value)}
                    className="input"
                    style={{ width: '100%', minHeight: '150px', fontFamily: 'monospace' }}
                    placeholder='{"key": "value"}'
                  />
                </div>
              )}

              <button className="button" onClick={handleTestEndpoint} disabled={loading}>
                {loading ? 'Sending...' : 'Test Endpoint'}
              </button>

              {error && (
                <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: '4px', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#fca5a5' }}>
                  <strong style={{ color: '#ef4444' }}>Error:</strong>
                  <pre style={{ marginTop: '0.5rem', color: '#ef4444' }}>{error}</pre>
                </div>
              )}

              {response && (
                <div style={{ marginTop: '1rem' }}>
                  <strong>Response:</strong>
                  <pre
                    style={{
                      marginTop: '0.5rem',
                      padding: '1rem',
                      backgroundColor: '#1a1a1a',
                      borderRadius: '4px',
                      overflow: 'auto',
                      maxHeight: '400px',
                    }}
                  >
                    {JSON.stringify(response, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <div className="card">
              <p>Select an endpoint to test it</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ApiExplorerPage
