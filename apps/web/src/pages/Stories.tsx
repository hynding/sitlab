import { useEffect, useState, type FormEvent } from 'react'
import { backends, CmsError, createStory, listStories, type Backend, type Story } from '../cms'

function describe(e: unknown, backend: Backend): string {
  if (e instanceof CmsError && (e.status === 401 || e.status === 403)) {
    // the token hint is for local development only; a deployed build never carries a token
    return import.meta.env.DEV
      ? `${backends[backend].label} refused the request (${e.status}). Sign in, or set VITE_CMS_${backend.toUpperCase()}_TOKEN in apps/web/.env.local to an API token from its admin panel.`
      : 'You do not have access to this yet.'
  }
  if (e instanceof CmsError) return e.message
  return import.meta.env.DEV
    ? `${backends[backend].label} is not reachable at ${backends[backend].url}. Is it running?`
    : 'Sitlab cannot be reached right now. Please try again later.'
}

export function Stories({ backend, signedIn }: { backend: Backend; signedIn: boolean }) {
  const [version, setVersion] = useState(0)
  const [result, setResult] = useState<{ key: string; stories: Story[]; error: string | null }>({ key: '', stories: [], error: null })
  const [createError, setCreateError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [logline, setLogline] = useState('')

  const key = `${backend}:${signedIn}:${version}`
  const loading = result.key !== key
  const { stories } = result
  const error = createError ?? result.error

  useEffect(() => {
    let current = true
    listStories(backend).then(
      (res) => current && setResult({ key, stories: res.data, error: null }),
      (e) => current && setResult({ key, stories: [], error: describe(e, backend) }),
    )
    return () => {
      current = false
    }
  }, [backend, key])

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    if (!title.trim()) return
    try {
      await createStory(backend, { title: title.trim(), logline: logline.trim() || null })
      setTitle('')
      setLogline('')
      setCreateError(null)
      setVersion((v) => v + 1)
    } catch (e) {
      setCreateError(describe(e, backend))
    }
  }

  return (
    <section>
      <h1>Stories</h1>
      {signedIn ? (
        <form onSubmit={onCreate}>
          <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <input placeholder="Logline" value={logline} onChange={(e) => setLogline(e.target.value)} />
          <button type="submit">Add story</button>
        </form>
      ) : (
        <p className="muted">
          <a href="#/signin">Sign in</a> or <a href="#/signup">create an account</a> to add your own stories.
        </p>
      )}

      {error && <p role="alert">{error}</p>}
      {loading ? (
        <p>Loading…</p>
      ) : stories.length === 0 && !error ? (
        <p>No stories yet.</p>
      ) : (
        <ul className="stories">
          {stories.map((story) => (
            <li key={story.documentId}>
              <strong>{story.title}</strong>
              <span className="meta">
                {story.format} · {story.status}
                {story.genre ? ` · ${story.genre}` : ''}
              </span>
              {story.logline && <p>{story.logline}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
