import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AccessGate } from './AccessGate'
import { api, setDemoPassword } from './api'

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status})
afterEach(() => {setDemoPassword(''); vi.unstubAllGlobals(); vi.unstubAllEnvs()})

it('does not mount the planner until the shared password is verified', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(reply({password_required: true}))
    .mockResolvedValueOnce(reply({password_required: true}))
  vi.stubGlobal('fetch', fetch)
  render(<AccessGate><div>Protected planner</div></AccessGate>)
  expect(screen.queryByText('Protected planner')).not.toBeInTheDocument()
  fireEvent.change(await screen.findByLabelText('Demo password'), {target: {value: 'shared-test-password'}})
  await act(async () => {fireEvent.click(screen.getByRole('button', {name: 'Open planner'}))})
  expect(screen.getByText('Protected planner')).toBeInTheDocument()
  const options = fetch.mock.calls[1][1]
  expect(options.headers.get('Authorization')).toBe('Bearer shared-test-password')
  expect(options.credentials).toBe('omit')
  expect(localStorage.length).toBe(0)
  expect(sessionStorage.length).toBe(0)
})

it('rejects a wrong password and allows retry', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(reply({password_required: true}))
    .mockResolvedValueOnce(reply({error: 'Wrong password', code: 'demo_auth_required'}, 401))
    .mockResolvedValueOnce(reply({password_required: true})))
  render(<AccessGate><div>Protected planner</div></AccessGate>)
  fireEvent.change(await screen.findByLabelText('Demo password'), {target: {value: 'wrong'}})
  await act(async () => {fireEvent.click(screen.getByRole('button', {name: 'Open planner'}))})
  expect(screen.getByRole('alert')).toHaveTextContent('Check the password')
  expect(screen.queryByText('Protected planner')).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Demo password'), {target: {value: 'correct'}})
  await act(async () => {fireEvent.click(screen.getByRole('button', {name: 'Open planner'}))})
  expect(screen.getByText('Protected planner')).toBeInTheDocument()
})

it('fails closed on unavailable or malformed access settings and can retry', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(reply({}))
    .mockResolvedValueOnce(reply({password_required: false})))
  render(<AccessGate><div>Local planner</div></AccessGate>)
  expect(await screen.findByText('Could not check demo access. Please try again.')).toBeInTheDocument()
  expect(screen.queryByText('Local planner')).not.toBeInTheDocument()
  await act(async () => {fireEvent.click(screen.getByRole('button', {name: 'Try again'}))})
  expect(screen.getByText('Local planner')).toBeInTheDocument()
})

it('locks the planner and clears its token when the server rejects access after rotation', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(reply({password_required: false}))
    .mockResolvedValueOnce(reply({error: 'Enter password', code: 'demo_auth_required'}, 401))
    .mockResolvedValueOnce(reply({password_required: true}))
  vi.stubGlobal('fetch', fetch)
  render(<AccessGate><div>Protected planner</div></AccessGate>)
  await screen.findByText('Protected planner')
  setDemoPassword('previous-password')
  await act(async () => {await expect(api('/api/example')).rejects.toMatchObject({status: 401})})
  expect(screen.queryByText('Protected planner')).not.toBeInTheDocument()
  expect(screen.getByLabelText('Demo password')).toHaveValue('')
  await api('/api/access')
  expect(fetch.mock.calls[2][1].headers.has('Authorization')).toBe(false)
})
