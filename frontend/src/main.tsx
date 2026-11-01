import React from 'react'
import ReactDOM from 'react-dom/client'
import 'leaflet/dist/leaflet.css'
import './tokens.css'
import './styles.css'
import App from './App'

const profiling=import.meta.env.DEV && new URLSearchParams(location.search).has('qa-profile')
const app=<React.StrictMode><App/></React.StrictMode>
ReactDOM.createRoot(document.getElementById('root')!).render(profiling?<React.Profiler id="app" onRender={(_,phase,duration)=>console.debug(`[waywise-profile] ${phase} react_ms=${duration.toFixed(2)}`)}>{app}</React.Profiler>:app)
