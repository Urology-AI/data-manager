import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  useReactTable,
  getCoreRowModel,
  createColumnHelper,
  flexRender,
} from '@tanstack/react-table'
import { patientsApi, fieldsApi } from '../api/client'
import { Patient, PaginatedResponse } from '../types'
import '../App.css'

const columnHelper = createColumnHelper<Patient>()

interface CanonicalField {
  field: string
  label: string
  type: string
  domain: string
  required: boolean
}

function PatientsPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<PaginatedResponse<Patient> | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filling, setFilling] = useState(false)
  const [canonicalFields, setCanonicalFields] = useState<CanonicalField[]>([])

  useEffect(() => {
    loadCanonicalFields()
  }, [])

  useEffect(() => {
    if (id) {
      loadPatients()
    }
  }, [id, search])

  const loadCanonicalFields = async () => {
    try {
      const data = await fieldsApi.getCanonicalFields()
      setCanonicalFields(data.fields || [])
    } catch (err) {
      console.error('Failed to load canonical fields:', err)
      setCanonicalFields([])
    }
  }

  const loadPatients = async () => {
    if (!id) return
    try {
      setLoading(true)
      const result = await patientsApi.list(id, {
        search: search || undefined,
        limit: 100,
        offset: 0,
      })
      setData(result)
    } catch (error) {
      console.error('Failed to load patients:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleFill = async (mode: 'strict' | 'impute') => {
    if (!id) return
    try {
      setFilling(true)
      await patientsApi.fill(id, mode)
      loadPatients()
    } catch (error) {
      console.error('Failed to fill data:', error)
    } finally {
      setFilling(false)
    }
  }

  // Generate columns dynamically from canonical fields
  const columns = [
    // Always show patient_key first
    columnHelper.accessor('patient_key', {
      header: 'Patient Key',
    }),
    // Then show fields in priority order by domain
    ...canonicalFields
      .filter((field: CanonicalField) => {
        // Show all canonical fields (no exclusions needed after cleanup)
        return true
      })
      .sort((a: CanonicalField, b: CanonicalField) => {
        // Sort by domain priority
        const domainOrder: Record<string, number> = {
          'Patient Identification': 1,
          'Demographics': 2,
          'Clinical Data': 3,
          'Other': 4,
        }
        return (domainOrder[a.domain] || 99) - (domainOrder[b.domain] || 99)
      })
      .map((fieldDef: CanonicalField) => {
        const { field, label, type } = fieldDef
        return columnHelper.accessor(field as keyof Patient, {
          header: label,
          cell: (info: any) => {
            const value = info.getValue()
            if (value === null || value === undefined || value === '') return '-'
            
            // Format based on type
            if (type === 'float' && typeof value === 'number') {
              return value.toFixed(2)
            }
            if (type === 'integer' && typeof value === 'number') {
              return value.toString()
            }
            if (type === 'boolean' && typeof value === 'boolean') {
              return value ? 'Yes' : 'No'
            }
            if (type === 'datetime' && typeof value === 'string') {
              return new Date(value).toLocaleDateString()
            }
            
            // Special handling for some fields
            if (field === 'age_group') {
              return value || '-'
            }
            
            return String(value)
          },
        })
      }),
  ]

  const table = useReactTable({
    data: data?.items || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1>Patients</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            className="button button-secondary"
            onClick={() => navigate(`/datasets/${id}/view`)}
          >
            View Raw Data
          </button>
          <button
            className="button button-secondary"
            onClick={() => navigate(`/datasets/${id}`)}
          >
            Back to Dataset
          </button>
        </div>
      </div>

      <div className="card">
        <h2>Fill Missing Data</h2>
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
          <button
            className="button"
            onClick={() => handleFill('strict')}
            disabled={filling}
          >
            Fill Strict Mode
          </button>
          <button
            className="button"
            onClick={() => handleFill('impute')}
            disabled={filling}
          >
            Fill Impute Mode
          </button>
        </div>
        {filling && <p>Filling data...</p>}
      </div>

      <div className="card">
        <h2>Patient List</h2>
        <div style={{ marginBottom: '1rem' }}>
          <input
            type="text"
            placeholder="Search patients..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input"
            style={{ width: '300px' }}
          />
        </div>

        {loading ? (
          <p>Loading...</p>
        ) : (
          <>
            <table className="table">
              <thead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <th key={header.id}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {data && (
              <p style={{ marginTop: '1rem' }}>
                Showing {data.items.length} of {data.total} patients
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default PatientsPage
