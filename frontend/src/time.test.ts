import { expect, it } from 'vitest'
import { departureISO, displayedArrival, localInput, tripDate, tripTime } from './time'
import { travelTime } from './format'

it('interprets 5pm at the LA origin independently of the browser timezone',()=>{
  expect(departureISO('2026-10-31T17:00','America/Los_Angeles')).toBe('2026-11-01T00:00:00Z')
  expect(localInput('2026-11-01T00:00:00Z','America/Los_Angeles')).toBe('2026-10-31T17:00')
})
it('shows the timezone change when a trip crosses the November DST transition',()=>{
  const departure=departureISO('2026-11-01T00:30','America/Los_Angeles')
  expect(tripTime(departure,'America/Los_Angeles')).toContain('PDT')
  const arrival=displayedArrival(departure,3*3600)
  expect(tripTime(arrival,'America/Los_Angeles')).toBe('2:30 AM PST')
})
it('rejects repeated and skipped local times instead of silently choosing an offset',()=>{
  expect(()=>departureISO('2026-11-01T01:30','America/Los_Angeles')).toThrow(/daylight saving/)
  expect(()=>departureISO('2026-03-08T02:30','America/Los_Angeles')).toThrow(/daylight saving/)
})
it('keeps duration and ETA minute rounding consistent',()=>{
  const departure='2026-11-02T14:00:00Z'
  for(const seconds of [6888.7,7477.7,8816.7]){
    const arrival=displayedArrival(departure,seconds)
    expect((new Date(arrival).getTime()-new Date(departure).getTime())/60000).toBe(Math.round(seconds/60))
  }
  expect(travelTime(6888.7)).toBe('1h 55m')
  expect(tripTime(displayedArrival(departure,6888.7),'America/Phoenix')).toBe('8:55 AM MST')
})
it('rounds calendar dates with the same rule at midnight',()=>{
  expect(tripDate('2026-11-02T06:59:45Z','America/Phoenix')).toBe('Nov 2')
  expect(tripTime('2026-11-02T06:59:45Z','America/Phoenix')).toBe('12:00 AM MST')
})
