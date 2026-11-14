import { useEffect, useState, type FormEvent } from 'react'
import { createStory, listStories, type Backend, type Story } from '../cms'
import { describe } from '../errors'
import { href } from '../router'


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
              <a className="title" href={href({ name: 'story', id: story.documentId })}>
                {story.title}
              </a>
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
