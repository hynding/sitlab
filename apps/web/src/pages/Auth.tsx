import { useState, type FormEvent } from 'react'
import { go } from '../router'
import { CmsError, signIn, signUp, type Backend } from '../cms'

function describe(e: unknown): string {
  if (e instanceof CmsError) {
    if (e.status === 429) return 'Too many attempts. Please wait a minute and try again.'
    // users-permissions answers wrong credentials, taken names and weak input with a readable 400
    if (e.status === 400) return e.message
    if (e.status === 403) return 'Sign-ups are closed right now.'
  }
  return 'Something went wrong. Please try again.'
}

export function Auth({ mode, backend }: { mode: 'signin' | 'signup'; backend: Backend }) {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const signingUp = mode === 'signup'

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (signingUp) await signUp(backend, username.trim(), email.trim(), password)
      else await signIn(backend, email.trim(), password)
      go('stories')
    } catch (e) {
      setError(describe(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="auth">
      <h1>{signingUp ? 'Create your account' : 'Welcome back'}</h1>
      <form className="stacked" onSubmit={onSubmit}>
        {signingUp && (
          <label>
            Username
            <input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} minLength={3} required />
          </label>
        )}
        <label>
          {signingUp ? 'Email' : 'Email or username'}
          <input
            type={signingUp ? 'email' : 'text'}
            autoComplete={signingUp ? 'email' : 'username'}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete={signingUp ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={signingUp ? 8 : undefined}
            required
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? 'Please wait…' : signingUp ? 'Sign up' : 'Sign in'}
        </button>
      </form>
      <p className="muted">
        {signingUp ? (
          <>
            Already have an account? <a href="#/signin">Sign in</a>
          </>
        ) : (
          <>
            New to Sitlab? <a href="#/signup">Create an account</a>
          </>
        )}
      </p>
    </section>
  )
}
