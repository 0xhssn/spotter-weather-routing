import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { CheckpointTable, Recommendation, RouteCard } from './TripResults'
import type { Plan, Route } from './types'
const route:Route={id:'r1',name:'Route 1',via:'Highway',distance_miles:10,duration_s:3600,arrival:'2026-11-02T14:00:00Z',geometry:{type:'LineString',coordinates:[]},checkpoints:[],summary:{risk_miles:{Low:0,Moderate:0,High:0,Severe:10,'No Travel':0},average_risk:3,eligible:true,max_risk:3,segments:[{from:'a',to:'b',score:4,miles:3},{from:'b',to:'c',score:0,miles:7}]}}
const plan={routes:[route],recommended_id:'r1'} as Plan
it('gives a single Severe route caution wording and a visible caution tone',()=>{
  render(<Recommendation plan={plan} onSelect={vi.fn()}/>)
  expect(screen.getByText('Route 1 is available')).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveClass('severe')
  expect(screen.getByRole('status')).toHaveTextContent('includes 10 Severe miles')
})
it('draws the risk strip in route order, with origin on the left',()=>{
  render(<RouteCard route={route} selected recommended onSelect={vi.fn()} departure="2026-11-02T13:00:00Z" zone="America/Phoenix"/>)
  const strip=screen.getByRole('img',{name:/origin on the left/})
  expect(strip.children[0]).toHaveStyle({background:'#913854',width:'30%'})
  expect(strip.children[1]).toHaveStyle({background:'#3a9f83',width:'70%'})
  expect(screen.getByRole('button')).toHaveAccessibleName(/Route 1, recommended/)
})

it('shows next-day dates and identifies car estimates on the route itself',()=>{
  render(<RouteCard route={{...route,routing_profile:'car',duration_s:90000}} selected recommended onSelect={vi.fn()} departure="2026-11-02T13:00:00Z" zone="America/Phoenix"/>)
  expect(screen.getByText('ETA Nov 3, 7:00 AM MST')).toBeInTheDocument()
  expect(screen.getByText('Car estimate')).toBeInTheDocument()
})
it('labels weather units in headers, keeps row numbers unit-free and selects the actual checkpoint',()=>{
  const checkpoint={id:'cp-1',mile:25,lat:34,lon:-118,eta:'2026-11-03T13:00:00Z',weather:{wind_mph:10,gust_mph:18,rain_in:.1,snow_in:0,temperature_f:50,forecast_at:'2026-11-03T13:00:00Z'},risk:{score:1,level:'Moderate',reasons:['Rain 0.10 in/hr']}}
  const choose=vi.fn()
  render(<CheckpointTable route={{...route,checkpoints:[checkpoint]}} onCheckpoint={choose} zone="America/Phoenix"/>)
  expect(screen.getByRole('columnheader',{name:'Wind / gust (mph)'})).toBeInTheDocument()
  expect(screen.getByRole('columnheader',{name:'Rain (in/hr)'})).toBeInTheDocument()
  const row=screen.getAllByRole('row')[1]
  expect(within(row).getByText('Nov 3, 6:00 AM MST')).toBeInTheDocument()
  expect(within(row).getByText('10.0 / 18.0')).toBeInTheDocument()
  expect(within(row).queryByText(/in\/hr|mph/)).not.toBeInTheDocument()
  expect(within(row).getByText('Moderate')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Show checkpoint at mile 25.0'}))
  expect(choose).toHaveBeenCalledWith(checkpoint)
})
