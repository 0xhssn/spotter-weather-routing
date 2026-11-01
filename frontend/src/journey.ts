import type { Route } from './types'

export type JourneyPosition = {
  lon:number;lat:number;mile:number;remainingMiles:number
  phase:'departure'|'en-route'|'arrived'
}

/** Interpolate only adjacent road vertices, using provider travel time. */
export function journeyPosition(route:Route, elapsedSeconds:number):JourneyPosition|null {
  const coordinates=route.geometry.coordinates,progress=route.geometry_progress
  if(!Number.isFinite(elapsedSeconds)||!progress||coordinates.length<2||progress.length!==coordinates.length)return null
  const seconds=Math.max(0,Math.min(route.duration_s,elapsedSeconds))
  if(seconds>=route.duration_s){
    const [lon,lat]=coordinates[coordinates.length-1]
    return {lon,lat,mile:route.distance_miles,remainingMiles:0,phase:'arrived'}
  }
  let low=0,high=progress.length-1
  while(low<high){
    const middle=Math.floor((low+high)/2)
    if(progress[middle][1]<seconds)low=middle+1
    else high=middle
  }
  const end=low,start=Math.max(0,end-1),duration=progress[end][1]-progress[start][1]
  const fraction=duration>0?Math.max(0,Math.min(1,(seconds-progress[start][1])/duration)):0
  const mile=progress[start][0]+fraction*(progress[end][0]-progress[start][0])
  return {
    lon:coordinates[start][0]+fraction*(coordinates[end][0]-coordinates[start][0]),
    lat:coordinates[start][1]+fraction*(coordinates[end][1]-coordinates[start][1]),
    mile,remainingMiles:Math.max(0,route.distance_miles-mile),
    phase:elapsedSeconds>=route.duration_s?'arrived':seconds===0?'departure':'en-route',
  }
}
