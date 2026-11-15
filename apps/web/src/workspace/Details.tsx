import { useState, type FormEvent } from 'react'
import { deleteEntry, storyFormats, storyStatuses, updateEntry, type StoryDetail } from '../cms'
import { go } from '../router'
import { useWorkspace } from './context'
import { Choice } from './fields'
import { label, orNull } from './format'

/** The story's own fields: title, logline, format, status and genre. */
export function Details() {
  const { story, canEdit, run, busy, backend } = useWorkspace()
  const [editing, setEditing] = useState(false)

  if (editing) return <DetailsForm story={story} onDone={() => setEditing(false)} />

  return (
    <header className="story-head">
      <h1>{story.title}</h1>
      <p className="meta">
        {label(story.format)} · {label(story.status)}
        {story.genre ? ` · ${story.genre}` : ''}
      </p>
      {story.logline ? <p className="lead">{story.logline}</p> : canEdit && <p className="muted">No logline yet.</p>}
      {canEdit && (
        <div className="row">
          <button type="button" onClick={() => setEditing(true)}>
            Edit story
          </button>
          <button
            type="button"
            className="danger"
            disabled={busy}
            onClick={() => {
              if (!window.confirm(`Delete “${story.title}”? Its plot lines and scenes stay in the CMS but lose their story.`)) return
              void run(() => deleteEntry(backend, 'stories', story.documentId)).then((ok) => ok && go('stories'))
            }}
          >
            Delete story
          </button>
        </div>
      )}
    </header>
  )
}

function DetailsForm({ story, onDone }: { story: StoryDetail; onDone: () => void }) {
  const { backend, run, busy } = useWorkspace()
  const [title, setTitle] = useState(story.title)
  const [logline, setLogline] = useState(story.logline ?? '')
  const [format, setFormat] = useState(story.format)
  const [status, setStatus] = useState(story.status)
  const [genre, setGenre] = useState(story.genre ?? '')

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const data = { title: title.trim(), logline: orNull(logline), format, status, genre: orNull(genre) }
    if (await run(() => updateEntry(backend, 'stories', story.documentId, data))) onDone()
  }

  return (
    <form className="stacked card" onSubmit={onSubmit}>
      <label>
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} required />
      </label>
      <label>
        Logline
        <textarea value={logline} maxLength={300} rows={2} onChange={(e) => setLogline(e.target.value)} />
      </label>
      <div className="row">
        <label>
          Format <Choice value={format} options={storyFormats} onChange={(v) => v && setFormat(v)} />
        </label>
        <label>
          Status <Choice value={status} options={storyStatuses} onChange={(v) => v && setStatus(v)} />
        </label>
        <label>
          Genre <input value={genre} onChange={(e) => setGenre(e.target.value)} />
        </label>
      </div>
      <div className="row">
        <button type="submit" disabled={busy}>
          Save
        </button>
        <button type="button" className="secondary" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  )
}
