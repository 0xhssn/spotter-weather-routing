import { memo, useEffect, useRef, useState } from 'react'
import { Layers, MapPinned, Pause, Play } from 'lucide-react'
import { RouteMap } from './RouteMap'
import { COLORS, LEVELS } from './types'
import type { Checkpoint, Plan } from './types'
import { dateTime, originZone } from './time'
import { journeyPosition } from './journey'
import { JourneyProgress } from './JourneyProgress'

const PLAYBACK_TICK_MS=50
const PREVIEW_DURATION_MS=12000

export const ForecastPanel=memo(function ForecastPanel({plan,selectedId,onSelect,checkpoint,onCheckpoint,busy}:{plan:Plan;selectedId:string;onSelect:(id:string)=>void;checkpoint:Checkpoint|null;onCheckpoint:(c:Checkpoint|null)=>void;busy:boolean}) {
  const [hour,setHour]=useState(0),[playing,setPlaying]=useState(false)
  const currentHour=useRef(hour);currentHour.current=hour
  const [showHeat,setShowHeat]=useState(true),[showCheckpoints,setShowCheckpoints]=useState(true)
  const zone=originZone(plan.origin.timezone)
  const selectedRoute=plan.routes.find(r=>r.id===selectedId)
  const previewEnd=Math.min(48,(selectedRoute?.duration_s ?? 48*3600)/3600)
  useEffect(()=>{setHour(0);setPlaying(false)},[plan,selectedId])
  useEffect(()=>{if(busy)setPlaying(false)},[busy])
  useEffect(()=>{
    if(!playing)return
    const fromHour=currentHour.current,startedAt=Date.now()
    // Use elapsed time so rendering delays do not stretch a long route's preview.
    const timer=setInterval(()=>{
      const next=Math.min(previewEnd,fromHour+(Date.now()-startedAt)*previewEnd/PREVIEW_DURATION_MS)
      setHour(next)
      if(next>=previewEnd)setPlaying(false)
    },PLAYBACK_TICK_MS)
    return ()=>clearInterval(timer)
  },[playing,previewEnd])
  const instant=new Date(new Date(plan.departure).getTime()+hour*3600000).toISOString()
  const minutes=Math.round(hour*60),hours=Math.floor(minutes/60),remainder=minutes%60
  const forecastLabel=`+${hours} hours${remainder?`, ${remainder} minutes`:''}, ${dateTime(instant,zone)}`
  const position=selectedRoute?journeyPosition(selectedRoute,hour*3600):null
  return <section className="map-section" aria-label="Route map and forecast">
    <div className="map-toolbar"><div><MapPinned size={17}/><strong>Weather along your route</strong></div><div className="layer-controls"><Layers size={15} aria-hidden="true"/><label htmlFor="heat-layer"><input id="heat-layer" type="checkbox" checked={showHeat} onChange={e=>setShowHeat(e.target.checked)}/>Weather heatmap</label><label htmlFor="checkpoints-layer"><input id="checkpoints-layer" type="checkbox" checked={showCheckpoints} onChange={e=>setShowCheckpoints(e.target.checked)}/>Checkpoints</label></div></div>
    <div className="map-wrap"><RouteMap plan={plan} selectedId={selectedId} onSelect={onSelect} hour={hour} showHeat={showHeat} showCheckpoints={showCheckpoints} checkpoint={checkpoint} onCheckpoint={onCheckpoint}/><div className="map-legend"><strong>Risk</strong>{LEVELS.map((l,i)=><span key={l}><i style={{background:COLORS[i]}}/>{l}</span>)}</div></div>
    <div className="forecast-bar"><button className="play-button" disabled={busy} aria-label={playing?'Pause trip preview':hour>=previewEnd?'Replay trip preview':'Play trip preview'} onClick={()=>{if(hour>=previewEnd)setHour(0);setPlaying(v=>!v)}}>{playing?<Pause size={15} fill="currentColor"/>:<Play size={15} fill="currentColor"/>}</button><div className="forecast-label"><strong>Forecast & trip preview</strong><span>{dateTime(instant,zone)}</span></div><div className="slider-wrap"><label className="sr-only" htmlFor="forecast">Forecast hours after departure</label><input id="forecast" type="range" min="0" max="48" step="any" value={hour} aria-valuetext={forecastLabel} onChange={e=>{setPlaying(false);setHour(Number(e.target.value))}}/><div className="slider-labels"><span>Departure</span><span>+12h</span><span>+24h</span><span>+36h</span><span>+48h</span></div></div><span className="forecast-offset">+{hours}h{remainder>0&&` ${remainder}m`}</span></div>
    {selectedRoute&&<JourneyProgress route={selectedRoute} position={position}/>}
    <div className="timeline-explanation"><p role="status">{position?.phase==='arrived'?'Trip completed. Move the slider to inspect corridor weather after arrival.':plan.trip_exceeds_heatmap?'The corridor timeline shows the first 48 hours; scores cover the full trip. Full preview: about 12 seconds.':'48-hour corridor forecast, updated hourly. Full preview: about 12 seconds; pauses at arrival.'}</p></div>
  </section>
})
