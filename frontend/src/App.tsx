import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import DataManagerPage from './pages/DataManagerPage'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        {/* Minimal header */}
        <nav className="navbar">
          <div className="nav-container">
            <span className="nav-logo" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ShieldCheck size={20} />
              HIPAA Safe Harbor Checker
            </span>
          </div>
        </nav>

        <main className="main-content">
          <Routes>
            <Route path="/" element={<DataManagerPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
