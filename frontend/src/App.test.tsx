import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import App from './App'
import { api } from './api'
import type { Plan } from './types'
import { ApiError } from './api'

vi.mock('./api', async importOriginal => ({...await importOriginal<typeof import('./api')>(),api: vi.fn()}))
const renders=vi.hoisted(()=>({cards:0,table:0,recommendation:0}))
vi.mock('./TripResults',async importOriginal=>{
  const actual=await importOriginal<typeof import('./TripResults')>()
  return {...actual,RouteCard:(props:Parameters<typeof actual.RouteCard>[0])=>{renders.cards++;return <actual.RouteCard {...props}/>},CheckpointTable:(props:Parameters<typeof actual.CheckpointTable>[0])=>{renders.table++;return <actual.CheckpointTable {...props}/>},Recommendation:(props:Parameters<typeof actual.Recommendation>[0])=>{renders.recommendation++;return <actual.Recommendation {...props}/>}}
})
vi.mock('./RouteMap', () => ({RouteMap: ({hour}:{hour:number}) => <div aria-label="Map forecast hour">{hour}</div>}))

function plan(blocked=false):Plan {
  const departure=new Date(Date.now()+3600000).toISOString()
  return {
    mode:'example',origin:{label:'Los Angeles',lat:34.0522,lon:-118.2437},destination:{label:'Phoenix',lat:33.4484,lon:-112.074},
    departure,load_lb:20000,spacing_miles:25,recommended_id:blocked?null:'route-1',heatmap:[],forecast_hours:48,
    forecast_locations:3,generated_at:departure,warnings:[],providers:{routing:'Valhalla'},
    routes:[1,2,3].map(i=>({id:`route-${i}`,name:`Route ${i}`,via:'Highway',distance_miles:50,duration_s:7200,arrival:departure,
      geometry:{type:'LineString',coordinates:[[0,0],[1,1]]},checkpoints:[],
      summary:{risk_miles:{Low:0,Moderate:0,High:0,Severe:blocked?0:50,'No Travel':blocked?50:0},
        average_risk:blocked?4:3,eligible:!blocked,max_risk:blocked?4:3,segments:[]},
    })),
  }
}
beforeEach(() => vi.mocked(api).mockReset())

it('shows all three route options and refuses to recommend when every route is blocked', async () => {
  vi.mocked(api).mockResolvedValueOnce(plan(true))
  render(<App/>)
  expect(await screen.findByText('No route recommended — No Travel conditions')).toBeInTheDocument()
  const options=screen.getByRole('region',{name:'Route options'})
  expect(within(options).getAllByRole('button')).toHaveLength(3)
  expect(screen.queryByRole('button',{name:'Select recommended route'})).not.toBeInTheDocument()
})

it('updates the 0–48h heatmap without requesting or replacing arrival-based scores', async () => {
  vi.mocked(api).mockResolvedValueOnce(plan())
  render(<App/>)
  await screen.findByText('Route 1 is your lower-risk option')
  fireEvent.change(screen.getByRole('slider'),{target:{value:'48'}})
  expect(screen.getByLabelText('Map forecast hour')).toHaveTextContent('48')
  expect(screen.getByText('Route 1 is your lower-risk option')).toBeInTheDocument()
  expect(api).toHaveBeenCalledTimes(1)
})

it('marks stale results and sends edited cargo and checkpoint spacing in the live request', async () => {
  vi.mocked(api).mockResolvedValueOnce(plan())
  render(<App/>)
  await screen.findByText('Route 1 is your lower-risk option')
  fireEvent.change(screen.getByLabelText('Load weight'),{target:{value:'40001'}})
  fireEvent.click(screen.getByRole('button',{name:'10 miles'}))
  expect(screen.getByText(/Trip inputs changed/)).toBeInTheDocument()
  vi.mocked(api).mockResolvedValueOnce({...plan(),mode:'live',load_lb:40001,spacing_miles:10})
  await act(async () => fireEvent.submit(screen.getByRole('button',{name:'Compare live routes'}).closest('form')!))
  const [url, options]=vi.mocked(api).mock.calls[1]
  expect(url).toBe('/api/plan')
  expect(JSON.parse(options!.body as string)).toMatchObject({load_lb:40001,spacing_miles:10})
  expect(screen.getByText('LIVE FORECAST')).toBeInTheDocument()
  expect(screen.queryByText(/Trip inputs changed/)).not.toBeInTheDocument()
})


it('slider ticks do not render cards, recommendation or the open checkpoint table', async()=>{
  vi.mocked(api).mockResolvedValueOnce(plan())
  render(<App/>)
  await screen.findByText('Route 1 is your lower-risk option')
  fireEvent.click(screen.getByRole('button',{name:'Checkpoint details'}))
  const before={...renders}
  for(const hour of [1,6,12,24,48])fireEvent.change(screen.getByRole('slider'),{target:{value:String(hour)}})
  expect(renders).toEqual(before)
  expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext',expect.stringContaining('+48 hours'))
})

it('sends origin-local departure and the explicit fallback opt-in', async()=>{
  vi.mocked(api).mockResolvedValueOnce(plan())
  render(<App/>)
  await screen.findByText('Route 1 is your lower-risk option')
  fireEvent.change(screen.getByLabelText(/Departure/),{target:{value:'2026-10-31T17:00'}})
  fireEvent.click(screen.getByLabelText(/Allow car-profile comparison/))
  vi.mocked(api).mockResolvedValueOnce({...plan(),mode:'live',allow_road_fallback:true})
  await act(async()=>fireEvent.submit(screen.getByRole('button',{name:'Compare live routes'}).closest('form')!))
  expect(JSON.parse(vi.mocked(api).mock.calls[1][1]!.body as string)).toMatchObject({departure:'2026-11-01T00:00:00Z',allow_road_fallback:true})
})

it('shows the server retry countdown when a new plan is throttled', async()=>{
  vi.mocked(api).mockResolvedValueOnce(plan())
  render(<App/>)
  await screen.findByText('Route 1 is your lower-risk option')
  vi.mocked(api).mockRejectedValueOnce(new ApiError('Please wait 12 seconds.',429,'rate_limited',12))
  await act(async()=>fireEvent.submit(screen.getByRole('button',{name:'Compare live routes'}).closest('form')!))
  expect(screen.getByRole('button',{name:'Try again in 12s'})).toBeDisabled()
  expect(screen.getByRole('alert')).toHaveTextContent('Please wait 12 seconds.')
})


it('does not overwrite a city being typed while the initial example is loading',async()=>{
  let resolve!:(value:Plan)=>void
  vi.mocked(api).mockImplementationOnce(()=>new Promise(done=>{resolve=done}))
  render(<App/>)
  fireEvent.change(screen.getByRole('combobox',{name:'Origin'}),{target:{value:'Denver'}})
  await act(async()=>resolve(plan()))
  expect(screen.getByRole('combobox',{name:'Origin'})).toHaveValue('Denver')
  expect(screen.getByText(/Trip inputs changed/)).toBeInTheDocument()
})
