import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import { COLORS } from './types'
import type { Checkpoint, Plan } from './types'
import { riskRaster } from './heatmap'
import { riskMiles, travelTime } from './format'

const routeColors = ['#237a65','#6685a0','#9e83aa']
function FitRoutes({plan,fitKey}:{plan:Plan;fitKey:number}) {
  const map = useMap()
  useEffect(()=>{
    const points=plan.routes.flatMap(r=>r.geometry.coordinates.map(c=>L.latLng(c[1],c[0])))
    const fit=()=>{if(points.length)map.fitBounds(L.latLngBounds(points),{padding:map.getSize().x<600?[25,35]:[65,65],maxZoom:10,animate:false})}
    fit();map.on('resize',fit)
    return ()=>{map.off('resize',fit)}
  },[map,plan,fitKey])
  useEffect(()=>{
    const observer = new ResizeObserver(()=>map.invalidateSize())
    observer.observe(map.getContainer())
    return ()=>observer.disconnect()
  },[map])
  return null
}

function Heatmap({plan,hour,visible}:{plan:Plan;hour:number;visible:boolean}) {
  const map = useMap()
  const state = useRef({plan,hour,visible})
  state.current={plan,hour,visible}
  const drawRef=useRef<()=>void>(()=>{})
  useEffect(()=>{
    const canvas = L.DomUtil.create('canvas','weather-canvas')
    const pane=map.getPane('weatherHeat') ?? map.createPane('weatherHeat')
    pane.style.zIndex='350';pane.style.pointerEvents='none'
    pane.appendChild(canvas)
    let frame=0
    function draw(){
      const {plan,hour,visible}=state.current
      const size=map.getSize(),dpr=Math.min(window.devicePixelRatio||1,2)
      canvas.width=size.x*dpr;canvas.height=size.y*dpr
      canvas.style.width=`${size.x}px`;canvas.style.height=`${size.y}px`
      L.DomUtil.setPosition(canvas,map.containerPointToLayerPoint(L.point(0,0)))
      const ctx=canvas.getContext('2d')!
      ctx.scale(dpr,dpr)
      if(!visible)return
      const center=map.getCenter()
      const a=map.latLngToContainerPoint(center)
      const b=map.latLngToContainerPoint([center.lat+0.42,center.lng])
      const radius=Math.max(14,Math.min(500,a.distanceTo(b)))
      const points=plan.heatmap.map(p=>{
        const pos=map.latLngToContainerPoint([p.lat,p.lon])
        return {x:pos.x,y:pos.y,score:p.scores[hour]}
      })
      const raster=riskRaster(points,size.x,size.y,radius)
      const field=document.createElement('canvas')
      field.width=raster.columns;field.height=raster.rows
      field.getContext('2d')!.putImageData(new ImageData(raster.pixels,raster.columns,raster.rows),0,0)
      ctx.drawImage(field,0,0,size.x,size.y)
    }
    function schedule(){cancelAnimationFrame(frame);frame=requestAnimationFrame(draw)}
    drawRef.current=schedule
    map.on('move zoom resize',schedule);schedule()
    return ()=>{cancelAnimationFrame(frame);map.off('move zoom resize',schedule);canvas.remove()}
  },[map])
  useEffect(()=>{drawRef.current()},[plan,hour,visible])
  return null
}

export function RouteMap({plan,selectedId,onSelect,hour,showHeat,showCheckpoints,fitKey,onCheckpoint}:{plan:Plan;selectedId:string;onSelect:(id:string)=>void;hour:number;showHeat:boolean;showCheckpoints:boolean;fitKey:number;onCheckpoint:(c:Checkpoint)=>void}) {
  const ordered=[...plan.routes].sort((a,b)=>Number(a.id===selectedId)-Number(b.id===selectedId))
  return <MapContainer center={[33.8,-115.1]} zoom={6} zoomControl={false} className="route-map" preferCanvas>
    <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'/>
    <FitRoutes plan={plan} fitKey={fitKey}/>
    <Heatmap plan={plan} hour={hour} visible={showHeat}/>
    {ordered.map(route=>{
      const selected=route.id===selectedId
      const index=plan.routes.indexOf(route)
      return <Polyline key={route.id} positions={route.geometry.coordinates.map(c=>[c[1],c[0]])} pathOptions={{color:routeColors[index],weight:selected?6:4,opacity:selected?1:.65,lineCap:'round'}} eventHandlers={{click:()=>onSelect(route.id)}}>
        <Popup><strong>{route.name}{route.id===plan.recommended_id?' · Recommended':''}</strong><br/>{Math.round(route.distance_miles)} mi · {travelTime(route.duration_s)}<br/>ETA {new Date(route.arrival).toLocaleString()}<br/>{riskMiles(route.summary.risk_miles.Severe)} severe mi · {riskMiles(route.summary.risk_miles.High)} high mi<br/>Average risk {route.summary.average_risk.toFixed(2)} / 4<br/>{route.summary.eligible?'Eligible for comparison':'No Travel — excluded'}</Popup>
      </Polyline>
    })}
    {showCheckpoints && ordered.map(route=>route.checkpoints.map(c=><CircleMarker key={c.id} center={[c.lat,c.lon]} radius={route.id===selectedId?5.5:3} pathOptions={{color:'white',weight:1.8,fillColor:COLORS[c.risk.score],fillOpacity:route.id===selectedId?1:.55}} eventHandlers={{click:()=>{onSelect(route.id);onCheckpoint(c)}}}>
      <Popup><strong>{route.name} · Mile {Math.round(c.mile)}</strong><br/>{c.risk.level}<br/>ETA {new Date(c.eta).toLocaleString()}<br/>Wind {c.weather.wind_mph.toFixed(1)} mph · Rain {c.weather.rain_in.toFixed(2)} in/hr<br/>Snow {c.weather.snow_in.toFixed(2)} in/hr</Popup>
    </CircleMarker>))}
    {[plan.origin,plan.destination].map((p,i)=><CircleMarker key={i} center={[p.lat,p.lon]} radius={10} pathOptions={{color:'#fff',weight:3,fillColor:i?'#172f29':'#237a65',fillOpacity:1}}><Popup><strong>{i?'Destination':'Origin'}</strong><br/>{p.label}</Popup></CircleMarker>)}
    <MapControls/>
  </MapContainer>
}

function MapControls(){
  const map=useMap()
  return <div className="map-zoom" onPointerDown={e=>e.stopPropagation()}><button aria-label="Zoom in" onClick={()=>map.zoomIn()}>+</button><button aria-label="Zoom out" onClick={()=>map.zoomOut()}>−</button></div>
}
