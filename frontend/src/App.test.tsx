import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
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
beforeEach(() => {
  vi.mocked(api).mockReset()
  // Keep unrelated form tests out of the annual repeated DST hour.
  vi.spyOn(Date,'now').mockReturnValue(Date.parse('2026-11-02T16:00:00Z'))
})
afterEach(()=>vi.restoreAllMocks())

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
  fireEvent.change(screen.getByLabelText(/Departure/),{target:{value:'2026-11-03T17:00'}})
  fireEvent.click(screen.getByLabelText(/Allow car-profile comparison/))
  vi.mocked(api).mockResolvedValueOnce({...plan(),mode:'live',allow_road_fallback:true})
  await act(async()=>fireEvent.submit(screen.getByRole('button',{name:'Compare live routes'}).closest('form')!))
  expect(JSON.parse(vi.mocked(api).mock.calls[1][1]!.body as string)).toMatchObject({departure:'2026-11-04T01:00:00Z',allow_road_fallback:true})
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

async function showLivePlan() {
  const example=plan()
  vi.mocked(api).mockResolvedValueOnce(example)
  render(<App/>)
  await screen.findByText('Route 1 is your lower-risk option')
  const live={...example,mode:'live' as const}
  vi.mocked(api).mockResolvedValueOnce(live)
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Compare live routes'})))
  expect(screen.getByText('LIVE FORECAST')).toBeInTheDocument()
  return live
}

it('allows a live check from example data, blocks duplicates while loading and after matching live results',async()=>{
  vi.mocked(api).mockResolvedValueOnce(plan())
  render(<App/>)
  await screen.findByText('Route 1 is your lower-risk option')
  const button=screen.getByRole('button',{name:'Compare live routes'}),form=button.closest('form')!
  expect(button).toBeEnabled()
  let resolve!:(value:Plan)=>void
  vi.mocked(api).mockImplementationOnce(()=>new Promise(done=>{resolve=done}))
  fireEvent.click(button)
  expect(screen.getByRole('button',{name:'Comparing routes…'})).toBeDisabled()
  fireEvent.submit(form)
  expect(api).toHaveBeenCalledTimes(2)
  await act(async()=>resolve({...plan(),mode:'live'}))
  expect(screen.getByRole('button',{name:'Compare live routes'})).toBeDisabled()
  expect(screen.getByText('Live results match these inputs. Change a trip setting to compare again.')).toBeInTheDocument()
  fireEvent.submit(form)
  expect(api).toHaveBeenCalledTimes(2)
})

it.each([
  {name:'load weight',edit:()=>fireEvent.change(screen.getByLabelText('Load weight'),{target:{value:'40001'}}),restore:()=>fireEvent.change(screen.getByLabelText('Load weight'),{target:{value:'20000'}})},
  {name:'checkpoint spacing',edit:()=>fireEvent.click(screen.getByRole('button',{name:'10 miles'})),restore:()=>fireEvent.click(screen.getByRole('button',{name:'25 miles'}))},
  {name:'departure',edit:()=>fireEvent.change(screen.getByLabelText(/Departure/),{target:{value:'2026-11-03T10:00'}}),restore:(value:string)=>fireEvent.change(screen.getByLabelText(/Departure/),{target:{value}})},
  {name:'car-profile option',edit:()=>fireEvent.click(screen.getByLabelText(/Allow car-profile comparison/)),restore:()=>fireEvent.click(screen.getByLabelText(/Allow car-profile comparison/))},
  {name:'origin and destination',edit:()=>fireEvent.click(screen.getByRole('button',{name:'Swap origin and destination'})),restore:()=>fireEvent.click(screen.getByRole('button',{name:'Swap origin and destination'}))},
])('enables Compare for changed $name and disables it when the edit is reverted',async({edit,restore})=>{
  await showLivePlan()
  const button=screen.getByRole('button',{name:'Compare live routes'})
  const originalDeparture=(screen.getByLabelText(/Departure/) as HTMLInputElement).value
  expect(button).toBeDisabled()
  edit()
  expect(button).toBeEnabled()
  restore(originalDeparture)
  expect(button).toBeDisabled()
  expect(api).toHaveBeenCalledTimes(2)
})

