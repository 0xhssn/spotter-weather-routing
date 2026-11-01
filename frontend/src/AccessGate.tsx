import { useEffect, useState, type PropsWithChildren } from 'react'
import { api, setDemoPassword } from './api'

export function AccessGate({children}: PropsWithChildren) {
  const [state, setState] = useState<'checking' | 'locked' | 'open'>('checking')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setError('')
    api<{password_required: boolean}>('/api/access', {signal: controller.signal})
      .then(data => {if (!controller.signal.aborted) setState(data.password_required ? 'locked' : 'open')})
      .catch(() => {if (!controller.signal.aborted) setError('Could not check demo access. Please try again.')})
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
      await api('/api/access', {method: 'POST'})
      setPassword(''); setState('open')
    } catch {
      setDemoPassword('')
      setError('Access could not be verified. Check the password and try again.')
    } finally {setBusy(false)}
  }

  if (state === 'open') return children
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
      <p className="access-note">Access lasts until you reload or close this tab.</p>
    </>}
  </section></main>
}
