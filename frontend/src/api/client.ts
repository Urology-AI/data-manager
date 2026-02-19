import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Add token to requests if available
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Handle 401/403 errors (unauthorized/forbidden) - redirect appropriately
const AUTH_PATHS = ['/login', '/register', '/forgot-password', '/reset-password']
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 || error.response?.status === 403) {
      const currentPath = window.location.pathname
      const isAuthPage = AUTH_PATHS.some((p) => currentPath.startsWith(p))
      if (!isAuthPage) {
        const token = localStorage.getItem('token')
        // If we have a token but get 401/403, might be missing session_id
        // Check if error message suggests session needed
        const errorDetail = error.response?.data?.detail || ''
        const needsSession = errorDetail.includes('session') || errorDetail.includes('Session')
        
        if (token && needsSession) {
          // Token exists but session not unlocked, go to sessions page
          window.location.href = '/sessions'
        } else {
          // No token or other auth issue, go to login
          localStorage.removeItem('token')
          window.location.href = '/login'
        }
      }
    }
    return Promise.reject(error)
  }
)

export default apiClient

export const datasetsApi = {
  upload: async (file: File, dataType: string = 'generic') => {
    const formData = new FormData()
    formData.append('file', file)
    try {
      const response = await apiClient.post('/api/datasets/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        params: {
          data_type: dataType
        },
        timeout: 60000, // 60 second timeout for large files
      })
      return response.data
    } catch (error: any) {
      // Better error handling
      if (error.response) {
        throw new Error(error.response.data?.detail || 'Upload failed')
      } else if (error.request) {
        throw new Error('Network error: Could not reach server')
      } else {
        throw new Error(error.message || 'Upload failed')
      }
    }
  },

  list: async () => {
    const response = await apiClient.get('/api/datasets')
    return response.data
  },

  get: async (id: string) => {
    const response = await apiClient.get(`/api/datasets/${id}`)
    return response.data
  },

  getRawData: async (id: string, limit: number = 100, offset: number = 0) => {
    const response = await apiClient.get(`/api/datasets/${id}/raw-data`, {
      params: { limit, offset }
    })
    return response.data
  },

  getColumns: async (id: string) => {
    const response = await apiClient.get(`/api/datasets/${id}/columns`)
    return response.data
  },

  getSuggestions: async (id: string) => {
    const response = await apiClient.get(`/api/datasets/${id}/suggest-mappings`)
    return response.data
  },

  mapColumns: async (id: string, columnMap: Record<string, string>) => {
    const response = await apiClient.post(`/api/datasets/${id}/map`, {
      column_map: columnMap,
    })
    return response.data
  },

  delete: async (id: string) => {
    const response = await apiClient.delete(`/api/datasets/${id}`)
    return response.data
  },

  reprocessCheck: async (id: string) => {
    const response = await apiClient.get(`/api/datasets/${id}/reprocess-check`)
    return response.data
  },

  reprocessUpdate: async (id: string) => {
    const response = await apiClient.post(`/api/datasets/${id}/reprocess-update`)
    return response.data
  },

  addUnmappedToExtraFields: async (id: string) => {
    const response = await apiClient.post(`/api/datasets/${id}/add-unmapped-to-extra-fields`)
    return response.data
  },
}

