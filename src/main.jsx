// main.jsx (no changes)
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

let rootNode = document.getElementById('root')

if (!rootNode) {
  console.error('React root container "#root" is missing. Injecting fallback root node.')
  rootNode = document.createElement('div')
  rootNode.id = 'root'
  document.body.appendChild(rootNode)
}

createRoot(rootNode).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
