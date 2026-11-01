import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDownUp, ArrowRight, ChevronDown, Compass, FlaskConical, Info, LoaderCircle, Navigation, Route as RouteIcon, ShieldCheck, SlidersHorizontal, Truck, X } from 'lucide-react'
import { api, ApiError } from './api'
import { PlaceSearch } from './PlaceSearch'
import { ForecastPanel } from './ForecastPanel'
import { CheckpointTable, Recommendation, RouteCard } from './TripResults'
import { departureISO, localInput, originZone, tripDate, tripTime, zoneLabel } from './time'

import type { Checkpoint, Place, Plan } from './types'

const LA:Place={label:'Los Angeles, California, US',lat:34.0522,lon:-118.2437,timezone:'America/Los_Angeles'}
const PHX:Place={label:'Phoenix, Arizona, US',lat:33.4484,lon:-112.074,timezone:'America/Phoenix'}

export default function App(){
  const [origin,setOrigin]=useState<Place|null>(LA)
  const [destination,setDestination]=useState<Place|null>(PHX)
  const [departure,setDeparture]=useState(localInput(new Date(Date.now()+3600000),'America/Los_Angeles'))
  const [load,setLoad]=useState(20000)
  const [spacing,setSpacing]=useState(25)
  const [plan,setPlan]=useState<Plan|null>(null)
  const [selectedId,setSelectedId]=useState('')
  const [checkpoint,setCheckpoint]=useState<Checkpoint|null>(null)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [allowRoad,setAllowRoad]=useState(false)
  const [retryAfter,setRetryAfter]=useState(0)
  const [method,setMethod]=useState(false)
  const [tableOpen,setTableOpen]=useState(false)
  const inputZone=useRef('America/Los_Angeles')
  if(origin?.timezone)inputZone.current=origin.timezone
  const currentInputs=useRef({origin,destination,departure,load,spacing})
  currentInputs.current={origin,destination,departure,load,spacing}
  const request=useRef<AbortController|null>(null)
  const requestSequence=useRef(0)
  const apply=(data:Plan)=>{setPlan(data);setSelectedId(data.recommended_id||data.routes[0]?.id || '');setCheckpoint(null)}
  async function example(){
    const initialInputs=currentInputs.current
    request.current?.abort();const controller=new AbortController();request.current=controller
    const sequence=++requestSequence.current
    setBusy(true);setError('')
    try{
      const data=await api<Plan>(`/api/example?load_lb=${load}&spacing_miles=${spacing}`,{signal:controller.signal})
      if(sequence!==requestSequence.current)return
      apply(data)
      const current=currentInputs.current
      if(current.origin===initialInputs.origin && current.destination===initialInputs.destination && current.departure===initialInputs.departure && current.load===initialInputs.load && current.spacing===initialInputs.spacing){
        setOrigin(LA);setDestination(PHX);setDeparture(localInput(data.departure,originZone(data.origin.timezone)))
      }
    }catch(e){if(sequence===requestSequence.current && !controller.signal.aborted && e instanceof Error && e.name!=='AbortError'){setError(e.message);if(e instanceof ApiError)setRetryAfter(e.retryAfter)}}
    finally{if(sequence===requestSequence.current)setBusy(false)}
  }
  useEffect(()=>{void example();return ()=>request.current?.abort()},[]) // Load the explicitly labeled example once.
  useEffect(()=>{
    if(!retryAfter)return
    const timer=setTimeout(()=>setRetryAfter(v=>v-1),1000)
    return ()=>clearTimeout(timer)
  },[retryAfter])
  useEffect(()=>{
    if(!method)return
    const previous=document.activeElement as HTMLElement|null
    const dialog=document.querySelector<HTMLElement>('[role="dialog"]')
    const close=dialog?.querySelector<HTMLButtonElement>('button')
    close?.focus()
    const handle=(event:KeyboardEvent)=>{
      if(event.key==='Escape')setMethod(false)
      if(event.key==='Tab'){event.preventDefault();close?.focus()}
    }
    document.addEventListener('keydown',handle)
    return ()=>{document.removeEventListener('keydown',handle);previous?.focus()}
  },[method])
  async function compare(event:React.FormEvent){
    event.preventDefault()
    if(!canCompare)return
    if(!origin||!destination){setError('Choose both cities from the search results.');return}
    request.current?.abort();const controller=new AbortController();request.current=controller
    const sequence=++requestSequence.current
    setBusy(true);setError('')
    try{
      const data=await api<Plan>('/api/plan',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({origin,destination,departure:departureISO(departure,originZone(origin.timezone)),load_lb:load,spacing_miles:spacing,allow_road_fallback:allowRoad})})
      if(sequence===requestSequence.current && !controller.signal.aborted)apply(data)
    }catch(e){if(sequence===requestSequence.current && !controller.signal.aborted && e instanceof Error && e.name!=='AbortError'){setError(e.message);if(e instanceof ApiError)setRetryAfter(e.retryAfter)}}
    finally{if(sequence===requestSequence.current)setBusy(false)}
  }
  const select=useCallback((id:string)=>{setSelectedId(id);setCheckpoint(null)},[])
  const selected=plan?.routes.find(r=>r.id===selectedId)
  const zone=inputZone.current
  const resultZone=originZone(plan?.origin.timezone)
  let parsedDeparture='', departureZone=zone
  try {parsedDeparture=departureISO(departure,zone);departureZone=zoneLabel(parsedDeparture,zone)} catch { /* Validation message appears on submit. */ }
  const changeOrigin=(place:Place|null)=>{
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
  const compareHelp=busy?'Checking roads and weather…':retryAfter>0?`Please wait ${retryAfter} seconds before trying again.`:invalidInput||
    (dirty?'Trip changed. Compare to update roads and weather.':
      plan?.mode==='live'?'Live results shown. Compare again to recheck this trip.':'Compare to fetch live roads and weather for this trip.')
  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="/" aria-label="Waywise home"><span className="brand-icon"><Navigation size={22} fill="currentColor"/></span>waywise<span className="brand-dot">.</span></a><span className="brand-divider"/><span className="product-label">WEATHER-AWARE ROUTING</span><div className="topbar-right"><span className="assessment-tag">Built for Spotter</span><button className="icon-button" aria-label="How route recommendations work" onClick={()=>setMethod(true)}><Info size={19}/></button><span className="avatar">HH</span></div></header>
    <div className="workspace">
      <aside className="sidebar">
        <div className="sidebar-title"><div><span className="eyebrow">EVERY MILE, INFORMED</span><h2>A clearer road ahead.</h2></div><span className="title-mark"><Compass size={27}/></span></div>
        <p className="intro">Plan your trip around the weather.<br/>Find the route with less risk.</p>
        <form onSubmit={compare}>
          <div className="location-fields"><PlaceSearch label="Origin" value={origin} onChange={changeOrigin}/><button type="button" className="swap-button" aria-label="Swap origin and destination" disabled={!origin||!destination} onClick={()=>{changeOrigin(destination);setDestination(origin)}}><ArrowDownUp size={14}/></button><PlaceSearch label="Destination" value={destination} onChange={setDestination}/></div>
          <label className="field-label" htmlFor="departure">Departure <span>At origin · {departureZone}</span></label><input id="departure" type="datetime-local" value={departure} min={localInput(new Date(),zone)} max={localInput(new Date(Date.now()+7*86400000),zone)} onChange={e=>setDeparture(e.target.value)} required/>
          <div className="load-heading"><label htmlFor="load">Load weight</label><Truck size={15}/></div><div className="weight-input"><input id="load" type="number" min="0" max="100000" step="1" required value={load} onChange={e=>setLoad(Number(e.target.value))}/><span>lb</span></div>
          <div className="spacing-heading"><label>Weather checkpoints</label><span>Every</span></div><div className="segmented" role="group" aria-label="Checkpoint spacing">{[10,25,50].map(n=><button key={n} type="button" aria-pressed={spacing===n} className={spacing===n?'selected':''} onClick={()=>setSpacing(n)}>{n} miles</button>)}</div>
          <label className="fallback-option"><input type="checkbox" checked={allowRoad} onChange={e=>setAllowRoad(e.target.checked)}/>Allow car-profile comparison</label><p className="fallback-help">Long trips only. Truck restrictions are not checked.</p>
          <button type="submit" className={`primary-button${showUpdateBadge?' has-updates':''}`} disabled={!canCompare} aria-busy={busy} aria-describedby="compare-help">{retryAfter>0?<>Try again in {retryAfter}s</>:busy?<><LoaderCircle size={17} className="spin"/>Comparing routes…</>:<span className="compare-button-label">Compare live routes<ArrowRight size={17}/></span>}{showUpdateBadge&&<span className="compare-update-badge" aria-hidden="true">Update needed</span>}</button>
          <p id="compare-help" className="compare-help">{compareHelp}</p>
          <button type="button" className="example-button" onClick={()=>void example()} disabled={busy}><FlaskConical size={14}/>Load example scenario</button>
        </form>
        <div className="sidebar-footnote"><ShieldCheck size={18}/><p>Weather changes. Your route can too.<br/><span>Forecasts support your judgment.</span></p></div>
      </aside>
      <main className="main-content">
        <div className="page-heading"><div><div className="breadcrumb">Route planner <span>/</span> Trip overview</div><h1>Your trip, with perspective.</h1><p>Compare the road ahead before you get behind the wheel.</p></div><button className="secondary-button" onClick={()=>setMethod(true)}><SlidersHorizontal size={15}/>How we compare</button></div>
        {error && <div className="error-banner" role="alert"><Info size={18}/><span>{error}</span><button aria-label="Dismiss error" onClick={()=>setError('')}><X size={16}/></button></div>}
        {plan && <>
          <div className="trip-strip"><div><span className="trip-points"><span/>{plan.origin.label.split(',')[0]}<ArrowRight size={15}/>{plan.destination.label.split(',')[0]}</span><span className="trip-meta">{tripDate(plan.departure,resultZone)} · {tripTime(plan.departure,resultZone)} · {plan.load_lb.toLocaleString()} lb</span></div><span className={plan.mode==='example'?'data-tag example':'data-tag live'}><span/>{plan.mode==='example'?'EXAMPLE DATA':'LIVE FORECAST'}</span></div>
          {dirty && <div className="changed-note"><Info size={14}/>Trip inputs changed. Compare routes to update these results.</div>}
          {plan.mode==='example' && <div className="example-note"><FlaskConical size={14}/>Recorded roads + simulated weather. Compare live routes for current conditions.</div>}
          {plan.warnings.filter(w=>!w.startsWith('Road routes')&&!w.startsWith('Example scenario')).map(w=><div className={`provider-notice ${w.startsWith('Car-profile')?'car-notice':''}`} key={w} role="note"><Info size={16}/><span>{w}</span></div>)}
          <section className="route-cards" aria-label="Route options">{plan.routes.map((route,i)=><RouteCard key={route.id} route={route} index={i} selected={selectedId===route.id} recommended={route.id===plan.recommended_id} onSelect={select} departure={plan.departure} zone={resultZone}/>)}</section>
          <Recommendation plan={plan} onSelect={select}/>
          <ForecastPanel plan={plan} selectedId={selectedId} onSelect={select} busy={busy} checkpoint={checkpoint} onCheckpoint={setCheckpoint}/>
          <div className="below-map"><span><Info size={14}/>The timeline shows weather and estimated vehicle progress. Route scores use each checkpoint’s arrival time.</span><button onClick={()=>setTableOpen(v=>!v)} aria-expanded={tableOpen}>Checkpoint details<ChevronDown size={15} style={{transform:tableOpen?'rotate(180deg)':undefined}}/></button></div>
          {tableOpen && selected && <CheckpointTable route={selected} onCheckpoint={setCheckpoint} zone={resultZone}/>}
          <div className="limitations"><Truck size={15}/><p>{plan.warnings.find(w=>w.startsWith('Road routes'))} {plan.warnings.filter(w=>!w.startsWith('Road routes')&&!w.startsWith('Example scenario')).join(' ')}</p></div>
          <footer><span>Made for the miles ahead.</span><span>{plan.providers.routing.split(' / ')[0]} · Open-Meteo · OpenStreetMap</span></footer>
        </>}
        {!plan && <div className="empty-state">{busy?<LoaderCircle size={32} className="spin"/>:<RouteIcon size={36}/>}<h3>{busy?'Preparing your route planner…':'Let’s find a clearer road.'}</h3><p>Choose your cities, departure, and load to compare routes.</p></div>}
        {busy && plan && <div className="working-badge" role="status"><LoaderCircle size={16} className="spin"/>Checking roads, arrival times, and weather…</div>}
      </main>
    </div>
    {method && <div className="modal-backdrop" onClick={()=>setMethod(false)}><section className="method-modal" role="dialog" aria-modal="true" aria-labelledby="method-title" onClick={e=>e.stopPropagation()}><button className="modal-close" aria-label="Close explanation" onClick={()=>setMethod(false)}><X size={20}/></button><span className="eyebrow">THE LOGIC BEHIND THE LINE</span><h2 id="method-title">A safety-first comparison.</h2><p>We sample the road every 10, 25, or 50 miles and match the forecast to your estimated arrival at each checkpoint.</p><ol><li>Exclude any route with <strong>No Travel</strong> conditions.</li><li>Prefer the fewest <strong>Severe miles</strong>.</li><li>Then the fewest <strong>High miles</strong>.</li><li>Then the lowest distance-weighted average risk.</li><li>Use travel time as the final tie-breaker.</li></ol><p>The worse of two checkpoint risks applies to the road between them. Overlapping rain and snow boundaries use the higher category.</p><div className="rules-table"><table><thead><tr><th>Risk</th><th>Wind mph</th><th>Rain in/hr</th><th>Snow in/hr</th></tr></thead><tbody>{[['Low','<25','<0.10','<0.5'],['Moderate','25–<35','0.10–<0.25','0.5–<1'],['High','35–<45','0.25–<0.50','1–<2'],['Severe','45–<55','0.50–1.00','2–3'],['No Travel','≥55','>1.00','>3']].map(row=><tr key={row[0]}>{row.map(c=><td key={c}>{c}</td>)}</tr>)}</tbody></table></div><p><strong>Load overrides:</strong> wind ≥45 mph with a load over 30,000 lb means No Travel. Wind ≥35 mph with a load over 40,000 lb is at least Severe.</p><small>Wind and temperature are interpolated at arrival. Rain, snow and gusts use the hour containing arrival without smoothing precipitation peaks. Wind rules use sustained speed; gusts are shown separately. Weather can change between checkpoints. This assessment app is planning support, not a certified truck navigation system.</small></section></div>}
  </div>
}