it('keeps Compare disabled when only the selected route, timeline, layers or details change',async()=>{
  await showLivePlan()
  fireEvent.click(screen.getByRole('button',{name:/^Route 2,/}))
  fireEvent.change(screen.getByRole('slider'),{target:{value:'12'}})
  fireEvent.click(screen.getByLabelText('Weather heatmap'))
  fireEvent.click(screen.getByLabelText('Checkpoints',{exact:true}))
  fireEvent.click(screen.getByRole('button',{name:'Checkpoint details'}))
  expect(screen.getByRole('button',{name:'Compare live routes'})).toBeDisabled()
  expect(api).toHaveBeenCalledTimes(2)
})

it('allows retrying a failed changed trip and disables Compare after that retry succeeds',async()=>{
  const live=await showLivePlan()
  fireEvent.click(screen.getByRole('button',{name:'10 miles'}))
  vi.mocked(api).mockRejectedValueOnce(new ApiError('Weather is temporarily unavailable.',503,'provider_timeout'))
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Compare live routes'})))
  expect(screen.getByRole('alert')).toHaveTextContent('Weather is temporarily unavailable.')
  expect(screen.getByRole('button',{name:'Compare live routes'})).toBeEnabled()
  vi.mocked(api).mockResolvedValueOnce({...live,spacing_miles:10})
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Compare live routes'})))
  expect(screen.getByRole('button',{name:'Compare live routes'})).toBeDisabled()
  expect(api).toHaveBeenCalledTimes(4)
})

it('keeps edits made during an in-flight comparison eligible for another comparison',async()=>{
  const live=await showLivePlan()
  fireEvent.click(screen.getByRole('button',{name:'10 miles'}))
  let resolve!:(value:Plan)=>void
  vi.mocked(api).mockImplementationOnce(()=>new Promise(done=>{resolve=done}))
  fireEvent.click(screen.getByRole('button',{name:'Compare live routes'}))
  fireEvent.click(screen.getByRole('button',{name:'50 miles'}))
  expect(screen.getByRole('button',{name:'Comparing routes…'})).toBeDisabled()
  await act(async()=>resolve({...live,spacing_miles:10}))
  expect(screen.getByRole('button',{name:'50 miles'})).toHaveAttribute('aria-pressed','true')
  expect(screen.getByRole('button',{name:'Compare live routes'})).toBeEnabled()
  fireEvent.click(screen.getByRole('button',{name:'10 miles'}))
  expect(screen.getByRole('button',{name:'Compare live routes'})).toBeDisabled()
})

it('requires valid trip inputs and a selected city before enabling a new live comparison',async()=>{
  vi.mocked(api).mockResolvedValueOnce(plan())
  render(<App/>)
  await screen.findByText('Route 1 is your lower-risk option')
  fireEvent.change(screen.getByLabelText('Load weight'),{target:{value:'-1'}})
  expect(screen.getByRole('button',{name:'Compare live routes'})).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Load weight'),{target:{value:'20000'}})
  expect(screen.getByRole('button',{name:'Compare live routes'})).toBeEnabled()
  const departure=(screen.getByLabelText(/Departure/) as HTMLInputElement).value
  fireEvent.change(screen.getByLabelText(/Departure/),{target:{value:''}})
  expect(screen.getByRole('button',{name:'Compare live routes'})).toBeDisabled()
  fireEvent.change(screen.getByLabelText(/Departure/),{target:{value:departure}})
  fireEvent.change(screen.getByRole('combobox',{name:'Origin'}),{target:{value:'Denver'}})
  expect(screen.getByRole('button',{name:'Compare live routes'})).toBeDisabled()
  expect(screen.getByText('Choose both cities from the search results.')).toBeInTheDocument()
  fireEvent.submit(screen.getByRole('button',{name:'Compare live routes'}).closest('form')!)
  expect(api).toHaveBeenCalledTimes(1)
})
