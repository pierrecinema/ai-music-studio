import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './i18n'
import './styles/globals.css'
import { ErrorBoundary } from './components/common/ErrorBoundary'
import './audio/engine'
import { startAutosave } from './project/io'
import { initDiagLog } from './lib/diagLog'

// every uncaught error ends up in the error log that "Feedback" can show
window.addEventListener('error', (e) => { void window.api?.feedback?.logError(`window error: ${e.message} at ${e.filename}:${e.lineno}`) })
window.addEventListener('unhandledrejection', (e) => { void window.api?.feedback?.logError(`unhandled rejection: ${(e.reason as Error)?.stack ?? String(e.reason)}`) })
startAutosave()
void initDiagLog()

// test hook: a test page sets __AMS_TEST__ before the app starts to reach the engine and the stores
if ((window as unknown as { __AMS_TEST__?: boolean }).__AMS_TEST__) {
  void Promise.all([import('./audio/engine'), import('./stores/project.store'), import('./stores/audio.store'), import('./shortcuts/history'), import('./project/io'), import('./shortcuts/handlers'), import('./components/common/Feedback'), import('./edit/quantize'), import('./edit/grid'), import('./stores/ui.store'), import('./beatmatch/store')])
    .then(([engine, project, audio, history, io, handlers, feedback, quantize, grid, ui, beatmatch]) => {
      ;(window as unknown as { __ams: unknown }).__ams = { engine, project, audio, history, io, handlers, feedback, quantize, grid, ui, beatmatch }
    })
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
