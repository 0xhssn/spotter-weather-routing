import { afterEach, expect, it, vi } from 'vitest'
import { api } from './api'

afterEach(() => vi.unstubAllGlobals())

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
