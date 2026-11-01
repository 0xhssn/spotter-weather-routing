import { memo, useEffect, useState } from 'react'
import { CloudRain, Focus, Layers, MapPinned, Pause, Play, Snowflake, Wind, X } from 'lucide-react'
import { RouteMap } from './RouteMap'
import { COLORS, LEVELS } from './types'
import type { Checkpoint, Plan } from './types'
import { originZone, tripDate, tripTime } from './time'
import { journeyPosition } from './journey'
import { JourneyProgress } from './JourneyProgress'

const PLAYBACK_TICK_MS=100
const HOURS_PER_TICK=PLAYBACK_TICK_MS/4000

export const ForecastPanel=memo(function ForecastPanel({plan,selectedId,onSelect,checkpoint,onCheckpoint,busy}:{plan:Plan;selectedId:string;onSelect:(id:string)=>void;checkpoint:Checkpoint|null;onCheckpoint:(c:Checkpoint|null)=>void;busy:boolean}) {
  const [hour,setHour]=useState(0),[playing,setPlaying]=useState(false)
  const [showHeat,setShowHeat]=useState(true),[showCheckpoints,setShowCheckpoints]=useState(true),[fitKey,setFitKey]=useState(0)
  const zone=originZone(plan.origin.timezone)
  const selectedRoute=plan.routes.find(r=>r.id===selectedId)
  const previewEnd=Math.min(48,(selectedRoute?.duration_s ?? 48*3600)/3600)
  useEffect(()=>{setHour(0);setPlaying(false)},[plan,selectedId])
  useEffect(()=>{if(busy)setPlaying(false)},[busy])
  useEffect(()=>{
    if(!playing)return
    if(hour>=previewEnd){setPlaying(false);return}
    const timer=setTimeout(()=>setHour(h=>Math.min(previewEnd,h+HOURS_PER_TICK)),PLAYBACK_TICK_MS)
    return ()=>clearTimeout(timer)
  },[playing,hour,previewEnd])
  const instant=new Date(new Date(plan.departure).getTime()+hour*3600000).toISOString()
  const minutes=Math.round(hour*60),hours=Math.floor(minutes/60),remainder=minutes%60
  const forecastLabel=`+${hours} hours${remainder?`, ${remainder} minutes`:''}, ${tripDate(instant,zone)}, ${tripTime(instant,zone)}`
  const position=selectedRoute?journeyPosition(selectedRoute,hour*3600):null
  return <section className="map-section" aria-label="Route map and forecast">
    <div className="map-toolbar"><div><MapPinned size={17}/><strong>Weather along your route</strong><span className="map-status">{plan.routes.find(r=>r.id===selectedId)?.name}</span></div><button className="icon-button" aria-label="Fit all routes to map" onClick={()=>setFitKey(k=>k+1)}><Focus size={18}/></button></div>
    <div className="map-wrap"><RouteMap plan={plan} selectedId={selectedId} onSelect={onSelect} hour={hour} showHeat={showHeat} showCheckpoints={showCheckpoints} fitKey={fitKey} onCheckpoint={onCheckpoint}/><div className="layer-controls"><Layers size={15}/><label htmlFor="heat-layer"><input id="heat-layer" type="checkbox" checked={showHeat} onChange={e=>setShowHeat(e.target.checked)}/>Weather heatmap</label><label htmlFor="checkpoints-layer"><input id="checkpoints-layer" type="checkbox" checked={showCheckpoints} onChange={e=>setShowCheckpoints(e.target.checked)}/>Checkpoints</label></div><div className="map-legend">{LEVELS.map((l,i)=><span key={l}><i style={{background:COLORS[i]}}/>{l}</span>)}</div>
    {checkpoint && <div className="checkpoint-card"><div><span className="eyebrow">CHECKPOINT · MILE {Math.round(checkpoint.mile)}</span><button aria-label="Close checkpoint details" onClick={()=>onCheckpoint(null)}><X size={16}/></button></div><h3 style={{color:COLORS[checkpoint.risk.score]}}>{checkpoint.risk.level}</h3><p>Arrival {tripTime(checkpoint.eta,zone)} · {tripDate(checkpoint.eta,zone)}</p><div className="weather-values"><span><Wind size={14}/>{checkpoint.weather.wind_mph.toFixed(1)} mph · gust {checkpoint.weather.gust_mph.toFixed(1)}</span><span><CloudRain size={14}/>{checkpoint.weather.rain_in.toFixed(2)} in/hr</span><span><Snowflake size={14}/>{checkpoint.weather.snow_in.toFixed(2)} in/hr</span></div><small>{checkpoint.risk.reasons.join(' · ')}</small></div>}</div>
    <div className="forecast-bar"><button className="play-button" disabled={busy} aria-label={playing?'Pause trip preview':hour>=previewEnd?'Replay trip preview':'Play trip preview'} onClick={()=>{if(hour>=previewEnd)setHour(0);setPlaying(v=>!v)}}>{playing?<Pause size={15} fill="currentColor"/>:<Play size={15} fill="currentColor"/>}</button><div className="forecast-label"><strong>Forecast & trip preview</strong><span>{tripDate(instant,zone)} · {tripTime(instant,zone)}</span></div><div className="slider-wrap"><label className="sr-only" htmlFor="forecast">Forecast hours after departure</label><input id="forecast" type="range" min="0" max="48" step="any" value={hour} aria-valuetext={forecastLabel} onChange={e=>{setPlaying(false);setHour(Number(e.target.value))}}/><div className="slider-labels"><span>Departure</span><span>+12h</span><span>+24h</span><span>+36h</span><span>+48h</span></div></div><span className="forecast-offset">+{hours}h{remainder>0&&` ${remainder}m`}</span></div>
    {selectedRoute&&<JourneyProgress route={selectedRoute} position={position}/>}
    <div className="timeline-explanation"><p role="status">{position?.phase==='arrived'?'Trip completed. The heatmap shows corridor weather at this time. Move the slider to inspect weather after arrival.':'Playback previews the selected trip and pauses at arrival. The slider covers 48 hours of corridor weather, updated hourly.'}</p><span>Preview speed: 1 trip hour / 4 seconds</span></div>
    {plan.trip_exceeds_heatmap&&<p className="timeline-notice">The corridor timeline shows the first 48 hours. Route scores include every checkpoint through arrival.</p>}
  </section>
})
