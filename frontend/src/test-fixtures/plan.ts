import type { Plan } from '../types'

export function planFixture(): Plan {
  const departure = new Date(Date.now() + 3600000).toISOString()
  const arrival = new Date(Date.parse(departure) + 3600000).toISOString()
  return {
    mode: 'live', origin: {label: 'Los Angeles', lat: 34.0522, lon: -118.2437, timezone: 'America/Los_Angeles'},
    destination: {label: 'Phoenix', lat: 33.4484, lon: -112.074, timezone: 'America/Phoenix'},
    departure, load_lb: 20000, spacing_miles: 25, recommended_id: 'route-1',
    routes: [{
      id: 'route-1', name: 'Route 1', via: 'Highway', routing_profile: 'truck',
      distance_miles: 50, duration_s: 3600, arrival,
      geometry: {type: 'LineString', coordinates: [[-118.2437, 34.0522], [-112.074, 33.4484]]},
      checkpoints: [0, 1].map(i => ({
        id: `cp-${i}`, lon: i ? -112.074 : -118.2437, lat: i ? 33.4484 : 34.0522, mile: i * 50, eta: i ? arrival : departure,
        weather: {wind_mph: 10, gust_mph: 15, rain_in: 0, snow_in: 0, temperature_f: -10, forecast_at: arrival},
        risk: {score: 0, level: 'Low', reasons: ['Below all risk thresholds']},
      })),
      summary: {risk_miles: {Low: 50, Moderate: 0, High: 0, Severe: 0, 'No Travel': 0}, average_risk: 0, eligible: true, max_risk: 0,
        segments: [{from: 'cp-0', to: 'cp-1', score: 0, miles: 50}]},
    }],
    heatmap: [{lon: -118.2437, lat: 34.0522, scores: Array(49).fill(0)}],
    forecast_hours: 48, forecast_locations: 2, generated_at: departure,
    warnings: [], providers: {routing: 'Valhalla', weather: 'Open-Meteo', geocoding: 'GeoNames'},
  }
}
