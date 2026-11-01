import { ArrowRight, FlaskConical, Info, SlidersHorizontal } from 'lucide-react'
import type { Plan } from './types'
import { dateTime, originZone } from './time'

export function TripSummary({plan,onMethod}:{plan:Plan;onMethod:()=>void}) {
  const car=plan.routes.some(route=>route.routing_profile==='car')
  return <section className="trip-summary" aria-label="Trip summary">
    <div className="trip-summary-main"><div><h1 className="trip-points">{plan.origin.label.split(',')[0]}<ArrowRight size={17} aria-hidden="true"/>{plan.destination.label.split(',')[0]}</h1><p className="trip-meta">{dateTime(plan.departure,originZone(plan.origin.timezone))} · {plan.load_lb.toLocaleString()} lb · Checkpoints every {plan.spacing_miles} mi</p></div><span className={`data-tag ${plan.mode==='example'?'example':car?'car':'live'}`}><span/>{plan.mode==='example'?'EXAMPLE DATA':car?'CAR ESTIMATE':'LIVE FORECAST'}</span><button className="secondary-button" onClick={onMethod}><SlidersHorizontal size={15}/>How we compare</button></div>
    {plan.mode==='example'&&<p className="example-note"><FlaskConical size={14}/>Recorded roads + simulated weather. Compare live routes for current conditions.</p>}
  </section>
}
export type TripNote={id:string;tone:'error'|'warning'|'info';text:string;action?:()=>void;actionLabel?:string}
export function StatusSlot({notes}:{notes:TripNote[]}) {
  if(!notes.length)return null
  const [first,...rest]=notes
  return <section className={`status-slot ${first.tone}`} aria-label="Trip status">
    <div className="status-primary" role={first.tone==='error'?'alert':'status'}><Info size={18} aria-hidden="true"/><p>{first.text} {first.action&&<button className="text-button" onClick={first.action}>{first.actionLabel}</button>}</p></div>
    {rest.length>0&&<details key={notes.map(note=>note.id).join('-')}><summary>{rest.length} more {rest.length===1?'note':'notes'}</summary><ul>{rest.map(note=><li key={note.id}>{note.text}</li>)}</ul></details>}
  </section>
}
export function Assumptions({plan}:{plan:Plan}) {
  const car=plan.routes.some(route=>route.routing_profile==='car')
  return <section className="assumptions-card" aria-labelledby="assumptions-title"><h2 id="assumptions-title">Assumptions and sources</h2>
    <p>{car?'Car travel times are estimates. Verify the trip with truck navigation before driving.':'Truck routes assume a standard semi: 13 ft 6 in high, 8 ft 6 in wide, 71 ft long, and 30,000 lb empty weight plus cargo. Verify vehicle dimensions, restrictions and closures.'} ETAs exclude traffic and driver rest stops.</p>
    <p>Routing: {plan.providers.routing}. Weather: Open-Meteo{plan.mode==='example'?' (simulated in this example)':''}. Map: <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>.</p>
  </section>
}
