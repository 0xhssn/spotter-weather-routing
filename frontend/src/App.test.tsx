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
    mode:'example',origin:{label:'Los Angeles',lat:34.0522,lon:-118.2437,timezone:'America/Los_Angeles'},destination:{label:'Phoenix',lat:33.4484,lon:-112.074,timezone:'America/Phoenix'},
    departure,load_lb:20000,spacing_miles:25,recommended_id:blocked?null:'route-1',heatmap:[],forecast_hours:48,
    forecast_locations:3,generated_at:departure,warnings:[],providers:{routing:'Valhalla'},
    routes:[1,2,3].map(i=>({id:`route-${i}`,name:`Route ${i}`,via:'Highway',distance_miles:50,duration_s:7200,arrival:departure,
      geometry:{type:'LineString',coordinates:[[0,0],[1,1]]},checkpoints:[],
      summary:{risk_miles:{Low:0,Moderate:0,High:0,Severe:blocked?0:50,'No Travel':blocked?50:0},
        average_risk:blocked?4:3,eligible:!blocked,max_risk:blocked?4:3,segments:[]},
    })),
  }
}
function renderWithExample() {
  const view=render(<App/>)
  fireEvent.click(screen.getByRole('button',{name:'Load example scenario'}))
  return view
}

beforeEach(() => {
  vi.mocked(api).mockReset()
  // Keep unrelated form tests out of the annual repeated DST hour.
  vi.spyOn(Date,'now').mockReturnValue(Date.parse('2026-11-02T16:00:00Z'))
})
afterEach(()=>vi.restoreAllMocks())

it('shows all three route options and refuses to recommend when every route is blocked', async () => {
  vi.mocked(api).mockResolvedValueOnce(plan(true))
  renderWithExample()
  expect(await screen.findByText('No route recommended — No Travel conditions')).toBeInTheDocument()
  const options=screen.getByRole('region',{name:'Route options'})
  expect(within(options).getAllByRole('button')).toHaveLength(3)
  expect(screen.queryByRole('button',{name:'Select recommended route'})).not.toBeInTheDocument()
})

it('updates the 0–48h heatmap without requesting or replacing arrival-based scores', async () => {
  vi.mocked(api).mockResolvedValueOnce(plan())
  renderWithExample()
  await screen.findByText('Route 1 is your lower-risk option')
  fireEvent.change(screen.getByRole('slider'),{target:{value:'48'}})
  expect(screen.getByLabelText('Map forecast hour')).toHaveTextContent('48')
  expect(screen.getByText('Route 1 is your lower-risk option')).toBeInTheDocument()
  expect(api).toHaveBeenCalledTimes(1)
})

it('marks stale results and sends edited cargo and checkpoint spacing in the live request', async () => {
  vi.mocked(api).mockResolvedValueOnce(plan())
  renderWithExample()
  await screen.findByText('Route 1 is your lower-risk option')
  fireEvent.change(screen.getByLabelText('Load weight'),{target:{value:'40001'}})
  fireEvent.click(screen.getByRole('button',{name:'10 mi'}))
  expect(screen.getByText(/Trip inputs changed/)).toBeInTheDocument()
  expect(within(screen.getByRole('button',{name:'Compare live routes'})).getByText('Update needed')).toBeInTheDocument()
  vi.mocked(api).mockResolvedValueOnce({...plan(),mode:'live',load_lb:40001,spacing_miles:10})
  await act(async () => fireEvent.submit(screen.getByRole('button',{name:'Compare live routes'}).closest('form')!))
  const [url, options]=vi.mocked(api).mock.calls[1]
  expect(url).toBe('/api/plan')
  expect(JSON.parse(options!.body as string)).toMatchObject({load_lb:40001,spacing_miles:10})
  expect(screen.getByText('LIVE FORECAST')).toBeInTheDocument()
  expect(screen.queryByText(/Trip inputs changed/)).not.toBeInTheDocument()
  expect(screen.queryByText('Update needed')).not.toBeInTheDocument()
})


