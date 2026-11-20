import { useEffect, useState, type FormEvent } from 'react'
import { characterRoles, createEntry, listCharacters, updateEntry, type Character, type Trait } from '../cms'
import { useWorkspace } from './context'
import { Choice } from './fields'
import { label, orNull, scrollToResearch } from './format'

/** The story's cast. A character can be in several stories, so removing one only unlinks it. */
export function Characters() {
  const { story, canEdit } = useWorkspace()
  const [editing, setEditing] = useState<string | null>(null)

  return (
    <section className="ws-section" aria-labelledby="characters">
      <h2 id="characters">Characters</h2>
      {story.characters.length === 0 && <p className="muted">No characters yet.</p>}
      <ul className="cards">
        {story.characters.map((c) =>
          editing === c.documentId ? (
            <li key={c.documentId}>
              <CharacterForm character={c} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={c.documentId} className="card">
              <CharacterCard character={c} onEdit={canEdit ? () => setEditing(c.documentId) : undefined} />
            </li>
          ),
        )}
      </ul>
      {canEdit && <AddCharacter />}
    </section>
  )
}

function CharacterCard({ character, onEdit }: { character: Character; onEdit?: () => void }) {
  const { story, backend, run, busy } = useWorkspace()
  return (
    <>
      <div className="card-head">
        <strong>{character.name}</strong>
        <span className={`tag role-${character.role}`}>{label(character.role)}</span>
      </div>
      {character.summary && <p>{character.summary}</p>}
      {character.traits.length > 0 && (
        <dl className="traits">
          {character.traits.map((t) => (
            <div key={t.id}>
              <dt>{t.label}</dt>
              <dd>{t.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {character.sources.length > 0 && (
        <p className="chips" aria-label="Research">
          {character.sources.map((r) => (
            <button type="button" key={r.documentId} className="tag research" onClick={scrollToResearch}>
              {r.title}
            </button>
          ))}
        </p>
      )}
      {onEdit && (
        <div className="row">
          <button type="button" className="secondary" onClick={onEdit}>
            Edit
          </button>
          <button
            type="button"
            className="link"
            disabled={busy}
            onClick={() =>
              void run(() =>
                updateEntry(backend, 'characters', character.documentId, { stories: { disconnect: [story.documentId] } }),
              )
            }
          >
            Remove from story
          </button>
        </div>
      )}
    </>
  )
}

function CharacterForm({ character, onDone }: { character: Character; onDone: () => void }) {
  const { backend, run, busy } = useWorkspace()
  const [name, setName] = useState(character.name)
  const [role, setRole] = useState(character.role)
  const [summary, setSummary] = useState(character.summary ?? '')
  const [traits, setTraits] = useState<Trait[]>(character.traits)

  const setTrait = (i: number, patch: Partial<Trait>) => setTraits(traits.map((t, j) => (j === i ? { ...t, ...patch } : t)))

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const data = {
      name: name.trim(),
      role,
      summary: orNull(summary),
      // entries keep their id so the CMS updates them in place; new ones have none
      traits: traits.filter((t) => t.label.trim()).map((t) => ({ ...t, label: t.label.trim(), value: orNull(t.value ?? '') })),
    }
    if (await run(() => updateEntry(backend, 'characters', character.documentId, data))) onDone()
  }

  return (
    <form className="stacked card" onSubmit={onSubmit}>
      <div className="row">
        <label className="grow">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          Role <Choice value={role} options={characterRoles} onChange={(v) => v && setRole(v)} />
        </label>
      </div>
      <label>
        Summary
        <textarea value={summary} rows={2} onChange={(e) => setSummary(e.target.value)} />
      </label>
      <fieldset>
        <legend>Traits</legend>
        {traits.map((t, i) => (
          <div className="row" key={t.id ?? `new-${i}`}>
            <input aria-label="Trait" placeholder="Trait (e.g. Fear)" value={t.label} onChange={(e) => setTrait(i, { label: e.target.value })} />
            <input aria-label="Value" placeholder="Value (e.g. Heights)" value={t.value ?? ''} onChange={(e) => setTrait(i, { value: e.target.value })} />
            <button type="button" className="link" onClick={() => setTraits(traits.filter((_, j) => j !== i))}>
              Remove
            </button>
          </div>
        ))}
        <button type="button" className="secondary" onClick={() => setTraits([...traits, { label: '', value: null }])}>
          Add trait
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

function AddCharacter() {
  const { story, backend, run, busy } = useWorkspace()
  const [name, setName] = useState('')
  const [role, setRole] = useState<Character['role']>('supporting')
  const [others, setOthers] = useState<Pick<Character, 'documentId' | 'name'>[]>([])
  const [existing, setExisting] = useState('')

  // characters from other stories, for "add existing"
  const castKey = story.characters.map((c) => c.documentId).join(',')
  useEffect(() => {
    let current = true
    const cast = new Set(castKey.split(','))
    listCharacters(backend).then(
      (res) => current && setOthers(res.data.filter((c) => !cast.has(c.documentId))),
      () => current && setOthers([]),
    )
    return () => {
      current = false
    }
  }, [backend, castKey])

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    const data = { name: name.trim(), role, stories: { connect: [story.documentId] } }
    if (await run(() => createEntry(backend, 'characters', data))) setName('')
  }

  return (
    <>
      <form onSubmit={onCreate} aria-label="New character">
        <input placeholder="New character's name" value={name} onChange={(e) => setName(e.target.value)} required />
        <Choice aria-label="Role" value={role} options={characterRoles} onChange={(v) => v && setRole(v)} />
        <button type="submit" disabled={busy}>
          Add character
        </button>
      </form>
      {others.length > 0 && (
        <form
          aria-label="Existing character"
          onSubmit={(event) => {
            event.preventDefault()
            if (!existing) return
            void run(() =>
              updateEntry(backend, 'stories', story.documentId, { characters: { connect: [existing] } }),
            ).then((ok) => ok && setExisting(''))
          }}
        >
          <select aria-label="Existing character" value={existing} onChange={(e) => setExisting(e.target.value)}>
            <option value="">Add someone from another story…</option>
            {others.map((c) => (
              <option key={c.documentId} value={c.documentId}>
                {c.name}
              </option>
            ))}
          </select>
          <button type="submit" className="secondary" disabled={busy || !existing}>
            Add
          </button>
        </form>
      )}
    </>
  )
}
