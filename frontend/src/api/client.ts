import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

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
