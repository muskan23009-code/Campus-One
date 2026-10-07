export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function api(path, { method = 'GET', body, headers, signal, timeoutMs } = {}) {
  let response
  let timeoutId
  let timedOut = false
  let controller
  let requestSignal = signal
  let forwardAbort
  if (timeoutMs > 0) {
    controller = new AbortController()
    requestSignal = controller.signal
    if (signal) {
      forwardAbort = () => controller.abort(signal.reason)
      if (signal.aborted) forwardAbort()
      else signal.addEventListener('abort', forwardAbort, { once: true })
    }
    timeoutId = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, timeoutMs)
  }
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
      ...(body ? { body: JSON.stringify(body) } : {}),
      ...(requestSignal ? { signal: requestSignal } : {}),
    })
    let result = {}
    try { result = await response.json() } catch (reason) {
      if (timedOut) throw reason
    }
    if (!response.ok) throw new ApiError(result.error || 'Your request could not be completed.', response.status)
    return result
  } catch (reason) {
    if (reason instanceof ApiError) throw reason
    if (timedOut) throw new ApiError('Sign-in timed out. Check your connection and try again.', 0)
    throw new ApiError('Campus services are temporarily unavailable. Check your connection and try again.', 0)
  } finally {
    clearTimeout(timeoutId)
    if (signal && forwardAbort) signal.removeEventListener('abort', forwardAbort)
  }
}