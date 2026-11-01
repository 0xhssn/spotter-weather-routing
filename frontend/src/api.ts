import { validPlacesResponse, validPlanResponse } from './validation'

export class ApiError extends Error {
  constructor(message:string,public status:number,public code:string,public retryAfter=0){super(message);this.name='ApiError'}
}
export async function api<T>(url:string, options?:RequestInit):Promise<T> {
  const timeout=AbortSignal.timeout(28000)
  let response:Response
  try { response=await fetch(url,{...options,signal:options?.signal?AbortSignal.any([options.signal,timeout]):timeout}) }
  catch(error){
    if(typeof error==='object' && error!==null && 'name' in error && error.name==='TimeoutError')throw new ApiError('The comparison timed out. Please try again shortly.',503,'client_timeout')
    throw error
  }
  let data
  try { data = await response.json() }
  catch { throw new Error(response.ok?'The service returned an unreadable response. Please try again.':'The route service is unavailable. Please try again shortly.') }
  if (!response.ok) throw new ApiError(typeof data?.error==='string'?data.error:'The request could not be completed. Please try again.',response.status,data?.code || 'request_failed',Number(response.headers.get('Retry-After') || data?.retry_after || 0))
  const path = url.split('?')[0]
  const validate = path === '/api/places' ? validPlacesResponse : path === '/api/plan' || path === '/api/example' ? validPlanResponse : undefined
  if (validate && !validate(data)) throw new ApiError('The service returned incomplete or invalid data. Please try again.', 502, 'invalid_response')
  return data as T
}
