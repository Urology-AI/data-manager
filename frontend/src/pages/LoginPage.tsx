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
  const [sessionId, setSessionId] = useState('')
  const [otp, setOtp] = useState('')
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
      setSessionId(data.session_id)
      setStep(2)
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Failed to send code'))
    } finally {
      setLoading(false)
    }
  }

  // Step 2: OTP from email -> complete login (no password), redirect to sessions
  const handleSubmitOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await authApi.sessionVerifyOtp(sessionId, otp.trim())
      // After OTP verified, complete login (no password needed)
      const data = await authApi.sessionComplete(sessionId)
      await loginWithToken(data.access_token)
      navigate('/sessions')
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Invalid code or login failed'))
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    setError('')
    if (step === 2) {
      setStep(1)
      setOtp('')
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
        <form onSubmit={handleSubmitOtp}>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            Enter the 6-digit code we sent to <strong>{email}</strong>.
          </p>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Verification code</label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              maxLength={6}
              style={{ ...inputStyle, letterSpacing: '0.5rem', textAlign: 'center' }}
            />
          </div>
          <button type="submit" className="button" disabled={loading || otp.length !== 6} style={{ width: '100%' }}>
            {loading ? 'Verifying...' : 'Verify code'}
          </button>
          <p style={{ marginTop: '1rem', fontSize: '0.9rem' }}>
            Didn’t get the code?{' '}
            <button
              type="button"
              onClick={() => {
                setError('')
                setLoading(true)
                authApi.sessionStart(email).then((data) => {
                  setSessionId(data.session_id)
                  setError('')
                  setLoading(false)
                }).catch((err: any) => {
                  setError(getApiErrorMessage(err, 'Failed to resend'))
                  setLoading(false)
                })
              }}
              disabled={loading}
              style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: 0 }}
            >
              Resend code
            </button>
          </p>
          <button
            type="button"
            onClick={handleBack}
            className="button-secondary"
            style={{ width: '100%', marginTop: '0.5rem' }}
          >
            Back
          </button>
        </form>
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
