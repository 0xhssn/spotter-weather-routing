import { memo, useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import { CircleMarker, MapContainer, Marker, Pane, Polyline, Popup, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import { COLORS } from './types'
import type { Checkpoint, Plan, Route } from './types'
import { riskRaster } from './heatmap'
import { thinCheckpoints } from './markers'
import { riskMiles, travelTime } from './format'
import { displayedArrival, originZone, tripDate, tripTime } from './time'
import { journeyPosition } from './journey'
import { journeyLabel } from './JourneyProgress'

const routeColors=['#2454b0','#606fa8','#007d91']
const vehicleIcon=(car:boolean)=>L.divIcon({className:'journey-marker',iconSize:[36,36],iconAnchor:[18,18],tooltipAnchor:[0,-23],html:`<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${car?'<path d="m5 8 2-4h10l2 4M5 8h14a2 2 0 0 1 2 2v7H3v-7a2 2 0 0 1 2-2ZM3 13h18M6 17v3m12-3v3"/>':'<path d="M1 3h14v12H1zM15 7h4l3 4v4h-7"/><circle cx="5.5" cy="17.5" r="2.5"/><circle cx="18.5" cy="17.5" r="2.5"/>'}</svg>`})
const truckIcon=vehicleIcon(false),carIcon=vehicleIcon(true)
const JourneyMarker=memo(function JourneyMarker({plan,selectedId,hour}:{plan:Plan;selectedId:string;hour:number}) {
  const marker=useRef<L.Marker|null>(null)
  const route=plan.routes.find(r=>r.id===selectedId),position=route?journeyPosition(route,hour*3600):null
  const label=route&&position?`Estimated ${route.routing_profile==='car'?'car':'truck'} position · ${route.name} · ${journeyLabel(position)}`:''
  useEffect(()=>{
    const element=marker.current?.getElement()
    if(element){element.title=label;element.setAttribute('aria-label',label)}
  },[label])
  if(!route||!position)return null
  return <Pane name="journey-position" style={{zIndex:475}}><Marker ref={marker} position={[position.lat,position.lon]} icon={route.routing_profile==='car'?carIcon:truckIcon} title={label} alt={label} keyboard={true}>
    <Tooltip direction="top" permanent className="journey-tooltip"><strong>Estimated position</strong><br/>{journeyLabel(position)}{!route.summary.eligible&&<><br/><span>No Travel · preview only</span></>}</Tooltip>
  </Marker></Pane>
})
const FitRoutes=memo(function FitRoutes({plan,fitKey}:{plan:Plan;fitKey:number}) {
  const map=useMap()
  useEffect(()=>{
    const points=plan.routes.flatMap(r=>r.geometry.coordinates.map(c=>L.latLng(c[1],c[0])))
    const fit=()=>{if(points.length)map.fitBounds(L.latLngBounds(points),{padding:map.getSize().x<600?[25,35]:[65,65],maxZoom:10,animate:false})}
    fit();map.on('resize',fit);return ()=>{map.off('resize',fit)}
  },[map,plan,fitKey])
  useEffect(()=>{const observer=new ResizeObserver(()=>map.invalidateSize());observer.observe(map.getContainer());return ()=>observer.disconnect()},[map])
  return null
})

function Heatmap({plan,hour,visible}:{plan:Plan;hour:number;visible:boolean}) {
  const map=useMap(),state=useRef({plan,hour,visible});state.current={plan,hour,visible}
  const drawRef=useRef<()=>void>(()=>{})
  useEffect(()=>{
    const canvas=L.DomUtil.create('canvas','weather-canvas'),field=document.createElement('canvas')
    const pane=map.getPane('weatherHeat') ?? map.createPane('weatherHeat')
    pane.style.zIndex='350';pane.style.pointerEvents='none';pane.appendChild(canvas)
    let frame=0
    function draw(){
      const started=performance.now()
      const {plan,hour,visible}=state.current,size=map.getSize(),dpr=Math.min(window.devicePixelRatio||1,2)
      canvas.width=size.x*dpr;canvas.height=size.y*dpr;canvas.style.width=`${size.x}px`;canvas.style.height=`${size.y}px`
      L.DomUtil.setPosition(canvas,map.containerPointToLayerPoint(L.point(0,0)))
      const ctx=canvas.getContext('2d')!;ctx.scale(dpr,dpr);if(!visible)return
      const center=map.getCenter(),a=map.latLngToContainerPoint(center),b=map.latLngToContainerPoint([center.lat+.42,center.lng])
      const radius=Math.max(14,Math.min(500,a.distanceTo(b)))
      const points=plan.heatmap.map(p=>{const pos=map.latLngToContainerPoint([p.lat,p.lon]);return {x:pos.x,y:pos.y,score:p.scores[hour]}})
      const raster=riskRaster(points,size.x,size.y,radius)
      field.width=raster.columns;field.height=raster.rows
      field.getContext('2d')!.putImageData(new ImageData(raster.pixels,raster.columns,raster.rows),0,0)
      ctx.drawImage(field,0,0,size.x,size.y)
      if(import.meta.env.DEV && new URLSearchParams(location.search).has('qa-profile'))console.debug(`[waywise-profile] heatmap_ms=${(performance.now()-started).toFixed(2)}`)
    }
    function schedule(){cancelAnimationFrame(frame);frame=requestAnimationFrame(draw)}
    drawRef.current=schedule;map.on('move zoom resize',schedule);schedule()
    return ()=>{cancelAnimationFrame(frame);map.off('move zoom resize',schedule);canvas.remove()}
  },[map])
  useEffect(()=>{drawRef.current()},[plan,hour,visible]);return null
}

function RouteSummary({route,plan}:{route:Route;plan:Plan}) {
  const zone=originZone(plan.origin.timezone)
  return <><strong>{route.name}{route.id===plan.recommended_id?' · Recommended':''}</strong><br/>{Math.round(route.distance_miles)} mi · {travelTime(route.duration_s)}<br/>ETA {tripDate(displayedArrival(plan.departure,route.duration_s),zone)} {tripTime(displayedArrival(plan.departure,route.duration_s),zone)}<br/>{riskMiles(route.summary.risk_miles.Severe)} severe mi · {riskMiles(route.summary.risk_miles.High)} high mi<br/>Average risk {route.summary.average_risk.toFixed(2)} / 4<br/>{route.summary.eligible?'Eligible for comparison':'No Travel — excluded'}{route.routing_profile==='car'&&<><br/><strong>Car profile — truck restrictions unchecked</strong></>}</>
}
const RoadLayers=memo(function RoadLayers({plan,selectedId,onSelect}:{plan:Plan;selectedId:string;onSelect:(id:string)=>void}) {
  const lines=useMemo(()=>plan.routes.map((route,index)=>({route,index,positions:route.geometry.coordinates.map(c=>[c[1],c[0]] as L.LatLngTuple)})),[plan])
  const selected=lines.find(l=>l.route.id===selectedId)
  return <>{lines.map(({route,index,positions})=><Polyline key={route.id} positions={positions} pathOptions={{color:routeColors[index%3],weight:3.5,opacity:.5,lineCap:'round'}} eventHandlers={{click:()=>onSelect(route.id)}}><Popup><RouteSummary route={route} plan={plan}/></Popup></Polyline>)}
    <Pane name="selected-route" style={{zIndex:425}}>{selected&&<><Polyline key={`${selectedId}-casing`} positions={selected.positions} pathOptions={{color:'white',weight:10,opacity:1}} interactive={false}/><Polyline key={selectedId} positions={selected.positions} pathOptions={{color:routeColors[selected.index%3],weight:6,opacity:1,lineCap:'round'}}><Popup><RouteSummary route={selected.route} plan={plan}/></Popup></Polyline></>}</Pane></>
})
const CheckpointLayers=memo(function CheckpointLayers({plan,selectedId,onSelect,onCheckpoint,visible}:{plan:Plan;selectedId:string;onSelect:(id:string)=>void;onCheckpoint:(c:Checkpoint)=>void;visible:boolean}) {
  const map=useMap(),[zoom,setZoom]=useState(map.getZoom());useMapEvents({zoomend:()=>setZoom(map.getZoom())})
  const zone=originZone(plan.origin.timezone)
  const checkpoints=useMemo(()=>plan.routes.flatMap(route=>thinCheckpoints(route.checkpoints,point=>map.project([point.lat,point.lon],zoom)).map(c=>({route,c}))),[plan,map,zoom])
  const selected=plan.routes.find(r=>r.id===selectedId)
  return <Pane name="checkpoint-markers" style={{zIndex:450}}>
    {visible&&checkpoints.map(({route,c})=><CircleMarker key={c.id} center={[c.lat,c.lon]} radius={route.id===selectedId?3.8:2} pathOptions={{color:'white',weight:1.1,fillColor:COLORS[c.risk.score],fillOpacity:route.id===selectedId?1:.7}} eventHandlers={{click:()=>{onSelect(route.id);onCheckpoint(c)}}}><Popup><strong>{route.name} · Mile {c.mile.toFixed(1)}</strong><br/>{c.risk.level}<br/>ETA {tripDate(c.eta,zone)} {tripTime(c.eta,zone)}<br/>Wind {c.weather.wind_mph.toFixed(1)} mph · gust {c.weather.gust_mph.toFixed(1)} mph<br/>Rain {c.weather.rain_in.toFixed(2)} in/hr · Snow {c.weather.snow_in.toFixed(2)} in/hr</Popup></CircleMarker>)}
    {[plan.origin,plan.destination].map((place,i)=>{const checkpoint=selected?.checkpoints[i?selected.checkpoints.length-1:0];return <CircleMarker key={i} center={[place.lat,place.lon]} radius={9} pathOptions={{color:checkpoint&&checkpoint.risk.score>=2?COLORS[checkpoint.risk.score]:'white',weight:3,fillColor:i?'#172f29':'#2454b0',fillOpacity:1}} eventHandlers={{click:()=>{if(checkpoint)onCheckpoint(checkpoint)}}}><Popup><strong>{i?'Destination':'Origin'}</strong><br/>{place.label}{checkpoint&&<><br/>{checkpoint.risk.level} · {tripTime(checkpoint.eta,zone)}</>}</Popup></CircleMarker>})}
  </Pane>
})
export const RouteMap=memo(function RouteMap({plan,selectedId,onSelect,hour,showHeat,showCheckpoints,fitKey,onCheckpoint}:{plan:Plan;selectedId:string;onSelect:(id:string)=>void;hour:number;showHeat:boolean;showCheckpoints:boolean;fitKey:number;onCheckpoint:(c:Checkpoint)=>void}) {
  return <MapContainer center={[33.8,-115.1]} zoom={6} zoomControl={false} className="route-map" preferCanvas><TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'/><FitRoutes plan={plan} fitKey={fitKey}/><Heatmap plan={plan} hour={Math.floor(hour)} visible={showHeat}/><RoadLayers plan={plan} selectedId={selectedId} onSelect={onSelect}/><CheckpointLayers plan={plan} selectedId={selectedId} onSelect={onSelect} onCheckpoint={onCheckpoint} visible={showCheckpoints}/><JourneyMarker plan={plan} selectedId={selectedId} hour={hour}/><MapControls/></MapContainer>
})
const MapControls=memo(function MapControls(){const map=useMap();return <div className="map-zoom" onPointerDown={e=>e.stopPropagation()}><button aria-label="Zoom in" onClick={()=>map.zoomIn()}>+</button><button aria-label="Zoom out" onClick={()=>map.zoomOut()}>−</button></div>})
