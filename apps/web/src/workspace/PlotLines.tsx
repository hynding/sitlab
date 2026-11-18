import { useState, type FormEvent } from 'react'
import { createEntry, deleteEntry, plotLineKinds, updateEntry, type Beat, type PlotLine } from '../cms'
import { useWorkspace } from './context'
import { cleanBeats } from './edit'
import { BeatList, BeatsEditor, Choice } from './fields'
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
              <BeatList beats={p.beats} />
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

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const data = {
      title: title.trim(),
      kind,
      summary: orNull(summary),
      // the array's order is the beats' order; saved entries keep their id
      beats: cleanBeats(beats),
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
      <BeatsEditor beats={beats} onChange={setBeats} />
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
