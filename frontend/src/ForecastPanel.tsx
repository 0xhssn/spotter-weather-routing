import { memo, useEffect, useRef, useState } from 'react'
import { Layers, MapPinned, Pause, Play } from 'lucide-react'
import { RouteMap } from './RouteMap'
import { COLORS, LEVELS } from './types'
import type { Checkpoint, Plan } from './types'
import { dateTime, originZone } from './time'

const PLAYBACK_TICK_MS=50
const FORECAST_DURATION_MS=12000
const FORECAST_HOURS=48

export const ForecastPanel=memo(function ForecastPanel({plan,selectedId,onSelect,checkpoint,onCheckpoint,busy}:{plan:Plan;selectedId:string;onSelect:(id:string)=>void;checkpoint:Checkpoint|null;onCheckpoint:(c:Checkpoint|null)=>void;busy:boolean}) {
  const [hour,setHour]=useState(0),[playing,setPlaying]=useState(false)
  const currentHour=useRef(hour);currentHour.current=hour
  const [showHeat,setShowHeat]=useState(true),[showCheckpoints,setShowCheckpoints]=useState(true)
  const zone=originZone(plan.origin.timezone)
  useEffect(()=>{setHour(0);setPlaying(false)},[plan,selectedId])
  useEffect(()=>{if(busy)setPlaying(false)},[busy])
  useEffect(()=>{
    if(!playing)return
    const fromHour=currentHour.current,startedAt=Date.now()
    // Animate the complete weather window independently of route duration.
    const timer=setInterval(()=>{
      const next=Math.min(FORECAST_HOURS,fromHour+(Date.now()-startedAt)*FORECAST_HOURS/FORECAST_DURATION_MS)
      setHour(next)
      if(next>=FORECAST_HOURS)setPlaying(false)
    },PLAYBACK_TICK_MS)
    return ()=>clearInterval(timer)
  },[playing])
  const instant=new Date(new Date(plan.departure).getTime()+hour*3600000).toISOString()
  const minutes=Math.round(hour*60),hours=Math.floor(minutes/60),remainder=minutes%60
  const forecastLabel=`+${hours} hours${remainder?`, ${remainder} minutes`:''}, ${dateTime(instant,zone)}`
  return <section className="map-section" aria-label="Route map and forecast">
    <div className="map-toolbar"><div><MapPinned size={17}/><strong>Weather along your route</strong></div><div className="layer-controls"><Layers size={15} aria-hidden="true"/><label htmlFor="heat-layer"><input id="heat-layer" type="checkbox" checked={showHeat} onChange={e=>setShowHeat(e.target.checked)}/>Weather heatmap</label><label htmlFor="checkpoints-layer"><input id="checkpoints-layer" type="checkbox" checked={showCheckpoints} onChange={e=>setShowCheckpoints(e.target.checked)}/>Checkpoints</label></div></div>
    <div className="map-wrap"><RouteMap plan={plan} selectedId={selectedId} onSelect={onSelect} hour={hour} showHeat={showHeat} showCheckpoints={showCheckpoints} checkpoint={checkpoint} onCheckpoint={onCheckpoint}/><div className="map-legend"><strong>Risk</strong>{LEVELS.map((l,i)=><span key={l}><i style={{background:COLORS[i]}}/>{l}</span>)}</div></div>
    <div className="forecast-bar"><button className="play-button" disabled={busy} aria-label={playing?'Pause forecast':hour>=FORECAST_HOURS?'Replay forecast':'Play forecast'} onClick={()=>{if(hour>=FORECAST_HOURS)setHour(0);setPlaying(v=>!v)}}>{playing?<Pause size={15} fill="currentColor"/>:<Play size={15} fill="currentColor"/>}</button><div className="forecast-label"><strong>Forecast timeline</strong><span>{dateTime(instant,zone)}</span></div><div className="slider-wrap"><label className="sr-only" htmlFor="forecast">Forecast hours after departure</label><input id="forecast" type="range" min="0" max="48" step="any" value={hour} aria-valuetext={forecastLabel} onChange={e=>{setPlaying(false);setHour(Number(e.target.value))}}/><div className="slider-labels"><span>Departure</span><span>+12h</span><span>+24h</span><span>+36h</span><span>+48h</span></div></div><span className="forecast-offset">+{hours}h{remainder>0&&` ${remainder}m`}</span></div>
    <div className="timeline-explanation"><p>48-hour corridor forecast, updated hourly. Full playback: about 12 seconds.{plan.trip_exceeds_heatmap?' Route scores cover every checkpoint beyond this window.':''}</p></div>
  </section>
})
