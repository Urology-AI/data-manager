import { useState } from 'react'
import { Link } from 'react-router-dom'
import { authApi } from '../api/client'
import { getApiErrorMessage } from '../api/errors'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await authApi.forgotPassword(email)
      setSuccess(true)
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Failed to send reset email'))
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="card" style={{ maxWidth: '400px', margin: '2rem auto' }}>
        <h1>Email Sent</h1>
        <p>If the email exists, a password reset link has been sent to {email}.</p>
        <p>Please check your inbox and click the link to reset your password.</p>
        <Link to="/login" className="button" style={{ display: 'inline-block', marginTop: '1rem' }}>
          Back to Login
        </Link>
      </div>
    )
  }

  return (
    <div className="card" style={{ maxWidth: '400px', margin: '2rem auto' }}>
      <h1>Forgot Password</h1>
      {error && <div style={{ color: 'var(--error)', marginBottom: '1rem' }}>{error}</div>}
      <form onSubmit={handleSubmit}>
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
        <button type="submit" className="button" disabled={loading} style={{ width: '100%' }}>
          {loading ? 'Sending...' : 'Send Reset Link'}
        </button>
      </form>
      <div style={{ marginTop: '1rem', textAlign: 'center' }}>
        <Link to="/login" style={{ color: 'var(--primary)' }}>Back to Login</Link>
      </div>
    </div>
  )
}
