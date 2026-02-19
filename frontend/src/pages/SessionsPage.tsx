import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { authApi } from '../api/client'
import { getApiErrorMessage } from '../api/errors'

interface DataSession {
  id: string
  name: string
  created_at: string
}

const inputStyle = {
  width: '100%',
  padding: '0.75rem',
  borderRadius: '8px',
  border: '1px solid var(--border)',
  background: 'var(--bg-tertiary)',
  color: 'var(--text-primary)',
} as const

export default function SessionsPage() {
  const [sessions, setSessions] = useState<DataSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createPassword, setCreatePassword] = useState('')
  const [createConfirmPassword, setCreateConfirmPassword] = useState('')
  const [creating, setCreating] = useState(false)
  const [unlockingSessionId, setUnlockingSessionId] = useState<string | null>(null)
  const [unlockPassword, setUnlockPassword] = useState('')
  const [unlocking, setUnlocking] = useState(false)
  const { loginWithToken, isAuthenticated, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/login', { replace: true })
      return
    }
    if (isAuthenticated) {
      loadSessions()
    }
  }, [isAuthenticated, authLoading, navigate])

  const loadSessions = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await authApi.listDataSessions()
      setSessions(data)
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Failed to load sessions'))
    } finally {
      setLoading(false)
    }
  }

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
    if (!createName.trim()) {
      setError('Session name is required')
      return
    }
    if (createPassword.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (createPassword !== createConfirmPassword) {
      setError('Passwords do not match')
      return
    }

    setCreating(true)
    try {
      await authApi.createDataSession(createName.trim(), createPassword)
      setShowCreate(false)
      setCreateName('')
      setCreatePassword('')
      setCreateConfirmPassword('')
      await loadSessions()
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Failed to create session'))
    } finally {
      setCreating(false)
    }
  }

  const handleUnlock = async (sessionId: string, e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
    if (!unlockPassword) {
      setError('Password is required')
      return
    }

    setUnlocking(true)
    setUnlockingSessionId(sessionId)
    try {
      const data = await authApi.unlockDataSession(sessionId, unlockPassword)
      await loginWithToken(data.access_token)
      navigate('/datasets')
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Failed to unlock session. Incorrect password?'))
      setUnlockPassword('')
    } finally {
      setUnlocking(false)
      setUnlockingSessionId(null)
    }
  }

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return dateString
    }
  }

  if (loading || authLoading) {
    return (
      <div className="card" style={{ maxWidth: '800px', margin: '2rem auto', textAlign: 'center' }}>
        Loading sessions...
      </div>
    )
  }

  return (
    <div className="card" style={{ maxWidth: '800px', margin: '2rem auto' }}>
      <h1>Data Sessions</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
        Each session has its own encryption key. Unlock a session to access its data.
      </p>

      {error && (
        <div style={{ color: 'var(--error)', marginBottom: '1rem', padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
          {error}
        </div>
      )}

      {!showCreate && (
        <button
          onClick={() => {
            setShowCreate(true)
            setError('')
          }}
          className="button"
          style={{ marginBottom: '1.5rem' }}
        >
          + Create New Session
        </button>
      )}

      {showCreate && (
        <div style={{ marginBottom: '2rem', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
          <h2 style={{ marginTop: 0 }}>Create New Session</h2>
          <form onSubmit={handleCreateSession}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem' }}>Session Name</label>
              <input
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="e.g., Clinical 2024"
                required
                style={inputStyle}
                autoFocus
              />
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem' }}>Unlock Password</label>
              <input
                type="password"
                value={createPassword}
                onChange={(e) => setCreatePassword(e.target.value)}
                placeholder="At least 8 characters"
                required
                minLength={8}
                style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem' }}>Confirm Password</label>
              <input
                type="password"
                value={createConfirmPassword}
                onChange={(e) => setCreateConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                required
                minLength={8}
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="submit" className="button" disabled={creating}>
                {creating ? 'Creating...' : 'Create Session'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCreate(false)
                  setCreateName('')
                  setCreatePassword('')
                  setCreateConfirmPassword('')
                  setError('')
                }}
                className="button-secondary"
                disabled={creating}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {sessions.length === 0 && !showCreate ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
          <p>No sessions yet. Create your first session to get started.</p>
        </div>
      ) : (
        <div>
          <h2 style={{ marginTop: 0 }}>Your Sessions</h2>
          {sessions.map((session) => (
            <div
              key={session.id}
              style={{
                padding: '1rem',
                marginBottom: '1rem',
                background: 'var(--bg-secondary)',
                borderRadius: '8px',
                border: '1px solid var(--border)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <div>
                  <h3 style={{ margin: 0 }}>{session.name}</h3>
                  <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                    Created {formatDate(session.created_at)}
                  </p>
                </div>
              </div>
              {unlockingSessionId === session.id ? (
                <form onSubmit={(e) => handleUnlock(session.id, e)} style={{ marginTop: '1rem' }}>
                  <div style={{ marginBottom: '0.75rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem' }}>Unlock Password</label>
                    <input
                      type="password"
                      value={unlockPassword}
                      onChange={(e) => setUnlockPassword(e.target.value)}
                      placeholder="Enter session password"
                      required
                      style={inputStyle}
                      autoFocus
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button type="submit" className="button" disabled={unlocking}>
                      {unlocking ? 'Unlocking...' : 'Unlock Session'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setUnlockingSessionId(null)
                        setUnlockPassword('')
                        setError('')
                      }}
                      className="button-secondary"
                      disabled={unlocking}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  onClick={() => {
                    setUnlockingSessionId(session.id)
                    setUnlockPassword('')
                    setError('')
                  }}
                  className="button"
                  style={{ marginTop: '0.5rem' }}
                >
                  Unlock Session
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
