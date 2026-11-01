import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ForecastPanel } from './ForecastPanel'
import type { Plan } from './types'

vi.mock('./RouteMap',()=>({RouteMap:()=>null}))
const plan={departure:'2026-11-01T16:00:00Z',origin:{timezone:'America/Los_Angeles'},routes:[
  {id:'a',name:'Route A',distance_miles:100,duration_s:14400,geometry:{coordinates:[[0,0],[1,0],[1,1]]},geometry_progress:[[0,0],[20,10800],[100,14400]],summary:{eligible:true}},
  {id:'b',name:'Route B',routing_profile:'car',distance_miles:80,duration_s:3600,geometry:{coordinates:[[0,0],[2,0]]},geometry_progress:[[0,0],[80,3600]],summary:{eligible:false}},
]} as Plan
const props={plan,selectedId:'a',onSelect:vi.fn(),checkpoint:null,onCheckpoint:vi.fn(),busy:false}
afterEach(()=>vi.useRealTimers())

it('resets progress and the forecast hour to departure when switching routes',()=>{
  const {rerender}=render(<ForecastPanel {...props}/>)
  expect(screen.getByLabelText('Estimated route progress')).toHaveTextContent('At departure · 0 mi')
  fireEvent.change(screen.getByRole('slider'),{target:{value:'2'}})
  expect(screen.getByLabelText('Estimated route progress')).toHaveTextContent('13.3 mi traveled · 86.7 mi remaining')
  rerender(<ForecastPanel {...props} selectedId="b"/>)
  const progress=screen.getByLabelText('Estimated route progress')
  expect(progress).toHaveTextContent('Estimated car position · Route B')
  expect(progress).toHaveTextContent('At departure · 0 mi')
  expect(progress).toHaveTextContent('No Travel — route excluded. Position preview only.')
  expect(screen.getByRole('slider')).toHaveValue('0')
})

it('moves progress with play and stops changing it after pause',()=>{
  vi.useFakeTimers()
  render(<ForecastPanel {...props}/>)
  fireEvent.click(screen.getByRole('button',{name:'Play trip preview'}))
  act(()=>vi.advanceTimersByTime(100))
  expect(screen.getByRole('slider')).toHaveValue('0.025')
  expect(within(screen.getByLabelText('Estimated route progress')).getByText(/mi traveled/)).toHaveTextContent('0.2 mi traveled')
  fireEvent.click(screen.getByRole('button',{name:'Pause trip preview'}))
  act(()=>vi.advanceTimersByTime(1000))
  expect(screen.getByRole('slider')).toHaveValue('0.025')
})

it('resets progress to departure when a new plan is loaded',()=>{
  const {rerender}=render(<ForecastPanel {...props}/>)
  fireEvent.change(screen.getByRole('slider'),{target:{value:'48'}})
  expect(screen.getByLabelText('Estimated route progress')).toHaveTextContent('Arrived · 100 mi')
  rerender(<ForecastPanel {...props} plan={{...plan,departure:'2026-11-02T16:00:00Z'}}/>)
  expect(screen.getByLabelText('Estimated route progress')).toHaveTextContent('At departure · 0 mi')
})

it('pauses at exact arrival, explains the remaining weather horizon, and can replay',()=>{
  vi.useFakeTimers()
  const shortPlan={...plan,routes:[{...plan.routes[0],duration_s:4501,geometry_progress:[[0,0],[20,3600],[100,4501]] as [number,number][]}]}
  render(<ForecastPanel {...props} plan={shortPlan}/>)
  fireEvent.change(screen.getByRole('slider'),{target:{value:'1.24'}})
  fireEvent.click(screen.getByRole('button',{name:'Play trip preview'}))
  act(()=>vi.advanceTimersByTime(100))
  expect(Number((screen.getByRole('slider') as HTMLInputElement).value)).toBeCloseTo(4501/3600,10)
  expect(screen.getByLabelText('Estimated route progress')).toHaveTextContent('Arrived · 100 mi')
  expect(screen.getByRole('status')).toHaveTextContent('Trip completed. The heatmap shows corridor weather at this time.')
  act(()=>vi.advanceTimersByTime(2000))
  expect(Number((screen.getByRole('slider') as HTMLInputElement).value)).toBeCloseTo(4501/3600,10)
  fireEvent.click(screen.getByRole('button',{name:'Replay trip preview'}))
  expect(screen.getByRole('slider')).toHaveValue('0')
  expect(screen.getByLabelText('Estimated route progress')).toHaveTextContent('At departure · 0 mi')
})

it('keeps the full 48-hour forecast available when a shorter trip has ended',()=>{
  render(<ForecastPanel {...props}/>)
  fireEvent.change(screen.getByRole('slider'),{target:{value:'48'}})
  expect(screen.getByRole('slider')).toHaveAttribute('max','48')
  expect(screen.getByRole('slider')).toHaveValue('48')
  expect(screen.getByRole('status')).toHaveTextContent('Move the slider to inspect weather after arrival.')
  expect(screen.getByLabelText('Estimated route progress')).toHaveTextContent('Arrived · 100 mi')
})

it('ends a long-trip preview at 48 hours without claiming the vehicle has arrived',()=>{
  vi.useFakeTimers()
  const longPlan={...plan,trip_exceeds_heatmap:true,routes:[{...plan.routes[0],duration_s:72*3600,geometry_progress:[[0,0],[20,36*3600],[100,72*3600]] as [number,number][]}]}
  render(<ForecastPanel {...props} plan={longPlan}/>)
  fireEvent.change(screen.getByRole('slider'),{target:{value:'47.99'}})
  fireEvent.click(screen.getByRole('button',{name:'Play trip preview'}))
  act(()=>vi.advanceTimersByTime(100))
  expect(screen.getByRole('slider')).toHaveValue('48')
  expect(screen.getByRole('button',{name:'Replay trip preview'})).toBeInTheDocument()
  expect(screen.getByLabelText('Estimated route progress')).not.toHaveTextContent('Arrived')
  expect(screen.getByText(/The corridor timeline shows the first 48 hours/)).toBeInTheDocument()
})

it('resets and pauses playback when changing routes',()=>{
  vi.useFakeTimers()
  const {rerender}=render(<ForecastPanel {...props}/>)
  fireEvent.click(screen.getByRole('button',{name:'Play trip preview'}))
  act(()=>vi.advanceTimersByTime(100))
  rerender(<ForecastPanel {...props} selectedId="b"/>)
  act(()=>vi.advanceTimersByTime(1000))
  expect(screen.getByRole('slider')).toHaveValue('0')
  expect(screen.getByRole('button',{name:'Play trip preview'})).toBeInTheDocument()
})
