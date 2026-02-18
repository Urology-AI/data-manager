import { useState, useEffect } from 'react'
import '../App.css'

interface Column {
  key: string
  label: string
  type?: string
  editable?: boolean
  width?: number
}

interface ExcelTableProps {
  columns: Column[]
  data: Record<string, any>[]
  onCellUpdate?: (rowIndex: number, columnKey: string, value: any) => void
  loading?: boolean
  showRowNumbers?: boolean
  maxHeight?: string
}

function EditableCell({ 
  value, 
  column, 
  rowIndex, 
  onUpdate 
}: { 
  value: any
  column: Column
  rowIndex: number
  onUpdate: (rowIndex: number, columnKey: string, value: any) => void
}) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(value ?? '')

  useEffect(() => {
    setEditValue(value ?? '')
  }, [value])

  const handleSave = () => {
    let processedValue: any = editValue
    
    if (column.type === 'integer') {
      processedValue = editValue === '' ? null : parseInt(editValue)
    } else if (column.type === 'float') {
      processedValue = editValue === '' ? null : parseFloat(editValue)
    } else if (column.type === 'boolean') {
      processedValue = editValue === 'true' || editValue === true
    } else if (column.type === 'datetime') {
      processedValue = editValue === '' ? null : editValue
    } else {
      processedValue = editValue === '' ? null : editValue
    }
    
    onUpdate(rowIndex, column.key, processedValue)
    setEditing(false)
  }

  const handleCancel = () => {
    setEditValue(value ?? '')
    setEditing(false)
  }

  const formatValue = (val: any): string => {
    if (val === null || val === undefined || val === '') return '-'
    if (column.type === 'float' && typeof val === 'number') return val.toFixed(2)
    if (column.type === 'boolean') return val ? 'Yes' : 'No'
    if (column.type === 'datetime' && typeof val === 'string') {
      return new Date(val).toLocaleDateString()
    }
    return String(val)
  }

  if (editing && column.editable !== false) {
    return (
      <td 
        style={{ 
          padding: '0.5rem', 
          border: '1px solid var(--border)',
          backgroundColor: 'var(--bg-primary)'
        }}
      >
        {column.type === 'boolean' ? (
          <select
            value={editValue ? 'true' : 'false'}
            onChange={(e) => setEditValue(e.target.value === 'true')}
            onBlur={handleSave}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave()
              if (e.key === 'Escape') handleCancel()
            }}
            autoFocus
            className="select"
            style={{ width: '100%', padding: '0.25rem' }}
          >
            <option value="false">No</option>
            <option value="true">Yes</option>
          </select>
        ) : (
          <input
            type={column.type === 'integer' || column.type === 'float' ? 'number' : column.type === 'datetime' ? 'date' : 'text'}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave()
              if (e.key === 'Escape') handleCancel()
            }}
            autoFocus
            className="input"
            style={{ width: '100%', padding: '0.25rem' }}
          />
        )}
      </td>
    )
  }

  return (
    <td
      style={{ 
        padding: '0.5rem', 
        border: '1px solid var(--border)',
        cursor: column.editable !== false ? 'pointer' : 'default',
        backgroundColor: editing ? 'var(--bg-primary)' : 'transparent'
      }}
      onClick={() => column.editable !== false && setEditing(true)}
      title={column.editable !== false ? 'Click to edit' : ''}
    >
      {formatValue(value)}
    </td>
  )
}

export default function ExcelTable({
  columns,
  data,
  onCellUpdate,
  loading = false,
  showRowNumbers = true,
  maxHeight = '70vh'
}: ExcelTableProps) {
  const handleCellUpdate = (rowIndex: number, columnKey: string, value: any) => {
    if (onCellUpdate) {
      onCellUpdate(rowIndex, columnKey, value)
    }
  }

  const getTypeBadge = (type?: string) => {
    if (!type) return null
    
    const typeColors: Record<string, string> = {
      string: '#3b82f6',
      integer: '#10b981',
      float: '#8b5cf6',
      boolean: '#f59e0b',
      datetime: '#ef4444',
    }
    
    const color = typeColors[type] || '#6b7280'
    
    return (
      <span style={{
        fontSize: '0.7rem',
        padding: '0.15rem 0.4rem',
        borderRadius: '4px',
        backgroundColor: `${color}20`,
        color: color,
        marginLeft: '0.5rem',
        fontWeight: 500
      }}>
        {type}
      </span>
    )
  }

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
        <div className="loading" style={{ margin: '0 auto' }}></div>
        <p style={{ marginTop: '1rem' }}>Loading data...</p>
      </div>
    )
  }

  return (
    <div style={{ 
      overflowX: 'auto', 
      maxHeight, 
      overflowY: 'auto',
      border: '1px solid var(--border)',
      borderRadius: '8px',
      backgroundColor: 'var(--bg-primary)'
    }}>
      <table className="table" style={{ 
        fontSize: '0.9rem',
        width: '100%',
        borderCollapse: 'separate',
        borderSpacing: 0
      }}>
        <thead style={{ 
          position: 'sticky', 
          top: 0, 
          backgroundColor: 'var(--bg-secondary)', 
          zIndex: 10,
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          <tr>
            {showRowNumbers && (
              <th style={{ 
                padding: '0.75rem', 
                border: '1px solid var(--border)', 
                whiteSpace: 'nowrap',
                textAlign: 'center',
                minWidth: '60px',
                backgroundColor: 'var(--bg-tertiary)',
                fontWeight: 600
              }}>
                #
              </th>
            )}
            {columns.map((column) => (
              <th 
                key={column.key}
                style={{ 
                  padding: '0.75rem', 
                  border: '1px solid var(--border)', 
                  whiteSpace: 'nowrap',
                  minWidth: column.width || '150px',
                  textAlign: 'left',
                  fontWeight: 600
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>{column.label}</span>
                  {getTypeBadge(column.type)}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td 
                colSpan={columns.length + (showRowNumbers ? 1 : 0)}
                style={{ 
                  padding: '2rem', 
                  textAlign: 'center', 
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border)'
                }}
              >
                No data available
              </td>
            </tr>
          ) : (
            data.map((row, rowIndex) => (
              <tr 
                key={rowIndex}
                style={{
                  transition: 'background-color 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(99, 102, 241, 0.05)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                }}
              >
                {showRowNumbers && (
                  <td style={{ 
                    padding: '0.5rem', 
                    border: '1px solid var(--border)', 
                    fontWeight: 'bold',
                    textAlign: 'center',
                    backgroundColor: 'var(--bg-tertiary)',
                    color: 'var(--text-secondary)'
                  }}>
                    {rowIndex + 1}
                  </td>
                )}
                {columns.map((column) => (
                  <EditableCell
                    key={column.key}
                    value={row[column.key]}
                    column={column}
                    rowIndex={rowIndex}
                    onUpdate={handleCellUpdate}
                  />
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
