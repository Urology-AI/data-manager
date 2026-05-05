import { Eraser } from 'lucide-react'
import DataManagerPage from './pages/DataManagerPage'
import './App.css'

export default function App() {
  return (
    <div className="app">
      <nav className="navbar">
        <div className="nav-container">
          <span className="nav-logo" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.15rem' }}>
            <Eraser size={18} />
            HIPAA De-identifier
          </span>
        </div>
      </nav>
      <main className="main-content">
        <DataManagerPage />
      </main>
    </div>
  )
}
