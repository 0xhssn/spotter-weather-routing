import { useContext } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AccessGate, DemoLogoutContext } from './AccessGate'
import { api, setDemoPassword, setDemoToken } from './api'

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status})
afterEach(() => {setDemoPassword(''); vi.unstubAllGlobals(); vi.unstubAllEnvs()})

it('does not mount the planner until the shared password is verified', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(reply({password_required: true}))
    .mockResolvedValueOnce(reply({password_required: true, access_token: 'demo.signed-test-token'}))
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
  expect(sessionStorage.getItem('waywise:demo-access')).toBe('demo.signed-test-token')
  expect(JSON.stringify({...sessionStorage})).not.toContain('shared-test-password')
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


it('revalidates a saved tab token before mounting the planner after refresh', async () => {
  sessionStorage.setItem('waywise:demo-access', 'demo.saved-token')
  let finish!: (response: Response) => void
  const fetch = vi.fn().mockResolvedValueOnce(reply({password_required: true}))
    .mockImplementationOnce(() => new Promise<Response>(resolve => {finish = resolve}))
  vi.stubGlobal('fetch', fetch)
  render(<AccessGate><div>Protected planner</div></AccessGate>)
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
  expect(screen.queryByText('Protected planner')).not.toBeInTheDocument()
  expect(fetch.mock.calls[1][1].headers.get('Authorization')).toBe('Bearer demo.saved-token')
  await act(async () => finish(reply({password_required: true})))
  expect(screen.getByText('Protected planner')).toBeInTheDocument()
  expect(screen.queryByLabelText('Demo password')).not.toBeInTheDocument()
})

it('clears expired saved access and prompts for the password', async () => {
  setDemoToken('demo.expired-token')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(reply({password_required: true}))
    .mockResolvedValueOnce(reply({error: 'Expired', code: 'demo_auth_required'}, 401)))
  render(<AccessGate><div>Protected planner</div></AccessGate>)
  expect(await screen.findByLabelText('Demo password')).toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent('expired')
  expect(screen.queryByText('Protected planner')).not.toBeInTheDocument()
  expect(sessionStorage.length).toBe(0)
})

it('can log in when session storage is unavailable', async () => {
  const blocked = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {throw new Error('Blocked')})
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(reply({password_required: true}))
    .mockResolvedValueOnce(reply({password_required: true, access_token: 'demo.memory-token'})))
  render(<AccessGate><div>Protected planner</div></AccessGate>)
  fireEvent.change(await screen.findByLabelText('Demo password'), {target: {value: 'correct'}})
  await act(async () => {fireEvent.click(screen.getByRole('button', {name: 'Open planner'}))})
  expect(screen.getByText('Protected planner')).toBeInTheDocument()
  blocked.mockRestore()
})


function LogoutPlanner() {
  const logout = useContext(DemoLogoutContext)
  return <div>Protected planner{logout && <button onClick={logout}>Log out</button>}</div>
}

it('logs out, removes stored and in-memory access, and stays locked after refresh', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(reply({password_required:true}))
    .mockResolvedValueOnce(reply({password_required:true, access_token:'demo.logout-test'}))
    .mockResolvedValueOnce(reply({password_required:true}))
    .mockResolvedValueOnce(reply({password_required:true}))
    .mockResolvedValueOnce(reply({password_required:true, access_token:'demo.new-login'}))
  vi.stubGlobal('fetch',fetch)
  const view=render(<AccessGate><LogoutPlanner/></AccessGate>)
  fireEvent.change(await screen.findByLabelText('Demo password'),{target:{value:'correct'}})
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Open planner'}))})
  expect(sessionStorage.getItem('waywise:demo-access')).toBe('demo.logout-test')
  fireEvent.click(screen.getByRole('button',{name:'Log out'}))
  expect(screen.queryByText('Protected planner')).not.toBeInTheDocument()
  expect(screen.getByLabelText('Demo password')).toHaveValue('')
  expect(screen.getByLabelText('Demo password')).toHaveFocus()
  expect(sessionStorage.length).toBe(0)
  await api('/api/access')
  expect(fetch.mock.calls[2][1].headers.has('Authorization')).toBe(false)
  view.unmount()
  render(<AccessGate><LogoutPlanner/></AccessGate>)
  expect(await screen.findByLabelText('Demo password')).toBeInTheDocument()
  expect(screen.queryByText('Protected planner')).not.toBeInTheDocument()
  expect(fetch).toHaveBeenCalledTimes(4)
  fireEvent.change(screen.getByLabelText('Demo password'),{target:{value:'correct'}})
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Open planner'}))})
  expect(screen.getByRole('button',{name:'Log out'})).toBeInTheDocument()
  expect(sessionStorage.getItem('waywise:demo-access')).toBe('demo.new-login')
})

it('does not offer logout when local development has no password gate', async () => {
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(reply({password_required:false})))
  render(<AccessGate><LogoutPlanner/></AccessGate>)
  expect(await screen.findByText('Protected planner')).toBeInTheDocument()
  expect(screen.queryByRole('button',{name:'Log out'})).not.toBeInTheDocument()
})
