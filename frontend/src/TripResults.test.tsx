import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { Recommendation, RouteCard } from './TripResults'
import type { Plan, Route } from './types'
const route:Route={id:'r1',name:'Route 1',via:'Highway',distance_miles:10,duration_s:3600,arrival:'2026-11-02T14:00:00Z',geometry:{type:'LineString',coordinates:[]},checkpoints:[],summary:{risk_miles:{Low:0,Moderate:0,High:0,Severe:10,'No Travel':0},average_risk:3,eligible:true,max_risk:3,segments:[{from:'a',to:'b',score:4,miles:3},{from:'b',to:'c',score:0,miles:7}]}}
const plan={routes:[route],recommended_id:'r1'} as Plan
it('gives a single Severe route caution wording and a visible caution tone',()=>{
  render(<Recommendation plan={plan} onSelect={vi.fn()}/>)
  expect(screen.getByText('Only one route found')).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveClass('severe')
  expect(screen.getByRole('status')).toHaveTextContent('includes 10 Severe miles')
})
it('draws the risk strip in route order, with origin on the left',()=>{
  render(<RouteCard route={route} index={0} selected recommended onSelect={vi.fn()} departure="2026-11-02T13:00:00Z" zone="America/Phoenix"/>)
  const strip=screen.getByRole('img',{name:/origin on the left/})
  expect(strip.children[0]).toHaveStyle({background:'#913854',width:'30%'})
  expect(strip.children[1]).toHaveStyle({background:'#3a9f83',width:'70%'})
  expect(screen.getByRole('button')).toHaveAccessibleName(/Route 1, recommended/)
})
