import { expect, it } from 'vitest'
import { journeyPosition } from './journey'
import type { Route } from './types'

const route={distance_miles:100,duration_s:14400,
  geometry:{type:'LineString',coordinates:[[0,0],[1,0],[1,1]]},
  geometry_progress:[[0,0],[20,10800],[100,14400]],
} as Route

it('uses local travel times instead of constant speed and follows road bends',()=>{
  const slow=journeyPosition(route,7200)!
  expect(slow.lon).toBeCloseTo(2/3)
  expect(slow.lat).toBe(0)
  expect(slow.mile).toBeCloseTo(40/3)
  const fast=journeyPosition(route,12600)!
  expect(fast).toMatchObject({lon:1,lat:.5,mile:60,remainingMiles:40,phase:'en-route'})
})

it('starts on the road origin and stays exactly at the destination after arrival',()=>{
  expect(journeyPosition(route,0)).toEqual({lon:0,lat:0,mile:0,remainingMiles:100,phase:'departure'})
  expect(journeyPosition(route,-3600)).toEqual(journeyPosition(route,0))
  const arrived={lon:1,lat:1,mile:100,remainingMiles:0,phase:'arrived'}
  expect(journeyPosition(route,14400)).toEqual(arrived)
  expect(journeyPosition(route,48*3600)).toEqual(arrived)
})

it('holds position during a provider-supplied stationary maneuver',()=>{
  const stationary={...route,duration_s:10800,distance_miles:20,
    geometry:{type:'LineString' as const,coordinates:[[0,0],[1,0],[1,0],[2,0]] as [number,number][]},
    geometry_progress:[[0,0],[10,3600],[10,7200],[20,10800]] as [number,number][],
  }
  expect(journeyPosition(stationary,5400)).toMatchObject({lon:1,lat:0,mile:10,phase:'en-route'})
})

it('keeps a trip longer than 48 hours in transit at the end of the forecast slider',()=>{
  const long={...route,duration_s:72*3600,geometry_progress:[[0,0],[20,36*3600],[100,72*3600]] as [number,number][]}
  expect(journeyPosition(long,48*3600)?.phase).toBe('en-route')
  expect(journeyPosition(long,48*3600)?.mile).toBeCloseTo(20+80/3)
})

it('does not invent a position when timing metadata is missing or inconsistent',()=>{
  expect(journeyPosition({...route,geometry_progress:undefined},3600)).toBeNull()
  expect(journeyPosition({...route,geometry_progress:[[0,0]]},3600)).toBeNull()
  expect(journeyPosition(route,NaN)).toBeNull()
})
