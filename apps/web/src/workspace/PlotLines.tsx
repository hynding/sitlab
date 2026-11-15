import { useState, type FormEvent } from 'react'
import { beatMoods, createEntry, deleteEntry, plotLineKinds, updateEntry, type Beat, type PlotLine } from '../cms'
import { useWorkspace } from './context'
import { Choice } from './fields'
import { label, orNull } from './format'

/** A, B and C plots, subplots and runners, each a list of beats tagged by mood. */
export function PlotLines() {
  const { story, canEdit, backend, run, busy } = useWorkspace()
  const [editing, setEditing] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<PlotLine['kind']>('a-plot')

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    if (!title.trim()) return
    const data = { title: title.trim(), kind, story: story.documentId }
    if (await run(() => createEntry(backend, 'plot-lines', data))) setTitle('')
  }

  return (
    <section className="ws-section" aria-labelledby="plot-lines">
      <h2 id="plot-lines">Plot lines</h2>
      {story.plotLines.length === 0 && <p className="muted">No plot lines yet.</p>}
      <ul className="cards">
        {story.plotLines.map((p) =>
          editing === p.documentId ? (
            <li key={p.documentId}>
              <PlotLineForm plotLine={p} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={p.documentId} className="card">
              <div className="card-head">
                <strong>{p.title}</strong>
                <span className="tag">{label(p.kind)}</span>
              </div>
              {p.summary && <p>{p.summary}</p>}
              {p.beats.length > 0 && (
                <ol className="beats">
                  {p.beats.map((b) => (
                    <li key={b.id}>
                      <span className={`mood mood-${b.mood}`}>{label(b.mood)}</span> <strong>{b.title}</strong>
                      {b.description && <span className="muted"> {b.description}</span>}
                    </li>
                  ))}
                </ol>
              )}
              {canEdit && (
                <div className="row">
                  <button type="button" className="secondary" onClick={() => setEditing(p.documentId)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="link"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm(`Delete the plot line “${p.title}”?`)) void run(() => deleteEntry(backend, 'plot-lines', p.documentId))
                    }}
                  >
                    Delete
                  </button>
                </div>
              )}
            </li>
          ),
        )}
      </ul>
      {canEdit && (
        <form onSubmit={onCreate} aria-label="New plot line">
          <input placeholder="New plot line" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <Choice aria-label="Kind" value={kind} options={plotLineKinds} onChange={(v) => v && setKind(v)} />
          <button type="submit" disabled={busy}>
            Add plot line
          </button>
        </form>
      )}
    </section>
  )
}

function PlotLineForm({ plotLine, onDone }: { plotLine: PlotLine; onDone: () => void }) {
  const { backend, run, busy } = useWorkspace()
  const [title, setTitle] = useState(plotLine.title)
  const [kind, setKind] = useState(plotLine.kind)
  const [summary, setSummary] = useState(plotLine.summary ?? '')
  const [beats, setBeats] = useState<Beat[]>(plotLine.beats)

  const setBeat = (i: number, patch: Partial<Beat>) => setBeats(beats.map((b, j) => (j === i ? { ...b, ...patch } : b)))
  const move = (i: number, by: number) => {
    const next = [...beats]
    const [beat] = next.splice(i, 1)
    next.splice(i + by, 0, beat)
    setBeats(next)
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const data = {
      title: title.trim(),
      kind,
      summary: orNull(summary),
      // the array's order is the beats' order; saved entries keep their id
      beats: beats
        .filter((b) => b.title.trim())
        .map((b) => ({ ...b, title: b.title.trim(), description: orNull(b.description ?? '') })),
    }
    if (await run(() => updateEntry(backend, 'plot-lines', plotLine.documentId, data))) onDone()
  }

  return (
    <form className="stacked card" onSubmit={onSubmit}>
      <div className="row">
        <label className="grow">
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </label>
        <label>
          Kind <Choice value={kind} options={plotLineKinds} onChange={(v) => v && setKind(v)} />
        </label>
      </div>
      <label>
        Summary
        <textarea value={summary} rows={2} onChange={(e) => setSummary(e.target.value)} />
      </label>
      <fieldset>
        <legend>Beats</legend>
        {beats.map((b, i) => (
          <div className="beat-edit" key={b.id ?? `new-${i}`}>
            <div className="row">
              <span className="muted">{i + 1}.</span>
              <input aria-label="Beat" placeholder="What happens" value={b.title} onChange={(e) => setBeat(i, { title: e.target.value })} />
              <Choice aria-label="Mood" value={b.mood} options={beatMoods} onChange={(v) => v && setBeat(i, { mood: v })} />
            </div>
            <div className="row">
              <input
                aria-label="Details"
                placeholder="Details (optional)"
                value={b.description ?? ''}
                onChange={(e) => setBeat(i, { description: e.target.value })}
              />
              <button type="button" className="link" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                ↑
              </button>
              <button type="button" className="link" disabled={i === beats.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                ↓
              </button>
              <button type="button" className="link" onClick={() => setBeats(beats.filter((_, j) => j !== i))}>
                Remove
              </button>
            </div>
          </div>
        ))}
        <button type="button" className="secondary" onClick={() => setBeats([...beats, { title: '', description: null, mood: 'neutral' }])}>
          Add beat
        </button>
      </fieldset>
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
