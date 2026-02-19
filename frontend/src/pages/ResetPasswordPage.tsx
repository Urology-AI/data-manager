import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { authApi } from '../api/client'
import { getApiErrorMessage } from '../api/errors'

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!token) {
      setError('Invalid reset token. Please request a new password reset.')
    }
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (!token) {
      setError('Invalid reset token')
      return
    }

    setLoading(true)

    try {
      await authApi.resetPassword(token, password)
      setSuccess(true)
      setTimeout(() => {
        navigate('/login')
      }, 2000)
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Failed to reset password'))
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="card" style={{ maxWidth: '400px', margin: '2rem auto' }}>
        <h1>Password Reset Successful!</h1>
        <p>Your password has been reset. Redirecting to login...</p>
      </div>
    )
  }

  if (!token) {
    return (
      <div className="card" style={{ maxWidth: '400px', margin: '2rem auto' }}>
        <h1>Invalid Reset Token</h1>
        <p>Please request a new password reset link.</p>
        <Link to="/forgot-password" className="button" style={{ display: 'inline-block', marginTop: '1rem' }}>
          Request Reset Link
        </Link>
      </div>
    )
  }

  return (
    <div className="card" style={{ maxWidth: '400px', margin: '2rem auto' }}>
      <h1>Reset Password</h1>
      {error && <div style={{ color: 'var(--error)', marginBottom: '1rem' }}>{error}</div>}
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}>New Password (min 8 characters)</label>
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
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}>Confirm Password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
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
          {loading ? 'Resetting...' : 'Reset Password'}
        </button>
      </form>
      <div style={{ marginTop: '1rem', textAlign: 'center' }}>
        <Link to="/login" style={{ color: 'var(--primary)' }}>Back to Login</Link>
      </div>
    </div>
  )
}
