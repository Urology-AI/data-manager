import { useEffect, useState } from 'react'
import { patientsApi } from '../api/client'

interface MissingnessPanelProps {
  datasetId: string
}

interface MissingnessData {
  total_patients: number
  missingness: Record<string, {
    missing_count: number
    missing_percentage: number
  }>
}

function MissingnessPanel({ datasetId }: MissingnessPanelProps) {
  const [data, setData] = useState<MissingnessData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadMissingness()
  }, [datasetId])

  const loadMissingness = async () => {
    try {
      setLoading(true)
      const result = await patientsApi.getMissingness(datasetId)
      setData(result)
    } catch (error) {
      console.error('Failed to load missingness:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <p>Loading missingness data...</p>
  }

  if (!data) {
    return <p>No data available</p>
  }

  return (
    <div>
      <h3>Missingness Summary</h3>
      <p>Total Patients: {data.total_patients}</p>
      <table className="table">
        <thead>
          <tr>
            <th>Field</th>
            <th>Missing Count</th>
            <th>Missing %</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(data.missingness).map(([field, stats]) => (
            <tr key={field}>
              <td>{field}</td>
              <td>{stats.missing_count}</td>
              <td>{stats.missing_percentage.toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default MissingnessPanel
