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
