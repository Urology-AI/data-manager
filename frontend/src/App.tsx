import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { FolderOpen, Eye, Server, Trash2, RefreshCw } from 'lucide-react'
import DatasetsPage from './pages/DatasetsPage'
import DatasetDetailPage from './pages/DatasetDetailPage'
import PatientsPage from './pages/PatientsPage'
import DataViewerPage from './pages/DataViewerPage'
import DataManagerPage from './pages/DataManagerPage'
import DataSourceManager from './pages/DataSourceManager'
import { sessionApi } from './api/client'
import { getApiErrorMessage } from './api/errors'
import './App.css'

function ClearAllButton() {
  const [isClearing, setIsClearing] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const navigate = useNavigate()

  const handleClearAll = async () => {
    if (!showConfirm) {
      setShowConfirm(true)
      return
    }

    setIsClearing(true)
    try {
      await sessionApi.clearAll()
      navigate('/datasets')
      window.location.reload()
    } catch (error: any) {
      alert(`Failed to clear data: ${getApiErrorMessage(error, 'Unknown error')}`)
    } finally {
      setIsClearing(false)
      setShowConfirm(false)
    }
  }

  return (
    <button
      onClick={handleClearAll}
      disabled={isClearing}
      className="button-danger"
      title="Clear all data and start fresh"
      style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
    >
      {isClearing ? (
        <>
          <RefreshCw size={16} className="animate-spin" />
          Clearing...
        </>
      ) : showConfirm ? (
        <>
          <Trash2 size={16} />
          Confirm Clear All
        </>
      ) : (
        <>
          <Trash2 size={16} />
          Clear All
        </>
      )}
    </button>
  )
}

function Navigation() {
  const location = useLocation()
  const isDatasets = location.pathname === '/' || location.pathname.startsWith('/datasets')
  const isDataManager = location.pathname === '/data-manager'
  const isDataSources = location.pathname === '/data-sources'

  return (
    <nav className="navbar">
      <div className="nav-container">
        <Link to="/datasets" className="nav-logo">
          Data Manager
        </Link>
        <div className="nav-links">
          <Link
            to="/datasets"
            className={isDatasets ? 'active' : ''}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <FolderOpen size={16} />
            Dataset Store
          </Link>
          <Link
            to="/data-manager"
            className={isDataManager ? 'active' : ''}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <Eye size={16} />
            Data Viewer
          </Link>
          <Link
            to="/data-sources"
            className={isDataSources ? 'active' : ''}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <Server size={16} />
            Data Sources
          </Link>
          <ClearAllButton />
        </div>
      </div>
    </nav>
  )
}

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <Navigation />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<DatasetsPage />} />
            <Route path="/datasets" element={<DatasetsPage />} />
            <Route path="/datasets/:id" element={<DatasetDetailPage />} />
            <Route path="/datasets/:id/patients" element={<PatientsPage />} />
            <Route path="/datasets/:id/view" element={<DataViewerPage />} />
            <Route path="/data-manager" element={<DataManagerPage />} />
            <Route path="/data-sources" element={<DataSourceManager />} />
            <Route path="*" element={<DatasetsPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
