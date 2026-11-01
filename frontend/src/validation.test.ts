import { expect, it } from 'vitest'
import { validPlacesResponse, validPlanResponse } from './validation'
import { planFixture } from './test-fixtures/plan'
import type { Plan } from './types'

it('accepts complete example and live plans, including negative temperatures and all-blocked trips', () => {
  const plan = planFixture()
  expect(validPlanResponse(plan)).toBe(true)
  plan.mode = 'example'
  plan.recommended_id = null
  plan.routes[0].summary.eligible = false
  plan.routes[0].summary.max_risk = 4
  plan.routes[0].checkpoints.forEach(point => {point.risk = {score: 4, level: 'No Travel', reasons: ['Wind 60 mph']}})
  expect(validPlanResponse(plan)).toBe(true)
})

const malformedPlans: [string, (plan: Plan) => void][] = [
  ['invalid origin timezone', p => {p.origin.timezone = 'Invalid/Zone'}],
  ['non-finite coordinates', p => {p.routes[0].geometry.coordinates[0][0] = Infinity}],
  ['missing road geometry', p => {p.routes[0].geometry.coordinates = []}],
  ['invalid ETA', p => {p.routes[0].checkpoints[0].eta = 'tomorrow'}],
  ['invalid weather', p => {p.routes[0].checkpoints[0].weather.wind_mph = NaN}],
  ['invalid checkpoint risk', p => {p.routes[0].checkpoints[0].risk.score = 5}],
  ['inconsistent checkpoint level', p => {p.routes[0].checkpoints[0].risk.level = 'No Travel'}],
  ['invalid summary', p => {p.routes[0].summary.average_risk = NaN}],
  ['incomplete heatmap frames', p => {p.heatmap[0].scores = [0]}],
  ['invalid heatmap score', p => {p.heatmap[0].scores[0] = 99}],
  ['missing providers', p => {p.providers = {}}],
  ['unknown recommendation', p => {p.recommended_id = 'missing'}],
  ['duplicate route IDs', p => {p.routes.push(p.routes[0])}],
  ['empty routes', p => {p.routes = []}],
]
it.each(malformedPlans)('rejects %s before rendering', (_, change) => {
  const plan = planFixture()
  change(plan)
  expect(validPlanResponse(plan)).toBe(false)
})
it.each([null, {}, [], {routes: null}])('rejects malformed top-level plans: %j', value => {
  expect(validPlanResponse(value)).toBe(false)
})
it('validates city result arrays and their coordinates and timezones', () => {
  const place = planFixture().origin
  expect(validPlacesResponse({results: [place]})).toBe(true)
  expect(validPlacesResponse({results: []})).toBe(true)
  for (const value of [null, {}, {results: null}, {results: {}}, {results: [{...place, timezone: 'Invalid/Zone'}]}, {results: [{...place, lat: 100}]}]) {
    expect(validPlacesResponse(value)).toBe(false)
  }
})