export const patientsApi = {
  create: async (data: any) => {
    const response = await apiClient.post('/api/patients', data)
    return response.data
  },

  list: async (datasetId: string, params?: {
    search?: string
    missing_field?: string
    limit?: number
    offset?: number
  }) => {
    const response = await apiClient.get(`/api/patients/dataset/${datasetId}`, { params })
    return response.data
  },

  listAll: async (params?: {
    search?: string
    limit?: number
    offset?: number
  }) => {
    const response = await apiClient.get('/api/patients/all', { params })
    return response.data
  },

  get: async (id: string) => {
    const response = await apiClient.get(`/api/patients/${id}`)
    return response.data
  },

  update: async (id: string, data: any) => {
    const response = await apiClient.patch(`/api/patients/${id}`, data)
    return response.data
  },

  bulkUpdate: async (updates: any[]) => {
    const response = await apiClient.patch('/api/patients/bulk-update', updates)
    return response.data
  },

  uploadFile: async (file: File, matchByMrn: boolean = true) => {
    const formData = new FormData()
    formData.append('file', file)
    try {
      const response = await apiClient.post('/api/patients/upload-file', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        params: { match_by_mrn: matchByMrn },
        timeout: 60000,
      })
      return response.data
    } catch (error: any) {
      if (error.response) {
        throw new Error(error.response.data?.detail || 'Upload failed')
      } else if (error.request) {
        throw new Error('Network error: Could not reach server')
      } else {
        throw new Error(error.message || 'Upload failed')
      }
    }
  },

  getCustomFields: async () => {
    const response = await apiClient.get('/api/patients/custom-fields')
    return response.data
  },

  addCustomField: async (fieldName: string, defaultValue?: string) => {
    const response = await apiClient.post('/api/patients/add-custom-field', null, {
      params: { field_name: fieldName, default_value: defaultValue }
    })
    return response.data
  },

  removeCustomField: async (fieldName: string) => {
    const response = await apiClient.delete('/api/patients/remove-custom-field', {
      params: { field_name: fieldName }
    })
    return response.data
  },

  fill: async (datasetId: string, mode: 'strict' | 'impute', patientIds?: string[]) => {
    const response = await apiClient.post(`/api/patients/dataset/${datasetId}/fill`, {
      mode,
      patient_ids: patientIds,
    })
    return response.data
  },

  getMissingness: async (datasetId: string) => {
    const response = await apiClient.get(`/api/patients/dataset/${datasetId}/missingness`)
    return response.data
  },
}

export const fieldsApi = {
  getCanonicalFields: async () => {
    const response = await apiClient.get('/api/canonical-fields')
    return response.data
  },
}

export const sessionApi = {
  clearAll: async () => {
    const response = await apiClient.delete('/api/session/clear-all')
    return response.data
  },
  
  getStats: async () => {
    const response = await apiClient.get('/api/session/stats')
    return response.data
  },
}

export const authApi = {
  register: async (email: string, password: string, fullName?: string) => {
    const response = await apiClient.post('/api/auth/register', {
      email,
      password,
      full_name: fullName,
    })
    return response.data
  },

  /** Session-based login: step 1 - submit email, create session, send OTP */
  sessionStart: async (email: string) => {
    const response = await apiClient.post('/api/auth/session/start', { email })
    return response.data
  },

  /** Session-based login: step 2 - verify link from email */
  sessionVerifyLink: async (sessionId: string) => {
    const response = await apiClient.post('/api/auth/session/verify-link', {
      session_id: sessionId,
    })
    return response.data
  },

  /** Session-based login: step 3 - complete login (no password), get token */
  sessionComplete: async (sessionId: string) => {
    const response = await apiClient.post('/api/auth/session/complete', {
      session_id: sessionId,
    })
    return response.data
  },

  /** List all data sessions for the current user */
  listDataSessions: async () => {
    const response = await apiClient.get('/api/auth/data-sessions')
    return response.data
  },

  /** Create a new data session with name and password */
  createDataSession: async (name: string, password: string) => {
    const response = await apiClient.post('/api/auth/data-sessions', {
      name,
      password,
    })
    return response.data
  },

  /** Unlock a data session with password, returns new token with session_id */
  unlockDataSession: async (sessionId: string, password: string) => {
    const response = await apiClient.post(`/api/auth/data-sessions/${sessionId}/unlock`, {
      password,
    })
    return response.data
  },

  /** Legacy: login with email + password in one step (no OTP) */
  login: async (email: string, password: string) => {
    const response = await apiClient.post('/api/auth/login-json', {
      email,
      password,
    })
    return response.data
  },

  getCurrentUser: async () => {
    const response = await apiClient.get('/api/auth/me')
    return response.data
  },

  forgotPassword: async (email: string) => {
    const response = await apiClient.post('/api/auth/forgot-password', { email })
    return response.data
  },

  resetPassword: async (token: string, newPassword: string) => {
    const response = await apiClient.post('/api/auth/reset-password', {
      token,
      new_password: newPassword,
    })
    return response.data
  },

  changePassword: async (currentPassword: string, newPassword: string) => {
    const response = await apiClient.post('/api/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
    })
    return response.data
  },

  verifyEmail: async (token: string) => {
    const response = await apiClient.get('/api/auth/verify-email', {
      params: { token },
    })
    return response.data
  },

  resendVerification: async (email: string) => {
    const response = await apiClient.post('/api/auth/resend-verification', { email })
    return response.data
  },
}
