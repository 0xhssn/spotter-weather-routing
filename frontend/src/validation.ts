import { LEVELS } from './types'

type Validator = (value: unknown) => boolean
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const text: Validator = value => typeof value === 'string'
const number: Validator = value => typeof value === 'number' && Number.isFinite(value)
const range = (min: number, max = Infinity): Validator => value => number(value) && (value as number) >= min && (value as number) <= max
const nonnegative = range(0)
const score: Validator = value => range(0, 4)(value) && Number.isInteger(value)
const boolean: Validator = value => typeof value === 'boolean'
const optional = (check: Validator): Validator => value => value === undefined || check(value)
const array = (check: Validator): Validator => value => Array.isArray(value) && value.every(check)
const object = (fields: Record<string, Validator>): Validator => value => record(value) && Object.entries(fields).every(([key, check]) => check(value[key]))
const timestamp: Validator = value => typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value))
const timezone: Validator = value => {
  if (typeof value !== 'string' || !value) return false
  try { new Intl.DateTimeFormat('en-US', {timeZone: value}); return true } catch { return false }
}
const place = object({id: optional(text), label: text, lat: range(-85, 85), lon: range(-180, 180), timezone: optional(timezone)})
const coordinates: Validator = value => Array.isArray(value) && value.length === 2 && range(-180, 180)(value[0]) && range(-90, 90)(value[1])
const risk: Validator = value => object({score, level: text, reasons: array(text)})(value) && record(value) && value.level === LEVELS[value.score as number]
const weather = object({wind_mph: nonnegative, gust_mph: nonnegative, rain_in: nonnegative, snow_in: nonnegative, temperature_f: number, forecast_at: timestamp})
const checkpoint = object({id: text, lon: range(-180, 180), lat: range(-90, 90), mile: nonnegative, eta: timestamp, weather, risk})
const summary = object({
  risk_miles: object(Object.fromEntries(LEVELS.map(level => [level, nonnegative]))),
  average_risk: range(0, 4), eligible: boolean, max_risk: score,
  segments: array(object({from: text, to: text, score, miles: nonnegative})),
})
const route = object({
  id: text, name: text, via: text, distance_miles: value => nonnegative(value) && value !== 0,
  duration_s: value => nonnegative(value) && value !== 0, arrival: timestamp,
  routing_profile: optional(value => value === 'car' || value === 'truck'),
  geometry: object({type: value => value === 'LineString', coordinates: value => array(coordinates)(value) && (value as unknown[]).length >= 2}),
  checkpoints: array(checkpoint), summary,
})
const plan = object({
  mode: value => value === 'example' || value === 'live', origin: place, destination: place,
  departure: timestamp, load_lb: range(0, 100000), spacing_miles: value => [10, 25, 50].includes(value as number),
  routes: value => array(route)(value) && (value as unknown[]).length > 0,
  recommended_id: value => value === null || text(value),
  heatmap: array(object({lon: range(-180, 180), lat: range(-90, 90), scores: value => array(score)(value) && (value as unknown[]).length === 49})),
  forecast_hours: value => value === 48, forecast_locations: nonnegative, generated_at: timestamp,
  warnings: array(text), providers: object({routing: text, weather: text, geocoding: text}),
  allow_road_fallback: optional(boolean), trip_exceeds_heatmap: optional(boolean), heatmap_spacing_miles: optional(nonnegative),
})

export const validPlacesResponse = object({results: array(place)})
export const validPlanResponse: Validator = value => {
  if (!plan(value) || !record(value)) return false
  const routes = value.routes as Record<string, unknown>[]
  return new Set(routes.map(route => route.id)).size === routes.length &&
    (value.recommended_id === null || routes.some(route => route.id === value.recommended_id))
}
