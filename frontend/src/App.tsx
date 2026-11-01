import { useEffect, useRef, useState } from 'react'
import { ArrowDownUp, ArrowRight, ArrowUpRight, Check, ChevronDown, CloudRain, Compass, FlaskConical, Focus, Info, Layers, LoaderCircle, MapPinned, Navigation, Pause, Play, Route as RouteIcon, ShieldCheck, SlidersHorizontal, Snowflake, Truck, Wind, X } from 'lucide-react'
import { api } from './api'
import { PlaceSearch } from './PlaceSearch'
import { RouteMap } from './RouteMap'
import { riskMiles } from './format'
import { COLORS, LEVELS } from './types'
import type { Checkpoint, Place, Plan, Route } from './types'

const LA:Place={label:'Los Angeles, California, US',lat:34.0522,lon:-118.2437}
const PHX:Place={label:'Phoenix, Arizona, US',lat:33.4484,lon:-112.074}
const localDate=(d:Date)=>new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)
const duration=(s:number)=>{const minutes=Math.round(s/60);return `${Math.floor(minutes/60)}h ${minutes%60}m`}
const time=(s:string)=>new Date(s).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})
const miles=(n:number)=>Math.round(n).toLocaleString()

export default function App(){
  const [origin,setOrigin]=useState<Place|null>(LA)
  const [destination,setDestination]=useState<Place|null>(PHX)
  const [departure,setDeparture]=useState(localDate(new Date(Date.now()+3600000)))
  const [load,setLoad]=useState(20000)
  const [spacing,setSpacing]=useState(25)
  const [plan,setPlan]=useState<Plan|null>(null)
  const [selectedId,setSelectedId]=useState('')
  const [checkpoint,setCheckpoint]=useState<Checkpoint|null>(null)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [hour,setHour]=useState(0)
  const [playing,setPlaying]=useState(false)
  const [showHeat,setShowHeat]=useState(true)
  const [showCheckpoints,setShowCheckpoints]=useState(true)
  const [fitKey,setFitKey]=useState(0)
  const [method,setMethod]=useState(false)
  const [tableOpen,setTableOpen]=useState(false)
  const request=useRef<AbortController|null>(null)
  const requestSequence=useRef(0)
  const apply=(data:Plan)=>{setPlan(data);setSelectedId(data.recommended_id||data.routes[0].id);setCheckpoint(null);setHour(0);setPlaying(false)}
  async function example(){
    request.current?.abort();const controller=new AbortController();request.current=controller
    const sequence=++requestSequence.current
    setBusy(true);setError('')
    try{
      const data=await api<Plan>(`/api/example?load_lb=${load}&spacing_miles=${spacing}`,{signal:controller.signal})
      if(sequence!==requestSequence.current)return
      apply(data);setOrigin(LA);setDestination(PHX);setDeparture(localDate(new Date(data.departure)))
    }catch(e){if(sequence===requestSequence.current && !controller.signal.aborted && e instanceof Error && e.name!=='AbortError')setError(e.message)}
    finally{if(sequence===requestSequence.current)setBusy(false)}
  }
  useEffect(()=>{void example();return ()=>request.current?.abort()},[]) // Load the explicitly labeled example once.
  useEffect(()=>{
    if(!playing)return
    const timer=setInterval(()=>setHour(h=>{if(h>=48){setPlaying(false);return 48}return h+1}),500)
    return ()=>clearInterval(timer)
  },[playing])
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
    if(!origin||!destination){setError('Choose both cities from the search results.');return}
    request.current?.abort();const controller=new AbortController();request.current=controller
    const sequence=++requestSequence.current
    setBusy(true);setError('');setPlaying(false)
    try{
      const data=await api<Plan>('/api/plan',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({origin,destination,departure:new Date(departure).toISOString(),load_lb:load,spacing_miles:spacing})})
      if(sequence===requestSequence.current && !controller.signal.aborted)apply(data)
    }catch(e){if(sequence===requestSequence.current && !controller.signal.aborted && e instanceof Error && e.name!=='AbortError')setError(e.message)}
    finally{if(sequence===requestSequence.current)setBusy(false)}
  }
  const select=(id:string)=>{setSelectedId(id);setCheckpoint(null)}
  const selected=plan?.routes.find(r=>r.id===selectedId)
  const recommended=plan?.routes.find(r=>r.id===plan.recommended_id)
  const forecastTime=plan?new Date(new Date(plan.departure).getTime()+hour*3600000):null
  const dirty=!!plan&&(origin?.lat!==plan.origin.lat||origin?.lon!==plan.origin.lon||destination?.lat!==plan.destination.lat||destination?.lon!==plan.destination.lon||load!==plan.load_lb||spacing!==plan.spacing_miles||(!departure||Math.abs(new Date(departure).getTime()-new Date(plan.departure).getTime())>=60000))
  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="/" aria-label="Waywise home"><span className="brand-icon"><Navigation size={22} fill="currentColor"/></span>waywise<span className="brand-dot">.</span></a><span className="brand-divider"/><span className="product-label">WEATHER-AWARE ROUTING</span><div className="topbar-right"><span className="assessment-tag">Built for Spotter</span><button className="icon-button" aria-label="How route recommendations work" onClick={()=>setMethod(true)}><Info size={19}/></button><span className="avatar">HH</span></div></header>
    <div className="workspace">
      <aside className="sidebar">
        <div className="sidebar-title"><div><span className="eyebrow">EVERY MILE, INFORMED</span><h1>A clearer road ahead.</h1></div><span className="title-mark"><Compass size={27}/></span></div>
        <p className="intro">Plan your trip around the weather.<br/>Find the route with less risk.</p>
        <form onSubmit={compare}>
          <div className="location-fields"><PlaceSearch label="Origin" value={origin} onChange={setOrigin}/><button type="button" className="swap-button" aria-label="Swap origin and destination" disabled={!origin||!destination} onClick={()=>{setOrigin(destination);setDestination(origin)}}><ArrowDownUp size={14}/></button><PlaceSearch label="Destination" value={destination} onChange={setDestination}/></div>
          <label className="field-label" htmlFor="departure">Departure <span>Your local time</span></label><input id="departure" type="datetime-local" value={departure} min={localDate(new Date())} max={localDate(new Date(Date.now()+7*86400000))} onChange={e=>setDeparture(e.target.value)} required/>
          <div className="load-heading"><label htmlFor="load">Load weight</label><Truck size={15}/></div><div className="weight-input"><input id="load" type="number" min="0" max="100000" step="1" required value={load} onChange={e=>setLoad(Number(e.target.value))}/><span>lb</span></div>
          <div className="spacing-heading"><label>Weather checkpoints</label><span>Every</span></div><div className="segmented" role="group" aria-label="Checkpoint spacing">{[10,25,50].map(n=><button key={n} type="button" aria-pressed={spacing===n} className={spacing===n?'selected':''} onClick={()=>setSpacing(n)}>{n} miles</button>)}</div>
          <button type="submit" className="primary-button" disabled={busy}>{busy?<><LoaderCircle size={17} className="spin"/>Comparing routes…</>:<>Compare live routes<ArrowRight size={17}/></>}</button>
          <button type="button" className="example-button" onClick={()=>void example()} disabled={busy}><FlaskConical size={14}/>Load example scenario</button>
        </form>
        <div className="sidebar-footnote"><ShieldCheck size={18}/><p>Weather changes. Your route can too.<br/><span>Forecasts support your judgment.</span></p></div>
      </aside>
      <main className="main-content">
        <div className="page-heading"><div><div className="breadcrumb">Route planner <span>/</span> Trip overview</div><h2>Your trip, with perspective.</h2><p>Compare the road ahead before you get behind the wheel.</p></div><button className="secondary-button" onClick={()=>setMethod(true)}><SlidersHorizontal size={15}/>How we compare</button></div>
        {error && <div className="error-banner" role="alert"><Info size={18}/><span>{error}</span><button aria-label="Dismiss error" onClick={()=>setError('')}><X size={16}/></button></div>}
        {plan && <>
          <div className="trip-strip"><div><span className="trip-points"><span/>{plan.origin.label.split(',')[0]}<ArrowRight size={15}/>{plan.destination.label.split(',')[0]}</span><span className="trip-meta">{new Date(plan.departure).toLocaleDateString([],{month:'short',day:'numeric'})} · {time(plan.departure)} · {plan.load_lb.toLocaleString()} lb</span></div><span className={plan.mode==='example'?'data-tag example':'data-tag live'}><span/>{plan.mode==='example'?'EXAMPLE DATA':'LIVE FORECAST'}</span></div>
          {dirty && <div className="changed-note"><Info size={14}/>Trip inputs changed. Compare routes to update these results.</div>}
          {plan.mode==='example' && <div className="example-note"><FlaskConical size={14}/>Recorded roads + simulated weather. Compare live routes for current conditions.</div>}
          <section className="route-cards" aria-label="Route options">{plan.routes.map((route,i)=><RouteCard key={route.id} route={route} index={i} selected={selectedId===route.id} recommended={route.id===plan.recommended_id} onClick={()=>select(route.id)}/>)}</section>
          <div className={`recommendation ${recommended?'':'blocked'}`}><span className="recommendation-icon">{recommended?<ShieldCheck size={21}/>:<Info size={21}/>}</span><div><strong>{recommended?`${recommended.name} is your lower-risk option`:'No route recommended — No Travel conditions'}</strong><p>{recommended?`${riskMiles(recommended.summary.risk_miles.Severe)} severe miles, then ${riskMiles(recommended.summary.risk_miles.High)} high-risk miles. Average risk ${recommended.summary.average_risk.toFixed(2)} / 4; travel time ${duration(recommended.duration_s)}. Compared in that order.`:'Every route contains a No Travel checkpoint. Try a different departure time.'}</p></div>{recommended&&<button onClick={()=>select(recommended.id)} aria-label="Select recommended route"><ArrowUpRight size={20}/></button>}</div>
          <section className="map-section" aria-label="Route map and forecast">
            <div className="map-toolbar"><div><MapPinned size={17}/><strong>Weather along your route</strong><span className="map-status">{selected?.name}</span></div><button className="icon-button" aria-label="Fit all routes to map" onClick={()=>setFitKey(k=>k+1)}><Focus size={18}/></button></div>
            <div className="map-wrap"><RouteMap plan={plan} selectedId={selectedId} onSelect={select} hour={hour} showHeat={showHeat} showCheckpoints={showCheckpoints} fitKey={fitKey} onCheckpoint={setCheckpoint}/><div className="layer-controls"><Layers size={15}/><label><input type="checkbox" checked={showHeat} onChange={e=>setShowHeat(e.target.checked)}/>Weather heatmap</label><label><input type="checkbox" checked={showCheckpoints} onChange={e=>setShowCheckpoints(e.target.checked)}/>Checkpoints</label></div><div className="map-legend">{LEVELS.map((l,i)=><span key={l}><i style={{background:COLORS[i]}}/>{l}</span>)}</div>{checkpoint && <div className="checkpoint-card"><div><span className="eyebrow">CHECKPOINT · MILE {Math.round(checkpoint.mile)}</span><button aria-label="Close checkpoint details" onClick={()=>setCheckpoint(null)}><X size={16}/></button></div><h3 style={{color:COLORS[checkpoint.risk.score]}}>{checkpoint.risk.level}</h3><p>Arrival {time(checkpoint.eta)} · {new Date(checkpoint.eta).toLocaleDateString([],{month:'short',day:'numeric'})}</p><div className="weather-values"><span><Wind size={14}/>{checkpoint.weather.wind_mph.toFixed(1)} mph</span><span><CloudRain size={14}/>{checkpoint.weather.rain_in.toFixed(2)} in/hr</span><span><Snowflake size={14}/>{checkpoint.weather.snow_in.toFixed(2)} in/hr</span></div><small>{checkpoint.risk.reasons.join(' · ')}</small></div>}</div>
            <div className="forecast-bar"><button className="play-button" aria-label={playing?'Pause forecast animation':'Play forecast animation'} onClick={()=>{if(hour===48)setHour(0);setPlaying(v=>!v)}}>{playing?<Pause size={15} fill="currentColor"/>:<Play size={15} fill="currentColor"/>}</button><div className="forecast-label"><strong>Forecast timeline</strong><span>{forecastTime?.toLocaleDateString([],{weekday:'short',month:'short',day:'numeric'})} · {forecastTime?.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</span></div><div className="slider-wrap"><label className="sr-only" htmlFor="forecast">Forecast hours after departure</label><input id="forecast" type="range" min="0" max="48" step="1" value={hour} onChange={e=>{setPlaying(false);setHour(Number(e.target.value))}}/><div className="slider-labels"><span>Departure</span><span>+12h</span><span>+24h</span><span>+36h</span><span>+48h</span></div></div><span className="forecast-offset">+{hour}h</span></div>
          </section>
          <div className="below-map"><span><Info size={14}/>The timeline changes the corridor forecast. Route scores use each checkpoint’s arrival time.</span><button onClick={()=>setTableOpen(v=>!v)} aria-expanded={tableOpen}>Checkpoint details<ChevronDown size={15} style={{transform:tableOpen?'rotate(180deg)':undefined}}/></button></div>
          {tableOpen && selected && <div className="checkpoint-table"><table><caption>{selected.name} · {selected.checkpoints.length} arrival-aware checkpoints · times in your local timezone</caption><thead><tr><th>Mile</th><th>Arrival</th><th>Wind / gust</th><th>Rain</th><th>Snow</th><th>Risk</th></tr></thead><tbody>{selected.checkpoints.map(c=><tr key={c.id}><td><button className="checkpoint-link" aria-label={`Show checkpoint at mile ${c.mile.toFixed(1)}`} onClick={()=>setCheckpoint(c)}>{c.mile.toFixed(1)}</button></td><td>{new Date(c.eta).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</td><td>{c.weather.wind_mph.toFixed(1)} / {c.weather.gust_mph.toFixed(1)} mph</td><td>{c.weather.rain_in.toFixed(2)} in/hr</td><td>{c.weather.snow_in.toFixed(2)} in/hr</td><td><span className="risk-text" style={{color:COLORS[c.risk.score]}}>{c.risk.level}</span></td></tr>)}</tbody></table></div>}
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

function RouteCard({route,index,selected,recommended,onClick}:{route:Route;index:number;selected:boolean;recommended:boolean;onClick:()=>void}){
  return <button className={`route-card ${selected?'selected':''}`} onClick={onClick} aria-pressed={selected}>
    <div className="route-card-top"><span className={`route-number route-${index}`}>{String(index+1).padStart(2,'0')}</span><strong>{route.name}</strong>{recommended?<span className="recommended-tag"><Check size={11}/>Recommended</span>:<span className="route-unselected">{route.summary.eligible?'Alternative':'No Travel'}</span>}</div>
    <div className="route-main-stat">{duration(route.duration_s)}<span>{miles(route.distance_miles)} mi</span></div><p className="via" title={route.via}>{route.via}</p>
    <div className="risk-bar">{LEVELS.map((level,i)=><span key={level} style={{width:`${route.summary.risk_miles[level]/route.distance_miles*100}%`,background:COLORS[i]}}/>)}</div>
    <div className="route-average">Average risk <strong>{route.summary.average_risk.toFixed(2)} / 4</strong></div>
    <div className="route-bottom"><span><i style={{background:COLORS[route.summary.max_risk]}}/>{route.summary.eligible?`${riskMiles(route.summary.risk_miles.Severe)} severe · ${riskMiles(route.summary.risk_miles.High)} high mi`:'Contains No Travel'}</span><span>ETA {time(route.arrival)}</span></div>
  </button>
}