it('slider ticks do not render cards, recommendation or the open checkpoint table', async()=>{
  vi.mocked(api).mockResolvedValueOnce(plan())
  renderWithExample()
  await screen.findByText('Route 1 is your lower-risk option')
  fireEvent.click(screen.getByRole('button',{name:'Checkpoint details'}))
  const before={...renders}
  for(const hour of [1,6,12,24,48])fireEvent.change(screen.getByRole('slider'),{target:{value:String(hour)}})
  expect(renders).toEqual(before)
  expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext',expect.stringContaining('+48 hours'))
})

it('sends origin-local departure and the explicit fallback opt-in', async()=>{
  vi.mocked(api).mockResolvedValueOnce(plan())
  renderWithExample()
  await screen.findByText('Route 1 is your lower-risk option')
  fireEvent.change(screen.getByLabelText(/Departure/),{target:{value:'2026-11-03T17:00'}})
  fireEvent.click(screen.getByLabelText(/Allow car-profile comparison/))
  vi.mocked(api).mockResolvedValueOnce({...plan(),mode:'live',allow_road_fallback:true})
  await act(async()=>fireEvent.submit(screen.getByRole('button',{name:'Compare live routes'}).closest('form')!))
  expect(JSON.parse(vi.mocked(api).mock.calls[1][1]!.body as string)).toMatchObject({departure:'2026-11-04T01:00:00Z',allow_road_fallback:true})
})

it('shows the server retry countdown when a new plan is throttled', async()=>{
  vi.mocked(api).mockResolvedValueOnce(plan())
  renderWithExample()
  await screen.findByText('Route 1 is your lower-risk option')
  vi.mocked(api).mockRejectedValueOnce(new ApiError('Please wait 12 seconds.',429,'rate_limited',12))
  await act(async()=>fireEvent.submit(screen.getByRole('button',{name:'Compare live routes'}).closest('form')!))
  expect(screen.getByRole('button',{name:'Try again in 12s'})).toBeDisabled()
  expect(screen.getByRole('alert')).toHaveTextContent('Please wait 12 seconds.')
})


it('does not overwrite a city being typed while an explicitly requested example is loading',async()=>{
  let resolve!:(value:Plan)=>void
  vi.mocked(api).mockImplementationOnce(()=>new Promise(done=>{resolve=done}))
  renderWithExample()
  fireEvent.change(screen.getByRole('combobox',{name:'Origin'}),{target:{value:'Denver'}})
  await act(async()=>resolve(plan()))
  expect(screen.getByRole('combobox',{name:'Origin'})).toHaveValue('Denver')
  expect(screen.getByText(/Trip inputs changed/)).toBeInTheDocument()
})

async function showLivePlan() {
  const example=plan()
  vi.mocked(api).mockResolvedValueOnce(example)
  renderWithExample()
  await screen.findByText('Route 1 is your lower-risk option')
  const live={...example,mode:'live' as const}
  vi.mocked(api).mockResolvedValueOnce(live)
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Compare live routes'})))
  expect(screen.getByText('LIVE FORECAST')).toBeInTheDocument()
  return live
}

it('allows live and repeat checks while blocking duplicate in-flight submissions',async()=>{
  vi.mocked(api).mockResolvedValueOnce(plan())
  renderWithExample()
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
  expect(screen.getByRole('button',{name:'Compare live routes'})).toBeEnabled()
  expect(screen.getByText('Compare again to recheck this trip.')).toBeInTheDocument()
  expect(screen.queryByText('Update needed')).not.toBeInTheDocument()
  vi.mocked(api).mockResolvedValueOnce({...plan(),mode:'live'})
  await act(async()=>fireEvent.submit(form))
  expect(api).toHaveBeenCalledTimes(3)
  expect(screen.getByRole('button',{name:'Compare live routes'})).toBeEnabled()
})

