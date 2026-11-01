import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDownUp, ArrowRight, ChevronDown, FlaskConical, LoaderCircle, Navigation, Truck, X } from 'lucide-react'
import { api, ApiError } from './api'
import { PlaceSearch } from './PlaceSearch'
import { EmptyPlanner } from './EmptyPlanner'
import { ForecastPanel } from './ForecastPanel'
import { CheckpointTable, Recommendation, RouteCard } from './TripResults'
import { departureISO, localInput, originZone, zoneLabel } from './time'
import { Assumptions, StatusSlot, TripSummary } from './TripOverview'
import type { TripNote } from './TripOverview'

import type { Checkpoint, Place, Plan } from './types'

export default function App(){
  const inputZone=useRef(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')
  const locationEdits=useRef(0)
  const [origin,setOrigin]=useState<Place|null>(null)
  const [destination,setDestination]=useState<Place|null>(null)
  const [departure,setDeparture]=useState(()=>localInput(new Date(Date.now()+3600000),inputZone.current))
  const [load,setLoad]=useState(20000)
  const [spacing,setSpacing]=useState(25)
  const [plan,setPlan]=useState<Plan|null>(null)
  const [selectedId,setSelectedId]=useState('')
  const [checkpoint,setCheckpoint]=useState<Checkpoint|null>(null)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [errorCode,setErrorCode]=useState('')
  const [allowRoad,setAllowRoad]=useState(false)
  const [retryAfter,setRetryAfter]=useState(0)
  const [method,setMethod]=useState(false)
  const [tableOpen,setTableOpen]=useState(false)
  if(origin?.timezone)inputZone.current=origin.timezone
  const currentInputs=useRef({origin,destination,departure,load,spacing,allowRoad})
  currentInputs.current={origin,destination,departure,load,spacing,allowRoad}
  const request=useRef<AbortController|null>(null)
  const requestSequence=useRef(0)
  const apply=(data:Plan)=>{setPlan(data);setSelectedId(data.recommended_id||data.routes[0]?.id || '');setCheckpoint(null)}
  async function example(){
    const initialInputs=currentInputs.current
    const initialLocationEdits=locationEdits.current
    request.current?.abort();const controller=new AbortController();request.current=controller
    const sequence=++requestSequence.current
    setBusy(true);setError('');setErrorCode('')
    try{
      const data=await api<Plan>(`/api/example?load_lb=${load}&spacing_miles=${spacing}`,{signal:controller.signal})
      if(sequence!==requestSequence.current)return
      apply(data)
      const current=currentInputs.current
      if(locationEdits.current===initialLocationEdits && current.origin===initialInputs.origin && current.destination===initialInputs.destination && current.departure===initialInputs.departure && current.load===initialInputs.load && current.spacing===initialInputs.spacing && current.allowRoad===initialInputs.allowRoad){
        setOrigin(data.origin);setDestination(data.destination);setDeparture(localInput(data.departure,originZone(data.origin.timezone)));setAllowRoad(!!data.allow_road_fallback)
      }
    }catch(e){if(sequence===requestSequence.current && !controller.signal.aborted && e instanceof Error && e.name!=='AbortError'){setError(e.message);if(e instanceof ApiError){setRetryAfter(e.retryAfter);setErrorCode(e.code)}}}
    finally{if(sequence===requestSequence.current)setBusy(false)}
  }
  useEffect(()=>()=>request.current?.abort(),[])
  useEffect(()=>{
    if(!retryAfter)return
    const timer=setTimeout(()=>setRetryAfter(v=>v-1),1000)
    return ()=>clearTimeout(timer)
  },[retryAfter])
  useEffect(()=>{
    if(!method)return
    const previous=document.activeElement as HTMLElement|null
    const page=document.documentElement,body=document.body
    const pageOverflow=page.style.overflow,bodyOverflow=body.style.overflow,gutter=page.style.scrollbarGutter
    page.style.scrollbarGutter='stable'
    page.style.overflow='hidden';body.style.overflow='hidden'
    const dialog=document.querySelector<HTMLElement>('[role="dialog"]')
    const close=dialog?.querySelector<HTMLButtonElement>('button')
    close?.focus()
    const handle=(event:KeyboardEvent)=>{
      if(event.key==='Escape')setMethod(false)
      if(event.key==='Tab'){event.preventDefault();close?.focus()}
    }
    document.addEventListener('keydown',handle)
    return ()=>{
      document.removeEventListener('keydown',handle)
      page.style.overflow=pageOverflow;body.style.overflow=bodyOverflow;page.style.scrollbarGutter=gutter
      previous?.focus({preventScroll:true})
    }
  },[method])
  async function compare(event:React.FormEvent){
    event.preventDefault()
    if(!canCompare)return
    if(!origin||!destination){setError('Choose both cities from the search results.');return}
    request.current?.abort();const controller=new AbortController();request.current=controller
    const sequence=++requestSequence.current
    setBusy(true);setError('');setErrorCode('')
    try{
      const data=await api<Plan>('/api/plan',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({origin,destination,departure:departureISO(departure,originZone(origin.timezone)),load_lb:load,spacing_miles:spacing,allow_road_fallback:allowRoad})})
      if(sequence===requestSequence.current && !controller.signal.aborted)apply(data)
    }catch(e){if(sequence===requestSequence.current && !controller.signal.aborted && e instanceof Error && e.name!=='AbortError'){setError(e.message);if(e instanceof ApiError){setRetryAfter(e.retryAfter);setErrorCode(e.code)}}}
    finally{if(sequence===requestSequence.current)setBusy(false)}
  }
  const showCheckpoint=useCallback((value:Checkpoint)=>{setCheckpoint(value);document.querySelector('.map-wrap')?.scrollIntoView?.({block:'center'})},[])
  const select=useCallback((id:string)=>{setSelectedId(id);setCheckpoint(null)},[])
  const showOnMap=useCallback((id:string)=>{select(id);document.querySelector('.map-wrap')?.scrollIntoView?.({block:'center'})},[select])
  const selected=plan?.routes.find(r=>r.id===selectedId)
  const zone=inputZone.current
  const resultZone=originZone(plan?.origin.timezone)
  let parsedDeparture='', departureZone=zone
  try {parsedDeparture=departureISO(departure,zone);departureZone=zoneLabel(parsedDeparture,zone)} catch { /* Validation message appears on submit. */ }
  const changeDestination=(place:Place|null)=>{locationEdits.current++;setDestination(place)}
  const changeOrigin=(place:Place|null)=>{
    locationEdits.current++
    if(place?.timezone && place.timezone!==zone && parsedDeparture)setDeparture(localInput(parsedDeparture,place.timezone))
    setOrigin(place)
  }
  const dirty=!!plan&&(origin?.lat!==plan.origin.lat||origin?.lon!==plan.origin.lon||destination?.lat!==plan.destination.lat||destination?.lon!==plan.destination.lon||load!==plan.load_lb||spacing!==plan.spacing_miles||allowRoad!==!!plan.allow_road_fallback||!parsedDeparture||Date.parse(parsedDeparture)!==Date.parse(plan.departure))
  const departureMs=Date.parse(parsedDeparture),now=Date.now()
  const invalidInput=!origin||!destination?'Choose both cities from the search results.':
    Math.abs(origin.lat-destination.lat)+Math.abs(origin.lon-destination.lon)<.01?'Choose different origin and destination cities.':
    !parsedDeparture?'Choose a valid, unambiguous departure time at the origin.':
    departureMs<Math.floor(now/60000)*60000||departureMs>Math.floor((now+7*86400000)/60000)*60000?'Choose a departure between now and seven days from now.':
    !Number.isInteger(load)||load<0||load>100000?'Enter a whole-number load between 0 and 100,000 lb.':''
  const canCompare=!busy&&retryAfter===0&&!invalidInput
  const showUpdateBadge=dirty&&!busy
  const stale=!!plan&&(dirty||!!error)
  const unavailable=stale||busy
  const compareHelp=busy?'':retryAfter>0?'Retry available after the countdown.':invalidInput||
    (dirty?'Update needed.':plan?.mode==='live'?'Compare again to recheck this trip.':'Ready to compare live routes.')
  const notes:TripNote[]=[]
  const truckDistanceError=errorCode==='route_too_long'&&/truck router/i.test(error)
  if(error)notes.push({id:'error',tone:'error',text:truckDistanceError?'This trip is too long for truck routing. Turn on car-profile comparison to see car routes.':error,
    ...(truckDistanceError&&!allowRoad?{action:()=>{setAllowRoad(true);document.getElementById('allow-road')?.focus()},actionLabel:'Turn on'}:{})})
  if(dirty)notes.push({id:'changed',tone:'warning',text:'Trip inputs changed. Compare routes to update these results.'})
  if(plan?.routes.some(route=>route.routing_profile==='car'))notes.push({id:'car',tone:'warning',text:'Car-profile comparison: truck height, weight and access restrictions are not checked.'})
  if(plan)for(const warning of plan.warnings){
    if(/^(Road routes|Example scenario|Car-profile|All routes contain No Travel)/.test(warning))continue
    notes.push({id:warning,tone:'info',text:warning.includes('distinct route(s)')?`Only ${plan.routes.length} different ${plan.routes.length===1?'route was':'routes were'} found.`:warning})
  }
  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="/" aria-label="Waywise home"><span className="brand-icon"><Navigation size={22} fill="currentColor"/></span>waywise<span className="brand-dot">.</span></a><span className="brand-divider"/><span className="product-label">WEATHER-AWARE ROUTING</span></header>
    <div className="workspace">
      <aside className="sidebar">
        <div className="sidebar-title"><h2>Plan your trip</h2></div>
        <form onSubmit={compare}>
          <div className="location-fields"><PlaceSearch label="Origin" value={origin} onChange={changeOrigin}/><button type="button" className="swap-button" aria-label="Swap origin and destination" disabled={!origin||!destination} onClick={()=>{changeOrigin(destination);setDestination(origin)}}><ArrowDownUp size={14}/></button><PlaceSearch label="Destination" value={destination} onChange={changeDestination}/></div>
          <label className="field-label" htmlFor="departure">Departure <span>{origin ? `At origin · ${departureZone}` : 'Select an origin'}</span></label><input id="departure" type="datetime-local" value={departure} min={localInput(new Date(),zone)} max={localInput(new Date(Date.now()+7*86400000),zone)} onChange={e=>setDeparture(e.target.value)} required/>
          <div className="load-heading"><label htmlFor="load">Load weight</label><Truck size={15}/></div><div className="weight-input"><input id="load" type="number" min="0" max="100000" step="1" required value={load} onChange={e=>setLoad(Number(e.target.value))}/><span>lb</span></div>
          <div className="spacing-heading"><span id="spacing-label">Check weather every</span></div><div className="segmented" role="group" aria-labelledby="spacing-label">{[10,25,50].map(n=><button key={n} type="button" aria-pressed={spacing===n} className={spacing===n?'selected':''} onClick={()=>setSpacing(n)}>{n} mi</button>)}</div>
          <fieldset className="long-trips"><legend>Long trips</legend><label className="fallback-option" htmlFor="allow-road"><input id="allow-road" type="checkbox" checked={allowRoad} onChange={e=>setAllowRoad(e.target.checked)} aria-describedby="fallback-help"/>Allow car-profile comparison</label><p id="fallback-help" className="fallback-help">If the trip exceeds the truck router’s distance limit, compare car routes instead. Truck restrictions are not checked.</p></fieldset>
          <button type="submit" className={`primary-button${showUpdateBadge?' has-updates':''}`} disabled={!canCompare} aria-busy={busy} aria-describedby="compare-help">{retryAfter>0?<>Try again in {retryAfter}s</>:busy?<><LoaderCircle size={17} className="spin"/>Comparing routes…</>:<span className="compare-button-label">Compare live routes<ArrowRight size={17}/></span>}{showUpdateBadge&&<span className="compare-update-badge" aria-hidden="true">Update needed</span>}</button>
          <p id="compare-help" className={`compare-help${dirty?' sr-only':''}`}>{compareHelp}</p>
          <button type="button" className="example-button" onClick={()=>void example()} disabled={busy}><FlaskConical size={14}/>Load example scenario</button>
        </form>
      </aside>
      <main className="main-content">
        {plan&&<TripSummary plan={plan} onMethod={()=>setMethod(true)}/>}
        {!busy&&<StatusSlot notes={notes}/>}
        {plan && <>
          {unavailable&&<div className="results-context">Showing results for {plan.origin.label.split(',')[0]} → {plan.destination.label.split(',')[0]} · Previous comparison</div>}
          <div className="results-region" aria-busy={busy}>
            <div className={`results-content${unavailable?' is-stale':''}`} inert={unavailable}>
              {!unavailable&&<Recommendation plan={plan} onSelect={showOnMap}/>}
              <section className="route-cards" aria-label="Route options">{[...plan.routes].sort((a,b)=>Number(b.id===plan.recommended_id)-Number(a.id===plan.recommended_id)).map(route=><RouteCard key={route.id} route={route} selected={selectedId===route.id} recommended={!unavailable&&route.id===plan.recommended_id} onSelect={select} departure={plan.departure} zone={resultZone}/>)}</section>
              <ForecastPanel plan={plan} selectedId={selectedId} onSelect={select} busy={unavailable} checkpoint={checkpoint} onCheckpoint={setCheckpoint}/>
              {selected&&<section className="checkpoint-details" aria-label="Checkpoint details"><button className="checkpoint-toggle" aria-label="Checkpoint details" onClick={()=>setTableOpen(v=>!v)} aria-expanded={tableOpen} aria-controls="checkpoint-table"><strong>Checkpoint details</strong><span>{selected.name} · {selected.checkpoints.length} checkpoints · Times in {zoneLabel(plan.departure,resultZone)} (origin)</span><ChevronDown size={18} style={{transform:tableOpen?'rotate(180deg)':undefined}}/></button>{tableOpen&&<div id="checkpoint-table"><CheckpointTable route={selected} onCheckpoint={showCheckpoint} zone={resultZone}/></div>}</section>}
            </div>
            {busy&&<div className="results-loading" role="status"><LoaderCircle size={20} className="spin"/>Checking roads, arrival times, and weather…</div>}
          </div>
          <Assumptions plan={plan}/>
        </>}
        {!plan && <EmptyPlanner busy={busy}/>}
      </main>
    </div>
    {method && <div className="modal-backdrop" onClick={()=>setMethod(false)}><section className="method-modal" role="dialog" aria-modal="true" aria-labelledby="method-title" onClick={e=>e.stopPropagation()}><button className="modal-close" aria-label="Close explanation" onClick={()=>setMethod(false)}><X size={20}/></button><span className="eyebrow">THE LOGIC BEHIND THE LINE</span><h2 id="method-title">A safety-first comparison.</h2><p>We sample the road every 10, 25, or 50 miles and match the forecast to your estimated arrival at each checkpoint.</p><ol><li>Exclude any route with <strong>No Travel</strong> conditions.</li><li>Prefer the fewest <strong>Severe miles</strong>.</li><li>Then the fewest <strong>High miles</strong>.</li><li>Then the lowest distance-weighted average risk.</li><li>Use travel time as the final tie-breaker.</li></ol><p>The forecast timeline plays the full 48-hour corridor weather window in about 12 seconds, with weather updated hourly. Playback is independent of trip duration. Route scores always use each checkpoint’s arrival time.</p><p>The worse of two checkpoint risks applies to the road between them. Overlapping rain and snow boundaries use the higher category.</p><div className="rules-table"><table><thead><tr><th>Risk</th><th>Wind mph</th><th>Rain in/hr</th><th>Snow in/hr</th></tr></thead><tbody>{[['Low','<25','<0.10','<0.5'],['Moderate','25–<35','0.10–<0.25','0.5–<1'],['High','35–<45','0.25–<0.50','1–<2'],['Severe','45–<55','0.50–1.00','2–3'],['No Travel','≥55','>1.00','>3']].map(row=><tr key={row[0]}>{row.map(c=><td key={c}>{c}</td>)}</tr>)}</tbody></table></div><p><strong>Load overrides:</strong> wind ≥45 mph with a load over 30,000 lb means No Travel. Wind ≥35 mph with a load over 40,000 lb is at least Severe.</p><small>Wind and temperature are interpolated at arrival. Rain, snow and gusts use the hour containing arrival without smoothing precipitation peaks. Wind rules use sustained speed; gusts are shown separately. Weather can change between checkpoints. This assessment app is planning support, not a certified truck navigation system.</small></section></div>}
  </div>
}
