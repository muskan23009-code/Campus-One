import React, { Component } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

function redactDiagnostic(value, maximumLength) {
  if (typeof value !== 'string') return ''
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted email]')
    .replace(/\bPM-(?:S|ST|HOD|SC|AD|CS)\d+\b/gi, '[redacted user ID]')
    .replace(/\b(?:\+?\d[\d(). -]{7,}\d)\b/g, '[redacted phone]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[redacted token]')
    .replace(/\b(password|token|access.?code|secret|authorization|cookie|mobile|phone|email|user.?id|request.?id|full.?name|first.?name|last.?name|student.?name)\s*[:=]\s*("[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1=[redacted]')
    .replace(/https?:\/\/[^\s)]+/gi, (url) => {
      try {
        const parsed = new URL(url)
        return parsed.pathname
      } catch {
        return '[redacted URL]'
      }
    })
    .replace(/[A-Za-z0-9_-]{32,}/g, '[redacted opaque value]')
    .slice(0, maximumLength)
}

function errorNameOf(error) {
  if (typeof error?.name === 'string' && error.name) return redactDiagnostic(error.name, 80)
  if (typeof error?.constructor?.name === 'string' && error.constructor.name !== 'Object') {
    return redactDiagnostic(error.constructor.name, 80)
  }
  return typeof error === 'string' ? 'String rejection' : 'UnknownError'
}

class RenderErrorBoundary extends Component {
  state = { errorName: '', errorSource: '', errorMessage: '', errorLocation: '', errorStack: '' }

  static getDerivedStateFromError(error) {
    return {
      errorName: errorNameOf(error),
      errorSource: 'React rendering',
      errorMessage: redactDiagnostic(error?.message || String(error), 800),
      errorLocation: '',
      errorStack: redactDiagnostic(error?.stack || '', 1800),
    }
  }

  componentDidMount() {
    window.addEventListener('error', this.handleWindowError)
    window.addEventListener('unhandledrejection', this.handleUnhandledRejection)
  }

  componentWillUnmount() {
    window.removeEventListener('error', this.handleWindowError)
    window.removeEventListener('unhandledrejection', this.handleUnhandledRejection)
  }

  componentDidCatch(error, info) {
    console.error('[Campus One] React render failed.', this.state.errorName, redactDiagnostic(info.componentStack || '', 1200))
  }

  handleWindowError = (event) => {
    this.captureBrowserFailure(event.error || event.message, 'Window error', {
      message: event.message,
      filename: event.filename,
      line: event.lineno,
      column: event.colno,
    })
  }

  handleUnhandledRejection = (event) => {
    this.captureBrowserFailure(event.reason, 'Unhandled promise rejection')
  }

  captureBrowserFailure(error, errorSource, eventLocation = {}) {
    const stack = typeof error?.stack === 'string' ? error.stack : ''
    const sourceLocation = eventLocation.filename
      ? `${eventLocation.filename}:${eventLocation.line || 0}:${eventLocation.column || 0}`
      : ''
    const errorMessage = eventLocation.message || error?.message || (typeof error === 'string' ? error : '')
    const details = {
      errorName: errorNameOf(error),
      errorSource,
      errorMessage: redactDiagnostic(errorMessage, 800),
      errorLocation: redactDiagnostic(sourceLocation || stack.split('\n')[1]?.trim() || 'Location unavailable', 400),
      errorStack: redactDiagnostic(stack, 1800),
    }
    console.error('[Campus One] Browser runtime failure.', details)
    this.setState(details)
  }

  render() {
    if (this.state.errorName) {
      return (
        <main style={{ minHeight: '100vh', display: 'grid', alignContent: 'center', justifyItems: 'center', gap: 12, padding: 24, color: '#26322b', background: '#f5f6f3', fontFamily: 'sans-serif', textAlign: 'center' }}>
          <h1 style={{ margin: 0, fontSize: 20 }}>Campus One could not display this screen.</h1>
          <p style={{ margin: 0 }}>{this.state.errorSource} · {this.state.errorName}</p>
          <p style={{ maxWidth: '100%', overflowWrap: 'anywhere' }}>{this.state.errorMessage || 'No error message was provided.'}</p>
          <p style={{ maxWidth: '100%', overflowWrap: 'anywhere' }}>Source: {this.state.errorLocation || 'Location unavailable'}</p>
          {this.state.errorStack && (
            <details style={{ width: 'min(100%, 700px)', textAlign: 'left' }}>
              <summary>Error stack</summary>
              <pre style={{ maxHeight: '40vh', overflow: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{this.state.errorStack}</pre>
            </details>
          )}
          <button type="button" onClick={() => window.location.reload()} style={{ justifySelf: 'center', padding: '10px 16px', color: '#fff', background: '#28634d', border: 0, borderRadius: 4 }}>
            Reload Campus One
          </button>
        </main>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RenderErrorBoundary>
      <App />
    </RenderErrorBoundary>
  </React.StrictMode>,
)