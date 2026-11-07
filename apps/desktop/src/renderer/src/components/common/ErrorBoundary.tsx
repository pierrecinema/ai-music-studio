import React from 'react'

// A crash in one panel must not leave a blank window: show what happened and offer to continue.
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    void window.api?.feedback?.logError(`React error: ${error.stack ?? error.message}\n${info.componentStack ?? ''}`)
  }

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div style={{ padding: 40, color: '#eee', background: '#111', height: '100vh', fontFamily: 'system-ui, sans-serif' }}>
        <h2>Something went wrong</h2>
        <p style={{ color: '#aaa', lineHeight: 1.6 }}>
          The app hit an unexpected error. Your project was backed up automatically (every 30 seconds) and the error was written to the log.
          Press <b>Reload</b> to continue; you will be offered to restore unsaved work.
        </p>
        <pre style={{ whiteSpace: 'pre-wrap', background: '#1b1b1b', padding: 12, borderRadius: 8, maxHeight: 220, overflow: 'auto', color: '#f88' }}>{this.state.error.message}</pre>
        <button onClick={() => location.reload()} style={{ padding: '8px 18px', fontSize: 14, marginRight: 8 }}>Reload</button>
        <button onClick={() => void window.api?.feedback?.showCrashLog()} style={{ padding: '8px 18px', fontSize: 14 }}>Show error log</button>
      </div>
    )
  }
}
