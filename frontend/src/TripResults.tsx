import { memo } from 'react'
import { Check, Info, ShieldCheck } from 'lucide-react'
import type { Checkpoint, Plan, Route } from './types'
import { COLORS, LEVELS } from './types'
import { riskMiles, travelTime } from './format'
import { dateTime, displayedArrival } from './time'

export const RouteCard=memo(function RouteCard({route,selected,recommended,onSelect,departure,zone}:{route:Route;selected:boolean;recommended:boolean;onSelect:(id:string)=>void;departure:string;zone:string}) {
  return <button className={`route-card ${selected?'selected':''}${recommended?' is-recommended':''}`} onClick={()=>onSelect(route.id)} aria-pressed={selected} aria-label={`${route.name}, ${recommended?'recommended, ':''}${travelTime(route.duration_s)}, ${Math.round(route.distance_miles)} miles, ${LEVELS[route.summary.max_risk]} conditions, ${route.summary.eligible?'eligible':'No Travel'}`}>
    <div className="route-card-top"><strong>{route.name}</strong>{recommended?<span className={`recommended-tag ${route.summary.max_risk>=3?'severe':route.summary.max_risk>=2?'caution':''}`}><Check size={11}/><span className="recommend-label">Recommended</span><span className="recommend-short">Best</span></span>:<span className="route-unselected">{route.summary.eligible?'Alternative':'No Travel'}</span>}</div>
    {route.routing_profile==='car'&&<span className="car-estimate-tag">Car estimate</span>}
    <div className="route-main-stat">{travelTime(route.duration_s)}<span>{Math.round(route.distance_miles)} mi</span></div><p className="via" title={route.via}>{route.via}</p>
    <div className="risk-bar" role="img" aria-label="Risk along the route, from origin on the left to destination on the right">{route.summary.segments.map((segment,i)=><span key={i} style={{width:`${segment.miles/route.distance_miles*100}%`,background:COLORS[segment.score]}}/>)}</div>
    <div className="route-average">Average risk <strong>{route.summary.average_risk.toFixed(2)} / 4</strong></div>
    <div className="route-bottom"><span>{route.summary.eligible?`${riskMiles(route.summary.risk_miles.Severe)} severe · ${riskMiles(route.summary.risk_miles.High)} high mi`:'Contains No Travel'}</span><span>ETA {dateTime(displayedArrival(departure,route.duration_s),zone)}</span></div>
  </button>
})

export const Recommendation=memo(function Recommendation({plan,onSelect}:{plan:Plan;onSelect:(id:string)=>void}) {
  const route=plan.routes.find(r=>r.id===plan.recommended_id)
  const only=plan.routes.length===1
  const worst=route?.summary.max_risk ?? 4
  const tone=!route?'blocked':worst>=3?'severe':worst>=2?'caution':'low'
  const title=!route?'No route recommended — No Travel conditions':only?`${route.name} is available`:`${route.name} is your lower-risk option`
  return <div className={`recommendation ${tone}`} role="status"><span className="recommendation-icon">{worst>=2?<Info size={21}/>:<ShieldCheck size={21}/>}</span><div><strong>{title}</strong><p>{route?<>{worst>=3?`Use caution: includes ${riskMiles(route.summary.risk_miles.Severe)} Severe miles. `:worst>=2?'Use caution: includes High conditions. ':''}{riskMiles(route.summary.risk_miles.Severe)} severe miles, then {riskMiles(route.summary.risk_miles.High)} high-risk miles. Average risk {route.summary.average_risk.toFixed(2)} / 4; travel time {travelTime(route.duration_s)}. Compared in that order.</>:'Every route contains a No Travel checkpoint. Try a different departure time.'}</p></div>{route&&<button onClick={()=>onSelect(route.id)} aria-label="Show recommended route on map">Show on map</button>}</div>
})

export const CheckpointTable=memo(function CheckpointTable({route,onCheckpoint,zone}:{route:Route;onCheckpoint:(c:Checkpoint)=>void;zone:string}) {
  return <div className="checkpoint-table" role="region" aria-label={`${route.name} checkpoint weather`} tabIndex={0}><table><caption className="sr-only">{route.name} arrival-aware checkpoint weather. All times at the origin.</caption><colgroup><col className="col-mile"/><col className="col-arrival"/><col className="col-wind"/><col className="col-rain"/><col className="col-snow"/><col className="col-risk"/></colgroup><thead><tr><th scope="col">Mile</th><th scope="col">Arrival</th><th scope="col">Wind / gust (mph)</th><th scope="col">Rain (in/hr)</th><th scope="col">Snow (in/hr)</th><th scope="col">Risk</th></tr></thead><tbody>{route.checkpoints.map(c=><tr key={c.id}><td><button className="checkpoint-link" aria-label={`Show checkpoint at mile ${c.mile.toFixed(1)}`} onClick={()=>onCheckpoint(c)}>{c.mile.toFixed(1)}</button></td><td>{dateTime(c.eta,zone)}</td><td>{c.weather.wind_mph.toFixed(1)} / {c.weather.gust_mph.toFixed(1)}</td><td>{c.weather.rain_in.toFixed(2)}</td><td>{c.weather.snow_in.toFixed(2)}</td><td><span className="risk-text risk-label" data-risk-score={c.risk.score}><i style={{background:COLORS[c.risk.score]}}/>{c.risk.level}</span></td></tr>)}</tbody></table></div>
})
