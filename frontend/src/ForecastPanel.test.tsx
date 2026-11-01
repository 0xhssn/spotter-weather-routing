import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ForecastPanel } from './ForecastPanel'
import type { Plan } from './types'

vi.mock('./RouteMap',()=>({RouteMap:({hour}:{hour:number})=><output aria-label="Map forecast hour">{hour}</output>}))
const plan={departure:'2026-11-01T16:00:00Z',origin:{timezone:'America/Los_Angeles'},routes:[
  {id:'a',name:'Route A',duration_s:14400},
  {id:'b',name:'Route B',duration_s:3600},
]} as Plan
const props={plan,selectedId:'a',onSelect:vi.fn(),checkpoint:null,onCheckpoint:vi.fn(),busy:false}
const hour=()=>Number((screen.getByRole('slider') as HTMLInputElement).value)
afterEach(()=>vi.useRealTimers())

it('resets the forecast hour and pauses when switching routes',()=>{
  vi.useFakeTimers()
  const {rerender}=render(<ForecastPanel {...props}/>)
  fireEvent.change(screen.getByRole('slider'),{target:{value:'12'}})
  fireEvent.click(screen.getByRole('button',{name:'Play forecast'}))
  act(()=>vi.advanceTimersByTime(100))
  expect(hour()).toBeGreaterThan(12)
  rerender(<ForecastPanel {...props} selectedId="b"/>)
  act(()=>vi.advanceTimersByTime(1000))
  expect(hour()).toBe(0)
  expect(screen.getByRole('button',{name:'Play forecast'})).toBeInTheDocument()
})

it('advances weather with play, pauses, and resumes from the current hour',()=>{
  vi.useFakeTimers()
  render(<ForecastPanel {...props}/>)
  fireEvent.click(screen.getByRole('button',{name:'Play forecast'}))
  act(()=>vi.advanceTimersByTime(1000))
  expect(hour()).toBe(4)
  expect(screen.getByLabelText('Map forecast hour')).toHaveTextContent('4')
  fireEvent.click(screen.getByRole('button',{name:'Pause forecast'}))
  act(()=>vi.advanceTimersByTime(2000))
  expect(hour()).toBe(4)
  fireEvent.click(screen.getByRole('button',{name:'Play forecast'}))
  act(()=>vi.advanceTimersByTime(1000))
  expect(hour()).toBe(8)
})

it('resets and pauses when a new plan is loaded',()=>{
  vi.useFakeTimers()
  const {rerender}=render(<ForecastPanel {...props}/>)
  fireEvent.click(screen.getByRole('button',{name:'Play forecast'}))
  act(()=>vi.advanceTimersByTime(1000))
  rerender(<ForecastPanel {...props} plan={{...plan,departure:'2026-11-02T16:00:00Z'}}/>)
  act(()=>vi.advanceTimersByTime(1000))
  expect(hour()).toBe(0)
  expect(screen.getByRole('button',{name:'Play forecast'})).toBeInTheDocument()
})

it('pauses animation when the user scrubs the full weather window',()=>{
  vi.useFakeTimers()
  render(<ForecastPanel {...props}/>)
  fireEvent.click(screen.getByRole('button',{name:'Play forecast'}))
  act(()=>vi.advanceTimersByTime(1000))
  fireEvent.change(screen.getByRole('slider'),{target:{value:'36'}})
  act(()=>vi.advanceTimersByTime(1000))
  expect(hour()).toBe(36)
  expect(screen.getByRole('slider')).toHaveAttribute('max','48')
  expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext',expect.stringContaining('+36 hours'))
  expect(screen.getByRole('button',{name:'Play forecast'})).toBeInTheDocument()
})

it('pauses and disables playback while a comparison is in progress',()=>{
  vi.useFakeTimers()
  const {rerender}=render(<ForecastPanel {...props}/>)
  fireEvent.click(screen.getByRole('button',{name:'Play forecast'}))
  act(()=>vi.advanceTimersByTime(1000))
  rerender(<ForecastPanel {...props} busy/>)
  act(()=>vi.advanceTimersByTime(1000))
  expect(hour()).toBe(4)
  expect(screen.getByRole('button',{name:'Play forecast'})).toBeDisabled()
})

it.each([3600,14400,72*3600])('plays every forecast hour in 12 seconds for a %s-second route',duration=>{
  vi.useFakeTimers()
  render(<ForecastPanel {...props} plan={{...plan,routes:[{...plan.routes[0],duration_s:duration}],trip_exceeds_heatmap:duration>48*3600}}/>)
  expect(screen.queryByLabelText('Estimated route progress')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Play forecast'}))
  act(()=>vi.advanceTimersByTime(11950))
  expect(hour()).toBeCloseTo(47.8,10)
  expect(screen.getByRole('button',{name:'Pause forecast'})).toBeInTheDocument()
  act(()=>vi.advanceTimersByTime(50))
  expect(hour()).toBe(48)
  expect(screen.getByRole('button',{name:'Replay forecast'})).toBeInTheDocument()
  act(()=>vi.advanceTimersByTime(5000))
  expect(hour()).toBe(48)
  fireEvent.click(screen.getByRole('button',{name:'Replay forecast'}))
  expect(hour()).toBe(0)
  act(()=>vi.advanceTimersByTime(100))
  expect(hour()).toBeCloseTo(.4,10)
})


it('always shows two-digit hours and minutes, including exact-hour boundaries',()=>{
  render(<ForecastPanel {...props}/>)
  const timer=screen.getByRole('timer')
  expect(timer).toHaveTextContent('+00h 00m')
  for(const [value,text] of [['1.5','+01h 30m'],['9.983333333333333','+09h 59m'],['10','+10h 00m'],['14','+14h 00m'],['47.9999','+48h 00m'],['48','+48h 00m']]){
    fireEvent.change(screen.getByRole('slider'),{target:{value}})
    expect(timer).toHaveTextContent(text)
  }
  expect(timer).toHaveAttribute('aria-label','Forecast offset: 48 hours, 0 minutes')
  expect(timer).toHaveAttribute('aria-live','off')
})

it('keeps both units present throughout play, pause and replay',()=>{
  vi.useFakeTimers()
  render(<ForecastPanel {...props}/>)
  const timer=screen.getByRole('timer')
  fireEvent.click(screen.getByRole('button',{name:'Play forecast'}))
  act(()=>vi.advanceTimersByTime(50))
  expect(timer).toHaveTextContent('+00h 12m')
  act(()=>vi.advanceTimersByTime(950))
  expect(timer).toHaveTextContent('+04h 00m')
  fireEvent.click(screen.getByRole('button',{name:'Pause forecast'}))
  act(()=>vi.advanceTimersByTime(1000))
  expect(timer).toHaveTextContent('+04h 00m')
  fireEvent.change(screen.getByRole('slider'),{target:{value:'48'}})
  expect(timer).toHaveTextContent('+48h 00m')
  fireEvent.click(screen.getByRole('button',{name:'Replay forecast'}))
  expect(timer).toHaveTextContent('+00h 00m')
})
