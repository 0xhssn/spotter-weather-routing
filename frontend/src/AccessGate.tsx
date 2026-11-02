import { createContext, useEffect, useState, type PropsWithChildren } from 'react'
import { api, ApiError, restoreDemoToken, setDemoPassword, setDemoToken } from './api'

export const DemoLogoutContext = createContext<(() => void) | null>(null)

export function AccessGate({children}: PropsWithChildren) {
  const [state, setState] = useState<'checking' | 'locked' | 'open'>('checking')
  const [password, setPassword] = useState('')
  const [passwordRequired, setPasswordRequired] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setError('')
    api<{password_required: boolean}>('/api/access', {signal: controller.signal})
      .then(async data => {
        if (controller.signal.aborted) return
        setPasswordRequired(data.password_required)
        if (!data.password_required) {setDemoPassword(''); setState('open'); return}
        if (!restoreDemoToken()) {setState('locked'); return}
        // Revalidate saved access before mounting the planner after a reload.
        await api('/api/access', {method: 'POST', signal: controller.signal})
        if (!controller.signal.aborted) setState('open')
      })
      .catch(error => {
        if (controller.signal.aborted) return
        if (error instanceof ApiError && error.status === 401) {
          setState('locked'); setError('Your access has expired. Enter the shared demo password again.')
        } else setError('Could not check demo access. Please try again.')
      })
    return () => controller.abort()
  }, [attempt])

  useEffect(() => {
    const lock = () => {
      setPassword(''); setState('locked')
      setError('Enter the shared demo password to continue.')
    }
    window.addEventListener('waywise:access-required', lock)
    return () => window.removeEventListener('waywise:access-required', lock)
  }, [])

  async function unlock(event: React.FormEvent) {
    event.preventDefault()
    if (busy || !password) return
    setBusy(true); setError(''); setDemoPassword(password)
    try {
      const data = await api<{access_token?: string}>('/api/access', {method: 'POST'})
      if (data.access_token) setDemoToken(data.access_token)
      setPassword(''); setState('open')
    } catch {
      setDemoPassword('')
      setError('Access could not be verified. Check the password and try again.')
    } finally {setBusy(false)}
  }

  function logout() {
    setDemoPassword('')
    setPassword(''); setError(''); setState('locked')
  }

  if (state === 'open') return <DemoLogoutContext.Provider value={passwordRequired ? logout : null}>{children}</DemoLogoutContext.Provider>
  return <main className="access-page"><section className="access-card" aria-labelledby="access-title">
    <h1 id="access-title">Waywise reviewer access</h1>
    {state === 'checking' ? <>
      <p>{error || 'Checking demo access…'}</p>
      {error && <button className="primary-button" onClick={() => setAttempt(value => value + 1)}>Try again</button>}
    </> : <>
      <p>Enter the shared demo password to open the route planner.</p>
      <form onSubmit={unlock}>
        <label htmlFor="demo-password">Demo password</label>
        <input id="demo-password" type="password" autoComplete="current-password" autoFocus required maxLength={256}
          value={password} onChange={event => setPassword(event.target.value)}/>
        <button className="primary-button" disabled={busy || !password}>{busy ? 'Checking…' : 'Open planner'}</button>
      </form>
      {error && <p className="access-error" role="alert">{error}</p>}
      <p className="access-note">Access survives refreshes in this tab for up to 12 hours. Use Log out to clear access in this tab, or close the tab to end the browser session.</p>
    </>}
  </section></main>
}
