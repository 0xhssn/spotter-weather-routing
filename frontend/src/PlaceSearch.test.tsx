import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { PlaceSearch } from './PlaceSearch'
import { api } from './api'
import type { Place } from './types'

vi.mock('./api', () => ({ api: vi.fn() }))
const city: Place = { label: 'Los Angeles', lat: 34, lon: -118 }
beforeEach(() => { vi.useFakeTimers(); vi.mocked(api).mockReset() })
afterEach(() => vi.useRealTimers())

it('clears an externally removed city, as when swapping with an unselected field', () => {
  const change = vi.fn()
  const view = render(<PlaceSearch label="Origin" value={city} onChange={change}/>)
  view.rerender(<PlaceSearch label="Origin" value={null} onChange={change}/>)
  expect(screen.getByRole('combobox')).toHaveValue('')
})

it('keeps the user query when typing invalidates the previously selected city', () => {
  function Field() {
    const [value, setValue] = useState<Place|null>(city)
    return <PlaceSearch label="Origin" value={value} onChange={setValue}/>
  }
  render(<Field/>);
  fireEvent.change(screen.getByRole('combobox'), {target: {value: 'Seattle'}})
  expect(screen.getByRole('combobox')).toHaveValue('Seattle')
})

it('discards a stale search response even if transport cancellation arrives too late', async () => {
  let resolveOld!: (result: {results: Place[]}) => void
  vi.mocked(api).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve }))
  vi.mocked(api).mockResolvedValueOnce({results: [{...city, label: 'Seattle'}]})
  render(<PlaceSearch label="Origin" value={null} onChange={vi.fn()}/>)
  fireEvent.change(screen.getByRole('combobox'), {target: {value: 'Los'}})
  await act(() => vi.advanceTimersByTimeAsync(350))
  fireEvent.change(screen.getByRole('combobox'), {target: {value: 'Sea'}})
  await act(() => vi.advanceTimersByTimeAsync(350))
  await act(async () => resolveOld({results: [city]}))
  expect(screen.queryByRole('button', {name: 'Los Angeles'})).not.toBeInTheDocument()
  expect(screen.getByRole('button', {name: 'Seattle'})).toBeInTheDocument()
})

it('clears search errors after choosing an externally supplied city', async () => {
  vi.mocked(api).mockRejectedValueOnce(new Error('Unavailable'))
  const view = render(<PlaceSearch label="Origin" value={null} onChange={vi.fn()}/>)
  fireEvent.change(screen.getByRole('combobox'), {target: {value: 'Los'}})
  await act(() => vi.advanceTimersByTimeAsync(350))
  expect(screen.getByText(/City search is unavailable/)).toBeInTheDocument()
  view.rerender(<PlaceSearch label="Origin" value={city} onChange={vi.fn()}/>)
  expect(screen.queryByText(/City search is unavailable/)).not.toBeInTheDocument()
})

it('keyboard selection emits the chosen coordinates', async () => {
  const change = vi.fn()
  vi.mocked(api).mockResolvedValueOnce({results: [city]})
  render(<PlaceSearch label="Origin" value={null} onChange={change}/>)
  const input = screen.getByRole('combobox')
  fireEvent.change(input, {target: {value: 'Los'}})
  await act(() => vi.advanceTimersByTimeAsync(350))
  fireEvent.keyDown(input, {key: 'ArrowDown'})
  fireEvent.keyDown(input, {key: 'Enter'})
  expect(change).toHaveBeenLastCalledWith(city)
  expect(input).toHaveValue(city.label)
})
