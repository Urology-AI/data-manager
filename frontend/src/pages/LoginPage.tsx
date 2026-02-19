import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { authApi } from '../api/client'
import { getApiErrorMessage } from '../api/errors'

const inputStyle = {
  width: '100%',
  padding: '0.75rem',
  borderRadius: '8px',
  border: '1px solid var(--border)',
  background: 'var(--bg-tertiary)',
  color: 'var(--text-primary)',
} as const

export default function LoginPage() {
  const [step, setStep] = useState<1 | 2>(1)
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { loginWithToken, isAuthenticated, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate('/sessions', { replace: true })
    }
  }, [isAuthenticated, authLoading, navigate])

  // Step 1: Email -> create session, send OTP
  const handleSubmitEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await authApi.sessionStart(email.trim().toLowerCase())
      // Store session info for the redirect handler to use
      localStorage.setItem('authSessionId', data.session_id)
      localStorage.setItem('authEmail', email.trim().toLowerCase())
      setStep(2) // Move to the "Check your email" step
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Failed to send code'))
    } finally {
      setLoading(false)
    }
  }


  return (
    <div className="card" style={{ maxWidth: '400px', margin: '2rem auto' }}>
      <h1>Login</h1>
      {error && (
        <div style={{ color: 'var(--error)', marginBottom: '1rem' }}>{error}</div>
      )}

      {step === 1 && (
        <form onSubmit={handleSubmitEmail}>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            Enter your email. We’ll create a secure session and send a one-time code to your inbox.
          </p>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              style={inputStyle}
            />
          </div>
          <button type="submit" className="button" disabled={loading} style={{ width: '100%' }}>
            {loading ? 'Sending code...' : 'Continue'}
          </button>
        </form>
      )}

      {step === 2 && (
        <div>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Check your email</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            We've sent a sign-in link to <strong>{email}</strong>.
          </p>
          <p style={{ color: 'var(--text-secondary)' }}>
            Click the link in the email to complete your login.
          </p>
        </div>
      )}


      <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
        <Link to="/register" style={{ color: 'var(--primary)' }}>
          Don't have an account? Register
        </Link>
        <br />
        <Link
          to="/forgot-password"
          style={{ color: 'var(--primary)', marginTop: '0.5rem', display: 'inline-block' }}
        >
          Forgot password?
        </Link>
      </div>
    </div>
  )
}
