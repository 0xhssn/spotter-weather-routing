export async function api<T>(url:string, options?:RequestInit):Promise<T> {
  const timeout=AbortSignal.timeout(115000)
  const response = await fetch(url, {...options, signal:options?.signal?AbortSignal.any([options.signal,timeout]):timeout})
  let data
  try { data = await response.json() }
  catch { throw new Error(response.ok?'The service returned an unreadable response. Please try again.':'The route service is unavailable. Please try again shortly.') }
  if (!response.ok) throw new Error(data.error || 'The request could not be completed. Please try again.')
  return data as T
}
