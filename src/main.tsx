import React from 'react'
import ReactDOM from 'react-dom/client'
import { AppBootstrap } from './app/providers/AppBootstrap'
import { AppRouter } from './app/router/AppRouter'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppBootstrap>
      <AppRouter />
    </AppBootstrap>
  </React.StrictMode>,
)
