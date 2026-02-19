import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { authApi } from '../api/client'

interface User {
  id: string
  email: string
  full_name?: string
  is_active: boolean
  is_verified: boolean
}

interface AuthContextType {
  user: User | null
  token: string | null
  login: (email: string, password: string) => Promise<void>
  /** Complete login with an access token (e.g. after session OTP flow) */
  loginWithToken: (accessToken: string) => Promise<void>
  register: (email: string, password: string, fullName?: string) => Promise<void>
  logout: () => void
  isAuthenticated: boolean
  hasSession: boolean // True if token has session_id (unlocked session)
  loading: boolean
}

/** Decode JWT token to check if it has session_id */
function hasSessionId(token: string | null): boolean {
  if (!token) return false
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return false
    const payload = JSON.parse(atob(parts[1]))
    return !!payload.session_id
  } catch {
    return false
  }
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check if user is logged in on mount
    const storedToken = localStorage.getItem('token')
    if (storedToken) {
      setToken(storedToken)
      // Try to fetch user info
      authApi.getCurrentUser()
        .then(setUser)
        .catch(() => {
          // Token invalid, clear it and user
          localStorage.removeItem('token')
          setToken(null)
          setUser(null)
        })
        .finally(() => setLoading(false))
    } else {
      setUser(null)
      setLoading(false)
    }
  }, [])

  const login = async (email: string, password: string) => {
    const response = await authApi.login(email, password)
    await loginWithToken(response.access_token)
  }

  const loginWithToken = async (accessToken: string) => {
    setToken(accessToken)
    localStorage.setItem('token', accessToken)
    const userData = await authApi.getCurrentUser()
    setUser(userData)
  }

  const register = async (email: string, password: string, fullName?: string) => {
    await authApi.register(email, password, fullName)
    // After registration, log them in
    await login(email, password)
  }

  const logout = () => {
    setToken(null)
    setUser(null)
    localStorage.removeItem('token')
  }

  const hasSession = hasSessionId(token)

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        loginWithToken,
        register,
        logout,
        isAuthenticated: !!token && !!user,
        hasSession,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
