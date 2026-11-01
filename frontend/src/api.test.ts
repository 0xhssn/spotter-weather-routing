import { afterEach, expect, it, vi } from 'vitest'
import { api, setDemoPassword } from './api'

afterEach(() => {setDemoPassword('');vi.unstubAllGlobals();vi.unstubAllEnvs()})

it('shows a useful service error when the reverse proxy returns HTML', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<h1>Bad Gateway</h1>', {status: 502})))
  await expect(api('/api/plan')).rejects.toThrow(/service.*unavailable/i)
})

it('preserves backend validation errors', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({error: 'Choose different cities.'}), {status: 400})))
  await expect(api('/api/plan')).rejects.toThrow('Choose different cities.')
})


it('passes the Retry-After value to the countdown UI',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({error:'Wait before comparing.',code:'rate_limited'}),{status:429,headers:{'Retry-After':'12'}})))
  await expect(api('/api/plan')).rejects.toMatchObject({status:429,retryAfter:12,code:'rate_limited'})
})
it('replaces browser timeout wording with an actionable message',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new DOMException('signal timed out','TimeoutError')))
  await expect(api('/api/plan')).rejects.toThrow('The comparison timed out. Please try again shortly.')
})
it('handles an empty JSON error response without exposing a JavaScript exception',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('null',{status:500})))
  await expect(api('/api/plan')).rejects.toThrow('The request could not be completed. Please try again.')
})

it.each(['', 'https://api.example.test', 'https://api.example.test/'])('uses the configured public API origin: %s',async base=>{
  vi.stubEnv('VITE_API_BASE_URL',base)
  const fetch=vi.fn().mockResolvedValue(new Response('{"status":"ok"}',{status:200}))
  vi.stubGlobal('fetch',fetch)
  await expect(api('/api/health?check=1')).resolves.toEqual({status:'ok'})
  expect(fetch).toHaveBeenCalledWith(`${base.replace(/\/+$/,'')}/api/health?check=1`,expect.any(Object))
})
it('still validates plan data when using a separate API origin',async()=>{
  vi.stubEnv('VITE_API_BASE_URL','https://api.example.test')
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}',{status:200})))
  await expect(api('/api/example')).rejects.toMatchObject({code:'invalid_response'})
})

it('does not let an old unauthorized response clear newly entered credentials',async()=>{
  let finish!:(response:Response)=>void
  const fetch=vi.fn().mockImplementationOnce(()=>new Promise<Response>(resolve=>{finish=resolve}))
    .mockResolvedValueOnce(new Response('{"status":"ok"}',{status:200}))
  vi.stubGlobal('fetch',fetch)
  setDemoPassword('old-password')
  const pending=api('/api/example')
  setDemoPassword('new-password')
  finish(new Response('{"error":"Expired"}',{status:401}))
  await expect(pending).rejects.toMatchObject({status:401})
  await api('/api/health')
  expect(fetch.mock.calls[1][1].headers.get('Authorization')).toBe('Bearer new-password')
})
