/**
 * Extract a user-friendly error message from API error responses.
 * Handles FastAPI's detail format (string or array of validation errors).
 */
export function getApiErrorMessage(error: any, fallback = 'An error occurred'): string {
  if (!error) return fallback
  const detail = error.response?.data?.detail
  if (detail === undefined || detail === null) {
    return error.message || fallback
  }
  if (typeof detail === 'string') {
    return detail
  }
  if (Array.isArray(detail)) {
    return detail
      .map((d: any) => d.msg || d.loc?.join('. ') || JSON.stringify(d))
      .join(', ')
  }
  if (typeof detail === 'object') {
    return (detail as any).msg || JSON.stringify(detail)
  }
  return error.message || fallback
}
