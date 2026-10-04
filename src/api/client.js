export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function api(path, { method = 'GET', body, headers, signal } = {}) {
  let response
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
      ...(body ? { body: JSON.stringify(body) } : {}),
      ...(signal ? { signal } : {}),
    })
  } catch {
    throw new ApiError('Campus services are temporarily unavailable. Check your connection and try again.', 0)
  }

  let result = {}
  try { result = await response.json() } catch { /* A non-JSON response receives the same useful error handling. */ }
  if (!response.ok) throw new ApiError(result.error || 'Your request could not be completed.', response.status)
  return result
}