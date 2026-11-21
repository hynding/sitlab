import { useState, type FormEvent } from 'react'
import { createEntry, deleteEntry, updateEntry, type Beat, type Character, type CharacterArc } from '../cms'
import { useWorkspace } from './context'
import { cleanBeats } from './edit'
import { BeatList, BeatsEditor } from './fields'
import { orNull } from './format'

/** How the story's characters change: where each one starts, where they end up, and the beats between. */
export function Arcs() {
  const { story, canEdit, backend, run, busy } = useWorkspace()
  const [editing, setEditing] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [character, setCharacter] = useState('')
  const arcs = story.arcs

  if (arcs === null) {
    return (
      <section className="ws-section" aria-labelledby="arcs">
        <h2 id="arcs">Character arcs</h2>
        <p className="muted">Character arcs are not available to you yet.</p>
      </section>
    )
  }

  // arcs of characters in the cast first, in cast order; arcs whose character left the story last
  const castOrder = new Map(story.characters.map((c, i) => [c.documentId, i]))
  const ordered = [...arcs].sort(
    (a, b) => (castOrder.get(a.character?.documentId ?? '') ?? Infinity) - (castOrder.get(b.character?.documentId ?? '') ?? Infinity),
  )

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    if (!title.trim() || !character) return
    const data = { title: title.trim(), character, story: story.documentId }
    if (await run(() => createEntry(backend, 'character-arcs', data))) setTitle('')
  }

  return (
    <section className="ws-section" aria-labelledby="arcs">
      <h2 id="arcs">Character arcs</h2>
      {arcs.length === 0 && <p className="muted">No character arcs yet.</p>}
      <ul className="cards">
        {ordered.map((a) =>
          editing === a.documentId ? (
            <li key={a.documentId}>
              <ArcForm arc={a} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={a.documentId} className="card">
              <div className="card-head">
                <strong>{a.title}</strong>
                {a.character && <span className="tag person">{a.character.name}</span>}
              </div>
              {(a.startState || a.endState) && (
                <p className="arc-states">
                  <span>{a.startState ?? '…'}</span>
                  <span aria-label="becomes" className="arc-arrow">
                    →
                  </span>
                  <span>{a.endState ?? '…'}</span>
                </p>
              )}
              <BeatList beats={a.beats} />
              {canEdit && (
                <div className="row">
                  <button type="button" className="secondary" onClick={() => setEditing(a.documentId)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="link"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm(`Delete the arc “${a.title}”?`)) void run(() => deleteEntry(backend, 'character-arcs', a.documentId))
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
      {canEdit &&
        (story.characters.length === 0 ? (
          <p className="muted">Add a character to give them an arc.</p>
        ) : (
          <form onSubmit={onCreate} aria-label="New character arc">
            <input placeholder="New arc (e.g. Learns to trust)" value={title} onChange={(e) => setTitle(e.target.value)} required />
            <select aria-label="Character" value={character} onChange={(e) => setCharacter(e.target.value)} required>
              <option value="">Whose arc?</option>
              {story.characters.map((c) => (
                <option key={c.documentId} value={c.documentId}>
                  {c.name}
                </option>
              ))}
            </select>
            <button type="submit" disabled={busy}>
              Add arc
            </button>
          </form>
        ))}
    </section>
  )
}

function ArcForm({ arc, onDone }: { arc: CharacterArc; onDone: () => void }) {
  const { story, backend, run, busy } = useWorkspace()
  const [title, setTitle] = useState(arc.title)
  const [character, setCharacter] = useState(arc.character?.documentId ?? '')
  const [startState, setStartState] = useState(arc.startState ?? '')
  const [endState, setEndState] = useState(arc.endState ?? '')
  const [beats, setBeats] = useState<Beat[]>(arc.beats)

  // the arc's character may have been removed from the story; keep them selectable
  const choices: Pick<Character, 'documentId' | 'name'>[] = [...story.characters]
  if (arc.character && !choices.some((c) => c.documentId === arc.character?.documentId)) choices.push(arc.character)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const data = {
      title: title.trim(),
      character: character || null,
      startState: orNull(startState),
      endState: orNull(endState),
      beats: cleanBeats(beats),
    }
    if (await run(() => updateEntry(backend, 'character-arcs', arc.documentId, data))) onDone()
  }

  return (
    <form className="stacked card" onSubmit={onSubmit}>
      <div className="row">
        <label className="grow">
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </label>
        <label>
          Character
          <select value={character} onChange={(e) => setCharacter(e.target.value)}>
            <option value="">—</option>
            {choices.map((c) => (
              <option key={c.documentId} value={c.documentId}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="row">
        <label className="grow">
          Starts as
          <textarea value={startState} rows={2} placeholder="Who they are at the start" onChange={(e) => setStartState(e.target.value)} />
        </label>
        <label className="grow">
          Ends as
          <textarea value={endState} rows={2} placeholder="Who they become" onChange={(e) => setEndState(e.target.value)} />
        </label>
      </div>
      <BeatsEditor beats={beats} onChange={setBeats} legend="Turning points" />
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
