import { useState } from 'react'
import { datasetsApi } from '../api/client'
import { useNavigate } from 'react-router-dom'

interface UploadDatasetProps {
  onSuccess?: () => void
}

function UploadDataset({ onSuccess }: UploadDatasetProps) {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dataType, setDataType] = useState<string>('generic')
  const navigate = useNavigate()

  const validateAndSetFile = (selectedFile: File) => {
    // Check if it's actually a file (not a directory)
    if (!selectedFile || selectedFile.size === 0 && selectedFile.name === '') {
      setError('Please select a valid file, not a folder')
      setFile(null)
      return false
    }
    
    // Validate file type - support both CSV and Excel files
    const fileName = selectedFile.name.toLowerCase()
    const isValidCSV = fileName.endsWith('.csv') || 
                      selectedFile.type === 'text/csv' || 
                      selectedFile.type === 'application/vnd.ms-excel' ||
                      selectedFile.type === '' ||
                      selectedFile.type === 'text/plain' // Some systems save CSV as text/plain
    
    const isValidExcel = fileName.endsWith('.xlsx') || 
                         fileName.endsWith('.xls') ||
                         selectedFile.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
                         selectedFile.type === 'application/vnd.ms-excel'
    
    if (!isValidCSV && !isValidExcel) {
      setError(`Please select a CSV or Excel file (.csv, .xlsx, .xls). Selected file: ${selectedFile.name}`)
      setFile(null)
      return false
    }
    
    // Check file size (max 50MB)
    if (selectedFile.size > 50 * 1024 * 1024) {
      setError('File size must be less than 50MB')
      setFile(null)
      return false
    }
    
    // Additional check: ensure it's not empty
    if (selectedFile.size === 0) {
      setError('File appears to be empty')
      setFile(null)
      return false
    }
    
    setFile(selectedFile)
    setError(null)
    return true
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      const selectedFile = files[0]
      // Reset input value to allow selecting the same file again if needed
      e.target.value = ''
      validateAndSetFile(selectedFile)
    } else {
      setFile(null)
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    
    const droppedFile = e.dataTransfer.files?.[0]
    if (droppedFile) {
      validateAndSetFile(droppedFile)
    }
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a CSV or Excel file first')
      return
    }

    // Double-check file type
    const fileName = file.name.toLowerCase()
    const isValidCSV = fileName.endsWith('.csv') || file.type === 'text/csv'
    const isValidExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || 
                        file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
                        file.type === 'application/vnd.ms-excel'
    
    if (!isValidCSV && !isValidExcel) {
      setError('File must be a CSV or Excel file (.csv, .xlsx, .xls)')
      return
    }

    try {
      setUploading(true)
      setError(null)
      const dataset = await datasetsApi.upload(file, dataType)
      if (onSuccess) {
        onSuccess()
      }
      // Navigate to mapping page
      navigate(`/datasets/${dataset.id}`)
    } catch (err: any) {
      console.error('Upload error:', err)
      const errorMessage = err.message || err.response?.data?.detail || 'Upload failed. Please check the file format and try again.'
      setError(errorMessage)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
          Data Type
        </label>
        <select
          value={dataType}
          onChange={(e) => setDataType(e.target.value)}
          className="select"
          style={{ marginBottom: '1rem', width: '100%', maxWidth: '300px' }}
        >
          <option value="generic">Generic</option>
          <option value="epsa">ePSA</option>
          <option value="custom">Custom</option>
        </select>
        <small style={{ color: 'var(--text-muted)', display: 'block', marginTop: '0.25rem' }}>
          Select the data type to use appropriate column matching patterns
        </small>
      </div>
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
          Select CSV or Excel File
        </label>
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          style={{
            position: 'relative',
            border: isDragging ? '2px dashed #646cff' : '2px dashed #555',
            borderRadius: '8px',
            padding: '2rem',
            textAlign: 'center',
            backgroundColor: isDragging ? 'rgba(100, 108, 255, 0.1)' : 'transparent',
            transition: 'all 0.2s',
            cursor: uploading ? 'not-allowed' : 'pointer',
            marginBottom: '1rem',
            minHeight: '150px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center'
          }}
        >
          <input
            type="file"
            accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            onChange={handleFileChange}
            disabled={uploading}
            style={{ 
              position: 'absolute',
              width: '100%',
              height: '100%',
              top: 0,
              left: 0,
              opacity: 0,
              cursor: uploading ? 'not-allowed' : 'pointer',
              zIndex: 1
            }}
            id="csv-upload-input"
          />
          <div style={{
            pointerEvents: uploading ? 'none' : 'auto',
            zIndex: 0
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📁</div>
            <div style={{ marginBottom: '0.5rem', fontSize: '1.1rem', fontWeight: 500 }}>
              {isDragging ? 'Drop CSV or Excel file here' : 'Click to select or drag and drop CSV or Excel file'}
            </div>
            <div style={{ fontSize: '0.9em', color: 'var(--text-muted)' }}>
              Supports .csv, .xlsx, .xls files • Max 50MB
            </div>
          </div>
        </div>
        {file && (
          <div style={{ 
            marginTop: '0.5rem', 
            padding: '0.75rem',
            backgroundColor: '#1a3a1a',
            borderRadius: '4px',
            border: '1px solid #22c55e'
          }}>
            <div style={{ color: '#22c55e', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>✓</span>
              <span><strong>{file.name}</strong> ({(file.size / 1024).toFixed(2)} KB)</span>
            </div>
          </div>
        )}
      </div>
      {error && (
        <div style={{ 
          marginBottom: '1rem',
          padding: '0.75rem',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          color: '#fca5a5',
          borderRadius: '4px',
          border: '1px solid #fcc'
        }}>
          {error}
        </div>
      )}
      <button
        className="button"
        onClick={handleUpload}
        disabled={!file || uploading}
        style={{ minWidth: '150px' }}
      >
        {uploading ? 'Uploading...' : 'Upload File'}
      </button>
    </div>
  )
}

export default UploadDataset
