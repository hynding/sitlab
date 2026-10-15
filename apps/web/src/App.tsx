import { useEffect, useState, type FormEvent } from 'react'
import { availableBackends, backends, CmsError, createStory, defaultBackend, listStories, type Backend, type Story } from './cms'

function App() {
  const [backend, setBackend] = useState<Backend>(defaultBackend)
  const [version, setVersion] = useState(0)
  const [result, setResult] = useState<{ key: string; stories: Story[]; error: string | null }>({ key: '', stories: [], error: null })
  const [createError, setCreateError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [logline, setLogline] = useState('')

  const key = `${backend}:${version}`
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
    <main>
      <header>
        <h1>Sitlab</h1>
        <label>
          Backend{' '}
          <select
            value={backend}
            onChange={(e) => {
              setCreateError(null)
              setBackend(e.target.value as Backend)
            }}
          >
            {availableBackends.map((b) => (
              <option key={b} value={b}>
                {backends[b].label}
              </option>
            ))}
          </select>
        </label>
      </header>

      <form onSubmit={onCreate}>
        <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <input placeholder="Logline" value={logline} onChange={(e) => setLogline(e.target.value)} />
        <button type="submit">Add story</button>
      </form>

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
    </main>
  )
}

function describe(e: unknown, backend: Backend): string {
  if (e instanceof CmsError && (e.status === 401 || e.status === 403)) {
    // the token hint is for local development only; a deployed build never carries a token
    return import.meta.env.DEV
      ? `${backends[backend].label} refused the request (${e.status}). Set VITE_CMS_${backend.toUpperCase()}_TOKEN in apps/web/.env.local to an API token from its admin panel.`
      : 'You do not have access to this yet.'
  }
  if (e instanceof CmsError) return `${backends[backend].label}: ${e.message}`
  return `${backends[backend].label} is not reachable at ${backends[backend].url}. Is it running?`
}

export default App
