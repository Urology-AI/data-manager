import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getApiErrorMessage } from '../api/errors'

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const { register, isAuthenticated, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!authLoading && isAuthenticated && !success) {
      navigate('/datasets', { replace: true })
    }
  }, [isAuthenticated, authLoading, success, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      setLoading(false)
      return
    }

    try {
      await register(email, password, fullName || undefined)
      setSuccess(true)
      setTimeout(() => {
        navigate('/datasets')
      }, 2000)
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Registration failed'))
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="card" style={{ maxWidth: '400px', margin: '2rem auto' }}>
        <h1>Registration Successful!</h1>
        <p>Redirecting to datasets...</p>
      </div>
    )
  }

  return (
    <div className="card" style={{ maxWidth: '400px', margin: '2rem auto' }}>
      <h1>Register</h1>
      {error && <div style={{ color: 'var(--error)', marginBottom: '1rem' }}>{error}</div>}
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}>Full Name (Optional)</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            style={{
              width: '100%',
              padding: '0.75rem',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
            }}
          />
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{
              width: '100%',
              padding: '0.75rem',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
            }}
          />
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}>Password (min 8 characters)</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            style={{
              width: '100%',
              padding: '0.75rem',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
            }}
          />
        </div>
        <button type="submit" className="button" disabled={loading} style={{ width: '100%' }}>
          {loading ? 'Registering...' : 'Register'}
        </button>
      </form>
      <div style={{ marginTop: '1rem', textAlign: 'center' }}>
        <Link to="/login" style={{ color: 'var(--primary)' }}>Already have an account? Login</Link>
      </div>
    </div>
  )
}
