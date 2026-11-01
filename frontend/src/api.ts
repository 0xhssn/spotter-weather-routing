import { validPlacesResponse, validPlanResponse } from './validation'

// Kept in tab memory only; never persist the shared password in browser storage.
let demoPassword = ''
export function setDemoPassword(password: string) { demoPassword = password }

export class ApiError extends Error {
  constructor(message:string,public status:number,public code:string,public retryAfter=0){super(message);this.name='ApiError'}
}
export async function api<T>(url:string, options?:RequestInit):Promise<T> {
  const timeout=AbortSignal.timeout(28000)
  const headers=new Headers(options?.headers)
  const sentPassword=demoPassword
  if(sentPassword)headers.set('Authorization',`Bearer ${sentPassword}`)
  let response:Response
  const base=(import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/,'')
  try { response=await fetch(`${base}${url}`,{...options,headers,credentials:'omit',cache:'no-store',signal:options?.signal?AbortSignal.any([options.signal,timeout]):timeout}) }
  catch(error){
    if(typeof error==='object' && error!==null && 'name' in error && error.name==='TimeoutError')throw new ApiError('The comparison timed out. Please try again shortly.',503,'client_timeout')
    throw error
  }
  if(response.status===401 && sentPassword===demoPassword){
    setDemoPassword('')
    window.dispatchEvent(new Event('waywise:access-required'))
  }
  let data
  try { data = await response.json() }
  catch { throw new Error(response.ok?'The service returned an unreadable response. Please try again.':'The route service is unavailable. Please try again shortly.') }
  if (!response.ok) throw new ApiError(typeof data?.error==='string'?data.error:'The request could not be completed. Please try again.',response.status,data?.code || 'request_failed',Number(response.headers.get('Retry-After') || data?.retry_after || 0))
  const path = url.split('?')[0]
  if(path==='/api/access' && (typeof data!=='object'||data===null||typeof data.password_required!=='boolean'))throw new ApiError('The service returned invalid access settings. Please try again.',502,'invalid_response')
  const validate = path === '/api/places' ? validPlacesResponse : path === '/api/plan' || path === '/api/example' ? validPlanResponse : undefined
  if (validate && !validate(data)) throw new ApiError('The service returned incomplete or invalid data. Please try again.', 502, 'invalid_response')
  return data as T
}
