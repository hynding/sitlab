import { useState, type FormEvent } from 'react'
import { createEntry, deleteEntry, timesOfDay, updateEntry, type Backend, type Media, type Scene, type StoryboardFrame } from '../cms'
import { useWorkspace } from './context'
import { Choice } from './fields'
import { label, orNull, scrollToResearch } from './format'
import { downloadFountain } from './fountain'
import { deleteUnused, storyboardData } from './edit'
import { StoryboardEditor, StoryboardStrip } from './Storyboard'

/** Saves positions 0, 1, 2… in the given order, touching only scenes whose position changes. */
async function renumber(backend: Backend, scenes: Scene[]): Promise<void> {
  for (const [i, s] of scenes.entries()) {
    if (s.position !== i) await updateEntry(backend, 'scenes', s.documentId, { position: i })
  }
}

/** The story's scenes in order, with who is in them, which plot lines they carry and the screenplay. */
export function Scenes() {
  const { story, canEdit, backend, run, busy } = useWorkspace()
  const [editing, setEditing] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const scenes = story.scenes

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    if (!title.trim()) return
    const position = scenes.reduce((max, s) => Math.max(max, s.position ?? -1), -1) + 1
    const data = { title: title.trim(), position, story: story.documentId }
    if (await run(() => createEntry(backend, 'scenes', data))) setTitle('')
  }

  const move = (i: number, by: number) => {
    const next = [...scenes]
    const [scene] = next.splice(i, 1)
    next.splice(i + by, 0, scene)
    void run(() => renumber(backend, next))
  }

  return (
    <section className="ws-section" aria-labelledby="scenes">
      <div className="section-head">
        <h2 id="scenes">Scenes</h2>
        {scenes.length > 0 && (
          <button type="button" className="secondary" onClick={() => downloadFountain(story)} title="A Fountain file opens in Highland, Fade In, WriterSolo and Final Draft">
            Export screenplay
          </button>
        )}
      </div>
      {scenes.length === 0 && <p className="muted">No scenes yet.</p>}
      <ol className="cards">
        {scenes.map((s, i) =>
          editing === s.documentId ? (
            <li key={s.documentId}>
              <SceneForm scene={s} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={s.documentId} className="card">
              <div className="card-head">
                <strong>
                  {i + 1}. {s.title}
                </strong>
                {(s.location || s.timeOfDay) && (
                  <span className="slug">
                    {[s.location, s.timeOfDay && label(s.timeOfDay)].filter(Boolean).join(' · ')}
                  </span>
                )}
              </div>
              {s.summary && <p>{s.summary}</p>}
              {(s.characters.length > 0 || s.plotLines.length > 0) && (
                <p className="chips">
                  {s.plotLines.map((p) => (
                    <span key={p.documentId} className="tag">
                      {p.title}
                    </span>
                  ))}
                  {s.characters.map((c) => (
                    <span key={c.documentId} className="tag person">
                      {c.name}
                    </span>
                  ))}
                </p>
              )}
              {s.sources.length > 0 && (
                <p className="chips" aria-label="Research">
                  {s.sources.map((r) => (
                    <button type="button" key={r.documentId} className="tag research" onClick={scrollToResearch}>
                      {r.title}
                    </button>
                  ))}
                </p>
              )}
              <StoryboardStrip frames={s.storyboard} />
              {s.screenplay && (
                <details>
                  <summary>Screenplay</summary>
                  <pre className="screenplay">{s.screenplay}</pre>
                </details>
              )}
              {canEdit && (
                <div className="row">
                  <button type="button" className="secondary" onClick={() => setEditing(s.documentId)}>
                    Edit
                  </button>
                  <button type="button" className="link" disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                    ↑
                  </button>
                  <button
                    type="button"
                    className="link"
                    disabled={busy || i === scenes.length - 1}
                    onClick={() => move(i, 1)}
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="link"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm(`Delete the scene “${s.title}”?`)) void run(() => deleteEntry(backend, 'scenes', s.documentId))
                    }}
                  >
                    Delete
                  </button>
                </div>
              )}
            </li>
          ),
        )}
      </ol>
      {canEdit && (
        <form onSubmit={onCreate} aria-label="New scene">
          <input placeholder="New scene" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <button type="submit" disabled={busy}>
            Add scene
          </button>
        </form>
      )}
    </section>
  )
}

function toggle(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]
}

function SceneForm({ scene, onDone }: { scene: Scene; onDone: () => void }) {
  const { story, backend, run, busy } = useWorkspace()
  const [title, setTitle] = useState(scene.title)
  const [location, setLocation] = useState(scene.location ?? '')
  const [timeOfDay, setTimeOfDay] = useState(scene.timeOfDay)
  const [summary, setSummary] = useState(scene.summary ?? '')
  const [screenplay, setScreenplay] = useState(scene.screenplay ?? '')
  const [characters, setCharacters] = useState(scene.characters.map((c) => c.documentId))
  const [plotLines, setPlotLines] = useState(scene.plotLines.map((p) => p.documentId))
  const [storyboard, setStoryboard] = useState<StoryboardFrame[]>(scene.storyboard)
  const [uploaded, setUploaded] = useState<Media[]>([])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const data = {
      title: title.trim(),
      location: orNull(location),
      timeOfDay,
      summary: orNull(summary),
      screenplay: screenplay.trim() ? screenplay : null,
      characters: { set: characters },
      plotLines: { set: plotLines },
      storyboard: storyboardData(storyboard),
    }
    if (await run(() => updateEntry(backend, 'scenes', scene.documentId, data))) {
      void deleteUnused(backend, uploaded, storyboard)
      onDone()
    }
  }

  function onCancel() {
    void deleteUnused(backend, uploaded, [])
    onDone()
  }

  return (
    <form className="stacked card" onSubmit={onSubmit}>
      <label>
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} required />
      </label>
      <div className="row">
        <label className="grow">
          Location
          <input value={location} placeholder="e.g. INT. Lighthouse" onChange={(e) => setLocation(e.target.value)} />
        </label>
        <label>
          Time of day <Choice value={timeOfDay} options={timesOfDay} empty="—" onChange={setTimeOfDay} />
        </label>
      </div>
      <label>
        Summary
        <textarea value={summary} rows={2} onChange={(e) => setSummary(e.target.value)} />
      </label>
      {story.characters.length > 0 && (
        <fieldset className="checks">
          <legend>Characters in this scene</legend>
          {story.characters.map((c) => (
            <label key={c.documentId}>
              <input type="checkbox" checked={characters.includes(c.documentId)} onChange={() => setCharacters(toggle(characters, c.documentId))} />{' '}
              {c.name}
            </label>
          ))}
        </fieldset>
      )}
      {story.plotLines.length > 0 && (
        <fieldset className="checks">
          <legend>Plot lines this scene carries</legend>
          {story.plotLines.map((p) => (
            <label key={p.documentId}>
              <input type="checkbox" checked={plotLines.includes(p.documentId)} onChange={() => setPlotLines(toggle(plotLines, p.documentId))} />{' '}
              {p.title}
            </label>
          ))}
        </fieldset>
      )}
      <label>
        Screenplay
        <textarea className="screenplay" value={screenplay} rows={10} onChange={(e) => setScreenplay(e.target.value)} />
      </label>
      <StoryboardEditor frames={storyboard} onChange={setStoryboard} onUploaded={(media) => setUploaded((u) => [...u, ...media])} />
      <div className="row">
        <button type="submit" disabled={busy}>
          Save
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
