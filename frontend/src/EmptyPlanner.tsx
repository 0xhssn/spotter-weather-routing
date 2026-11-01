import { LoaderCircle, MapPin } from 'lucide-react'
import { MapContainer, TileLayer } from 'react-leaflet'

export function EmptyPlanner({busy}: {busy: boolean}) {
  return <section className="empty-planner" aria-label="Start a trip">
    <div className="empty-planner-map" aria-label="Route planning map">
      <MapContainer center={[38.5, -98]} zoom={4} scrollWheelZoom={false} zoomControl={false} className="route-map">
        <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'/>
      </MapContainer>
    </div>
    <div className="empty-planner-prompt" role={busy ? 'status' : undefined}>
      {busy ? <LoaderCircle size={24} className="spin" aria-hidden="true"/> : <MapPin size={24} aria-hidden="true"/>}
      <h1>{busy ? 'Checking the road ahead…' : 'Where are you headed?'}</h1>
      <p>{busy ? 'Preparing your routes and weather.' : 'Choose your cities, then compare routes and weather.'}</p>
    </div>
  </section>
}
