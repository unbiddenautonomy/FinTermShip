import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { refreshTheme } from './lib/theme'

// The seasonal theme changes with the date, so check it on start and when the tab returns.
refreshTheme()
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refreshTheme()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
