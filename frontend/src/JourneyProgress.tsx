import { Car, Truck } from 'lucide-react'
import type { Route } from './types'
import type { JourneyPosition } from './journey'
import { riskMiles } from './format'

export function journeyLabel(position:JourneyPosition) {
  if(position.phase==='arrived')return `Arrived · ${riskMiles(position.mile)} mi`
  if(position.phase==='departure')return 'At departure · 0 mi'
  return `${riskMiles(position.mile)} mi traveled · ${riskMiles(position.remainingMiles)} mi remaining`
}

export function JourneyProgress({route,position}:{route:Route;position:JourneyPosition|null}) {
  const Vehicle=route.routing_profile==='car'?Car:Truck
  return <div className="journey-progress" aria-label="Estimated route progress">
    <Vehicle size={19} aria-hidden="true"/>
    <div><strong>Estimated {route.routing_profile==='car'?'car':'truck'} position · {route.name}</strong><span>{position?journeyLabel(position):'Position estimate unavailable for this route.'}</span></div>
    {!route.summary.eligible&&<small>No Travel — route excluded. Position preview only.</small>}
  </div>
}
