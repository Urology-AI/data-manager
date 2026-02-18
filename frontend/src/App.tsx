import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import DatasetsPage from './pages/DatasetsPage'
import DatasetDetailPage from './pages/DatasetDetailPage'
import PatientsPage from './pages/PatientsPage'
import DataViewerPage from './pages/DataViewerPage'
import DataManagerPage from './pages/DataManagerPage'
import './App.css'

function Navigation() {
  const location = useLocation()
  const isDatasetManagement =
    location.pathname === '/' ||
    location.pathname.startsWith('/datasets')
  const isDataManager = location.pathname === '/data-manager'

  return (
    <nav className="navbar">
      <div className="nav-container">
        <Link to="/datasets" className="nav-logo">
          Data Manager
        </Link>
        <div className="nav-links">
          <Link 
            to="/datasets" 
            className={isDatasetManagement ? 'active' : ''}
            title="Upload and manage files (new and existing)"
          >
            📤 Dataset Manager
          </Link>
          <Link 
            to="/data-manager" 
            className={isDataManager ? 'active' : ''}
            title="View database table - no uploads"
          >
            📊 Data Manager
          </Link>
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
            {/* Dataset Management Mode (default) */}
            <Route path="/" element={<DatasetsPage />} />
            
            {/* Dataset Management Mode */}
            <Route path="/datasets" element={<DatasetsPage />} />
            <Route path="/datasets/:id" element={<DatasetDetailPage />} />
            <Route path="/datasets/:id/patients" element={<PatientsPage />} />
            <Route path="/datasets/:id/view" element={<DataViewerPage />} />
            
            {/* Data Manager */}
            <Route path="/data-manager" element={<DataManagerPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