it.each([
  {name:'load weight',edit:()=>fireEvent.change(screen.getByLabelText('Load weight'),{target:{value:'40001'}}),restore:()=>fireEvent.change(screen.getByLabelText('Load weight'),{target:{value:'20000'}})},
  {name:'checkpoint spacing',edit:()=>fireEvent.click(screen.getByRole('button',{name:'10 mi'})),restore:()=>fireEvent.click(screen.getByRole('button',{name:'25 mi'}))},
  {name:'departure',edit:()=>fireEvent.change(screen.getByLabelText(/Departure/),{target:{value:'2026-11-03T10:00'}}),restore:(value:string)=>fireEvent.change(screen.getByLabelText(/Departure/),{target:{value}})},
  {name:'car-profile option',edit:()=>fireEvent.click(screen.getByLabelText(/Allow car-profile comparison/)),restore:()=>fireEvent.click(screen.getByLabelText(/Allow car-profile comparison/))},
  {name:'origin and destination',edit:()=>fireEvent.click(screen.getByRole('button',{name:'Swap origin and destination'})),restore:()=>fireEvent.click(screen.getByRole('button',{name:'Swap origin and destination'}))},
])('marks changed $name and clears the mark when the edit is reverted',async({edit,restore})=>{
  await showLivePlan()
  const button=screen.getByRole('button',{name:'Compare live routes'})
  const originalDeparture=(screen.getByLabelText(/Departure/) as HTMLInputElement).value
  expect(button).toBeEnabled()
  expect(within(button).queryByText('Update needed')).not.toBeInTheDocument()
  edit()
  expect(button).toBeEnabled()
  expect(within(button).getByText('Update needed')).toBeInTheDocument()
  restore(originalDeparture)
  expect(button).toBeEnabled()
  expect(within(button).queryByText('Update needed')).not.toBeInTheDocument()
  expect(api).toHaveBeenCalledTimes(2)
})

it('does not mark the trip changed when only the selected route, timeline, layers or details change',async()=>{
  await showLivePlan()
  fireEvent.click(screen.getByRole('button',{name:/^Route 2,/}))
  fireEvent.change(screen.getByRole('slider'),{target:{value:'12'}})
  fireEvent.click(screen.getByLabelText('Weather heatmap'))
  fireEvent.click(screen.getByLabelText('Checkpoints',{exact:true}))
  fireEvent.click(screen.getByRole('button',{name:'Checkpoint details'}))
  expect(screen.getByRole('button',{name:'Compare live routes'})).toBeEnabled()
  expect(screen.queryByText('Update needed')).not.toBeInTheDocument()
  expect(api).toHaveBeenCalledTimes(2)
})

it('retains the update mark after failure and clears it after a successful retry',async()=>{
  const live=await showLivePlan()
  fireEvent.click(screen.getByRole('button',{name:'10 mi'}))
  vi.mocked(api).mockRejectedValueOnce(new ApiError('Weather is temporarily unavailable.',503,'provider_timeout'))
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Compare live routes'})))
  expect(screen.getByRole('alert')).toHaveTextContent('Weather is temporarily unavailable.')
  expect(screen.getByRole('button',{name:'Compare live routes'})).toBeEnabled()
  expect(screen.getByText('Update needed')).toBeInTheDocument()
  vi.mocked(api).mockResolvedValueOnce({...live,spacing_miles:10})
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Compare live routes'})))
  expect(screen.getByRole('button',{name:'Compare live routes'})).toBeEnabled()
  expect(screen.queryByText('Update needed')).not.toBeInTheDocument()
  expect(api).toHaveBeenCalledTimes(4)
})

it('keeps edits made during an in-flight comparison eligible for another comparison',async()=>{
  const live=await showLivePlan()
  fireEvent.click(screen.getByRole('button',{name:'10 mi'}))
  let resolve!:(value:Plan)=>void
  vi.mocked(api).mockImplementationOnce(()=>new Promise(done=>{resolve=done}))
  fireEvent.click(screen.getByRole('button',{name:'Compare live routes'}))
  fireEvent.click(screen.getByRole('button',{name:'50 mi'}))
  expect(screen.getByRole('button',{name:'Comparing routes…'})).toBeDisabled()
  await act(async()=>resolve({...live,spacing_miles:10}))
  expect(screen.getByRole('button',{name:'50 mi'})).toHaveAttribute('aria-pressed','true')
  expect(screen.getByRole('button',{name:'Compare live routes'})).toBeEnabled()
  expect(screen.getByText('Update needed')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'10 mi'}))
  expect(screen.getByRole('button',{name:'Compare live routes'})).toBeEnabled()
  expect(screen.queryByText('Update needed')).not.toBeInTheDocument()
})

