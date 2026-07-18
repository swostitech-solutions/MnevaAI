import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import App from './App'
import { queryClient } from './queryClient'
import './styles/globals.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <Toaster position="bottom-right" toastOptions={{
          style: { background: '#0C1522', border: '1px solid rgba(56,139,253,0.2)', color: '#EEF2F8', fontFamily: '"Space Grotesk",sans-serif', fontSize: '13px' },
          success: { iconTheme: { primary: '#00E396', secondary: '#0C1522' } },
          error:   { iconTheme: { primary: '#FF5252', secondary: '#0C1522' } },
        }}/>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
)
