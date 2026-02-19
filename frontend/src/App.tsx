import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate, Navigate } from 'react-router-dom'
import { useState } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import DatasetsPage from './pages/DatasetsPage'
import DatasetDetailPage from './pages/DatasetDetailPage'
import PatientsPage from './pages/PatientsPage'
import DataViewerPage from './pages/DataViewerPage'
import DataManagerPage from './pages/DataManagerPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import SessionsPage from './pages/SessionsPage'
import HandleAuthRedirectPage from './pages/HandleAuthRedirectPage'
import { sessionApi } from './api/client'
import { getApiErrorMessage } from './api/errors'
import './App.css'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, hasSession, loading } = useAuth()
  
  if (loading) {
    return <div className="card" style={{ textAlign: 'center' }}>Loading...</div>
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  
  // If authenticated but no session unlocked, redirect to sessions page
  if (!hasSession) {
    return <Navigate to="/sessions" replace />
  }
  
  return <>{children}</>
}

function SessionsRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth()
  
  if (loading) {
    return <div className="card" style={{ textAlign: 'center' }}>Loading...</div>
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  
  return <>{children}</>
}

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
      // Redirect to datasets page after clearing
      navigate('/datasets')
      window.location.reload() // Reload to refresh all data
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
      title="Clear all data and start a new session"
    >
      {isClearing ? '🔄 Clearing...' : showConfirm ? '⚠️ Confirm Clear All' : '🗑️ Clear All'}
    </button>
  )
}

function Navigation() {
  const location = useLocation()
  const { isAuthenticated, hasSession, user, logout } = useAuth()
  const isDatasetManagement =
    location.pathname === '/' ||
    location.pathname.startsWith('/datasets')
  const isDataManager = location.pathname === '/data-manager'
  const isSessions = location.pathname === '/sessions'

  if (!isAuthenticated) {
    return null
  }

  return (
    <nav className="navbar">
      <div className="nav-container">
        <Link to={hasSession ? "/datasets" : "/sessions"} className="nav-logo">
          Data Manager
        </Link>
        <div className="nav-links">
          {hasSession && (
            <>
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
              <ClearAllButton />
            </>
          )}
          <Link 
            to="/sessions" 
            className={isSessions ? 'active' : ''}
            title="Manage data sessions"
          >
            🔐 Sessions
          </Link>
          <span style={{ color: 'var(--text-secondary)', marginLeft: '1rem' }}>
            {user?.email}
          </span>
          <button
            onClick={logout}
            className="button-secondary"
            style={{ marginLeft: '0.5rem' }}
          >
            Logout
          </button>
        </div>
      </div>
    </nav>
  )
}

function AppRoutes() {
  return (
    <BrowserRouter>
      <div className="app">
        <Navigation />
        <main className="main-content">
          <Routes>
            {/* Authentication routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/auth/callback" element={<HandleAuthRedirectPage />} />
            
            {/* Sessions route (authenticated but doesn't require unlocked session) */}
            <Route path="/sessions" element={<SessionsRoute><SessionsPage /></SessionsRoute>} />
            
            {/* Protected routes (require unlocked session) */}
            <Route path="/" element={<ProtectedRoute><DatasetsPage /></ProtectedRoute>} />
            <Route path="/datasets" element={<ProtectedRoute><DatasetsPage /></ProtectedRoute>} />
            <Route path="/datasets/:id" element={<ProtectedRoute><DatasetDetailPage /></ProtectedRoute>} />
            <Route path="/datasets/:id/patients" element={<ProtectedRoute><PatientsPage /></ProtectedRoute>} />
            <Route path="/datasets/:id/view" element={<ProtectedRoute><DataViewerPage /></ProtectedRoute>} />
            <Route path="/data-manager" element={<ProtectedRoute><DataManagerPage /></ProtectedRoute>} />
            
            {/* Redirect root to datasets if authenticated, otherwise to login */}
            <Route path="*" element={<Navigate to="/datasets" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}

export default App