it('requires valid trip inputs and a selected city before enabling a new live comparison',async()=>{
  vi.mocked(api).mockResolvedValueOnce(plan())
  renderWithExample()
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

it('prioritizes an error over stale and car notes and makes old results inactive until recovery',async()=>{
  const live=await showLivePlan()
  fireEvent.click(screen.getByLabelText(/Allow car-profile comparison/))
  const car={...live,allow_road_fallback:true,warnings:['The routing service found 2 distinct route(s). No duplicate routes have been added.','Car-profile comparison: original warning.'],routes:live.routes.slice(0,2).map(route=>({...route,routing_profile:'car' as const}))}
  vi.mocked(api).mockResolvedValueOnce(car)
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Compare live routes'})))
  let status=screen.getByRole('region',{name:'Trip status'})
  expect(within(status).getByRole('status')).toHaveTextContent('truck height, weight and access restrictions are not checked')
  expect(screen.getAllByText('Car estimate')).toHaveLength(2)
  expect(screen.getByText('Only 2 different routes were found.')).not.toBeVisible()
  fireEvent.click(screen.getByRole('button',{name:'10 mi'}))
  expect(screen.queryByText('Route 1 is your lower-risk option')).not.toBeInTheDocument()
  const results=screen.getByRole('region',{name:'Route options'}).closest('.results-content')!
  expect(results).toHaveAttribute('inert')
  expect(results).toHaveClass('is-stale')
  vi.mocked(api).mockRejectedValueOnce(new ApiError('Weather is temporarily unavailable.',503,'provider_timeout'))
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Compare live routes'})))
  expect(screen.getAllByRole('alert')).toHaveLength(1)
  status=screen.getByRole('region',{name:'Trip status'})
  expect(within(status).getByRole('alert')).toHaveTextContent('Weather is temporarily unavailable.')
  expect(within(status).getByText('3 more notes')).toBeInTheDocument()
  expect(within(status).getByText(/Trip inputs changed/)).not.toBeVisible()
  fireEvent.click(screen.getByRole('button',{name:'25 mi'}))
  expect(results).toHaveAttribute('inert') // An unchanged-input failure is still an unverified result.
  vi.mocked(api).mockResolvedValueOnce(car)
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Compare live routes'})))
  expect(results).not.toHaveAttribute('inert')
  expect(screen.getByText('Route 1 is your lower-risk option')).toBeInTheDocument()
})

it('offers a labelled car opt-in action for the truck distance limit without submitting automatically',async()=>{
  const live=await showLivePlan()
  vi.mocked(api).mockRejectedValueOnce(new ApiError('This truck router cannot cover this trip distance.',422,'route_too_long'))
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Compare live routes'})))
  expect(screen.getByRole('alert')).toHaveTextContent('This trip is too long for truck routing.')
  fireEvent.click(screen.getByRole('button',{name:'Turn on'}))
  expect(screen.getByRole('checkbox',{name:'Allow car-profile comparison'})).toBeChecked()
  expect(screen.getByRole('checkbox',{name:'Allow car-profile comparison'})).toHaveFocus()
  expect(api).toHaveBeenCalledTimes(3)
  vi.mocked(api).mockResolvedValueOnce({...live,allow_road_fallback:true})
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Compare live routes'})))
  expect(JSON.parse(vi.mocked(api).mock.calls[3][1]!.body as string).allow_road_fallback).toBe(true)
})

it('does not suggest car routing for the application-wide 5,000 mile limit',async()=>{
  await showLivePlan()
  vi.mocked(api).mockRejectedValueOnce(new ApiError('This demo supports trips up to 5,000 miles. Choose closer locations.',422,'route_too_long'))
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Compare live routes'})))
  expect(screen.getByRole('alert')).toHaveTextContent('5,000 miles')
  expect(screen.queryByRole('button',{name:'Turn on'})).not.toBeInTheDocument()
})

it('shows one loading overlay and hides old notices and the recommendation during comparison',async()=>{
  await showLivePlan()
  fireEvent.click(screen.getByRole('button',{name:'10 mi'}))
  let resolve!:(value:Plan)=>void
  vi.mocked(api).mockImplementationOnce(()=>new Promise(done=>{resolve=done}))
  fireEvent.click(screen.getByRole('button',{name:'Compare live routes'}))
  expect(screen.queryByRole('region',{name:'Trip status'})).not.toBeInTheDocument()
  expect(screen.queryByText('Route 1 is your lower-risk option')).not.toBeInTheDocument()
  expect(screen.getAllByText('Checking roads, arrival times, and weather…')).toHaveLength(1)
  expect(screen.getByRole('region',{name:'Route options'}).closest('.results-content')).toHaveAttribute('inert')
  await act(async()=>resolve({...plan(),mode:'live',spacing_miles:10}))
  expect(screen.getByText('Route 1 is your lower-risk option')).toBeInTheDocument()
})

it('keeps one methodology entry point with Escape dismissal and focus restoration',async()=>{
  vi.mocked(api).mockResolvedValueOnce(plan())
  renderWithExample()
  const trigger=await screen.findByRole('button',{name:'How we compare'})
  trigger.focus();fireEvent.click(trigger)
  expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal','true')
  expect(document.body).toHaveStyle({overflow:'hidden'})
  expect(document.documentElement).toHaveStyle({overflow:'hidden'})
  fireEvent.keyDown(document,{key:'Escape'})
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
  expect(document.body.style.overflow).toBe('')
  expect(document.documentElement.style.overflow).toBe('')
})

it('resets the car option when loading an example after a car comparison',async()=>{
  const live=await showLivePlan()
  fireEvent.click(screen.getByLabelText(/Allow car-profile comparison/))
  vi.mocked(api).mockResolvedValueOnce({...live,allow_road_fallback:true,routes:live.routes.map(route=>({...route,routing_profile:'car' as const}))})
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Compare live routes'})))
  vi.mocked(api).mockResolvedValueOnce(plan())
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Load example scenario'})))
  expect(screen.getByRole('checkbox',{name:'Allow car-profile comparison'})).not.toBeChecked()
  expect(screen.queryByText(/Trip inputs changed/)).not.toBeInTheDocument()
  expect(screen.getByText('Route 1 is your lower-risk option')).toBeInTheDocument()
})
it('preserves a car-option edit made while an example is loading',async()=>{
  let resolve!:(value:Plan)=>void
  vi.mocked(api).mockImplementationOnce(()=>new Promise(done=>{resolve=done}))
  renderWithExample()
  fireEvent.click(screen.getByLabelText(/Allow car-profile comparison/))
  await act(async()=>resolve(plan()))
  expect(screen.getByRole('checkbox',{name:'Allow car-profile comparison'})).toBeChecked()
  expect(screen.getByText(/Trip inputs changed/)).toBeInTheDocument()
})

it.each(['backdrop','unmount'])('restores existing page scrolling styles after modal %s',async close=>{
  const bodyOverflow=document.body.style.overflow,pageOverflow=document.documentElement.style.overflow,gutter=document.documentElement.style.scrollbarGutter
  document.body.style.overflow='auto';document.documentElement.style.overflow='clip';document.documentElement.style.scrollbarGutter='auto'
  vi.mocked(api).mockResolvedValueOnce(plan())
  const view=renderWithExample()
  try{
    fireEvent.click(await screen.findByRole('button',{name:'How we compare'}))
    expect(document.body).toHaveStyle({overflow:'hidden'})
    expect(document.documentElement).toHaveStyle({overflow:'hidden',scrollbarGutter:'stable'})
    if(close==='unmount')view.unmount()
    else fireEvent.click(screen.getByRole('dialog').parentElement!)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.body.style.overflow).toBe('auto')
    expect(document.documentElement.style.overflow).toBe('clip')
    expect(document.documentElement.style.scrollbarGutter).toBe('auto')
  }finally{
    view.unmount()
    document.body.style.overflow=bodyOverflow;document.documentElement.style.overflow=pageOverflow;document.documentElement.style.scrollbarGutter=gutter
  }
})

it('starts with empty city fields, a short map prompt and no automatic API requests',()=>{
  render(<App/>)
  expect(screen.getByRole('combobox',{name:'Origin'})).toHaveValue('')
  expect(screen.getByRole('combobox',{name:'Destination'})).toHaveValue('')
  expect(screen.getByRole('heading',{name:'Where are you headed?'})).toBeInTheDocument()
  expect(screen.getByLabelText('Route planning map')).toBeInTheDocument()
  expect(screen.getByText('Select an origin')).toBeInTheDocument()
  expect(screen.getByRole('button',{name:'Compare live routes'})).toBeDisabled()
  expect(screen.getByRole('button',{name:'Swap origin and destination'})).toBeDisabled()
  expect(screen.queryByRole('region',{name:'Route options'})).not.toBeInTheDocument()
  expect(screen.queryByText('EXAMPLE DATA')).not.toBeInTheDocument()
  expect(api).not.toHaveBeenCalled()
})

it('can select both cities and make the first live comparison without loading an example',async()=>{
  const origin={label:'Denver, Colorado, US',lat:39.7392,lon:-104.9903,timezone:'America/Denver'}
  const destination={label:'Chicago, Illinois, US',lat:41.8781,lon:-87.6298,timezone:'America/Chicago'}
  vi.mocked(api).mockImplementation(async(url,options)=>{
    if(url.startsWith('/api/places'))return {results:[url.includes('Denver')?origin:destination]}
    return {...plan(),mode:'live',origin,destination,departure:JSON.parse(options!.body as string).departure}
  })
  render(<App/>)
  const initialDeparture=(screen.getByLabelText(/Departure/) as HTMLInputElement).value
  expect(api).not.toHaveBeenCalled()
  fireEvent.change(screen.getByRole('combobox',{name:'Origin'}),{target:{value:'Denver'}})
  fireEvent.click(await screen.findByRole('button',{name:origin.label}))
  expect(screen.getByRole('button',{name:'Compare live routes'})).toBeDisabled()
  expect(screen.getByText('At origin · MST')).toBeInTheDocument()
  fireEvent.change(screen.getByRole('combobox',{name:'Destination'}),{target:{value:'Chicago'}})
  fireEvent.click(await screen.findByRole('button',{name:destination.label}))
  expect(screen.getByRole('button',{name:'Compare live routes'})).toBeEnabled()
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Compare live routes'})))
  expect(screen.getByText('LIVE FORECAST')).toBeInTheDocument()
  expect(screen.queryByRole('region',{name:'Start a trip'})).not.toBeInTheDocument()
  const [url,options]=vi.mocked(api).mock.calls[2]
  expect(url).toBe('/api/plan')
  expect(JSON.parse(options!.body as string)).toMatchObject({origin,destination,departure:'2026-11-02T17:00:00Z'})
  expect(initialDeparture).not.toBe('')
  expect(vi.mocked(api).mock.calls.some(([url])=>url.startsWith('/api/example'))).toBe(false)
})

it('shows loading on the empty map and allows retry after the first comparison fails',async()=>{
  const origin={label:'Los Angeles',lat:34.0522,lon:-118.2437,timezone:'America/Los_Angeles'}
  const destination={label:'Phoenix',lat:33.4484,lon:-112.074,timezone:'America/Phoenix'}
  let fail!:(reason:Error)=>void
  vi.mocked(api).mockImplementation(async url=>{
    if(url.startsWith('/api/places'))return {results:[url.includes('Los')?origin:destination]}
    return new Promise((_,reject)=>{fail=reject})
  })
  render(<App/>)
  fireEvent.change(screen.getByRole('combobox',{name:'Origin'}),{target:{value:'Los Angeles'}})
  fireEvent.click(await screen.findByRole('button',{name:origin.label}))
  fireEvent.change(screen.getByRole('combobox',{name:'Destination'}),{target:{value:'Phoenix'}})
  fireEvent.click(await screen.findByRole('button',{name:destination.label}))
  fireEvent.click(screen.getByRole('button',{name:'Compare live routes'}))
  expect(screen.getByRole('status')).toHaveTextContent('Checking the road ahead')
  expect(screen.getByRole('button',{name:'Comparing routes…'})).toBeDisabled()
  await act(async()=>fail(new ApiError('Weather unavailable.',503,'provider_unavailable')))
  expect(screen.getByRole('alert')).toHaveTextContent('Weather unavailable.')
  expect(screen.getByRole('button',{name:'Compare live routes'})).toBeEnabled()
  expect(screen.getByRole('heading',{name:'Where are you headed?'})).toBeInTheDocument()
})
