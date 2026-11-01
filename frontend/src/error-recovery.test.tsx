import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'
import App from './App'
import { planFixture } from './test-fixtures/plan'

vi.mock('./RouteMap', () => ({RouteMap: () => <div>Route map</div>}))
beforeEach(() => vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-02T16:00:00Z')))
afterEach(() => {vi.unstubAllGlobals(); vi.restoreAllMocks()})

it('shows malformed plan data as a recoverable error and can retry successfully', async () => {
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce(new Response('{}', {status: 200}))
    .mockResolvedValueOnce(new Response(JSON.stringify({...planFixture(), mode: 'example'}), {status: 200})))
  render(<App/>)
  expect(await screen.findByRole('alert')).toHaveTextContent('incomplete or invalid data')
  expect(screen.getByRole('button', {name: 'Compare live routes'})).toBeEnabled()
  await act(async () => {fireEvent.click(screen.getByRole('button', {name: 'Load example scenario'}))})
  expect(await screen.findByText('Route 1 is available')).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('preserves the last valid results when a new comparison returns malformed data', async () => {
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(planFixture()), {status: 200}))
    .mockResolvedValueOnce(new Response('null', {status: 200})))
  render(<App/>)
  expect(await screen.findByText('Route 1 is available')).toBeInTheDocument()
  await act(async () => {fireEvent.submit(screen.getByRole('button', {name: 'Compare live routes'}).closest('form')!)})
  expect(await screen.findByRole('alert')).toHaveTextContent('incomplete or invalid data')
  expect(screen.queryByText('Route 1 is available')).not.toBeInTheDocument()
  const results=screen.getByRole('region', {name: 'Route options'})
  expect(results).toHaveTextContent('Route 1')
  expect(results.closest('.results-content')).toHaveAttribute('inert')
})

it('shows a reload action when an unexpected render error occurs', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  function Broken() {throw new Error('render failure'); return null}
  render(<ErrorBoundary><Broken/></ErrorBoundary>)
  expect(screen.getByRole('alert')).toHaveTextContent('The route planner could not be displayed.')
  expect(screen.getByRole('button', {name: 'Reload planner'})).toBeInTheDocument()
})
