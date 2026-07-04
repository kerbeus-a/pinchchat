import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ThemeProvider } from './contexts/ThemeContext'
import './index.css'

// Register service worker for PWA support (offline caching, installability)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).then((reg) => {
      // Check for updates periodically (every 30 min)
      setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);

      // When a new SW is installed and waiting, reload to activate it
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New version available — reload on next navigation
            // The new SW called skipWaiting(), so it activates immediately
            // Reload to pick up cached assets from the new cache version
            window.location.reload();
          }
        });
      });
    }).catch(() => {
      // SW registration failed — app works fine without it
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
