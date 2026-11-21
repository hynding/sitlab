import { useState, type FormEvent } from 'react'
import { createEntry, deleteEntry, sourceTopics, updateEntry, type Backend, type Source, type StoryDetail } from '../cms'
import { search, type Finding, type Provider } from '../research'
import { useWorkspace } from './context'
import { Choice } from './fields'
import { label, orNull } from './format'

/** A character or scene a source can be linked to, encoded as "characters:<documentId>". */
type Target = `${'characters' | 'scenes'}:${string}`

function parseTarget(target: Target): { field: 'characters' | 'scenes'; documentId: string } {
  const [field, documentId] = target.split(/:(.*)/s) as ['characters' | 'scenes', string]
  return { field, documentId }
}

/** The story's own copy of a finding, when it already has one (same Wikidata item or same URL). */
function findExisting(story: StoryDetail, finding: Pick<Finding, 'wikidataId' | 'url'>): Source | undefined {
  return story.sources.find(
    (s) => (finding.wikidataId && s.wikidataId === finding.wikidataId) || (finding.url && s.url === finding.url),
  )
}

const today = () => new Date().toISOString().slice(0, 10)

/**
 * Research for this story: public material (Wikipedia articles, Wikidata entities, any page added
 * by hand) kept as Sources and linked to the characters and scenes it informs.
 */
export function Research() {
  const { story, canEdit } = useWorkspace()
  const [editing, setEditing] = useState<string | null>(null)

  return (
    <section className="ws-section" aria-labelledby="research">
      <h2 id="research">Research</h2>
      {story.sources.length === 0 && (
        <p className="muted">
          {canEdit
            ? 'No research yet. Search Wikipedia or Wikidata for the people, places and eras this story draws on.'
            : 'No research yet.'}
        </p>
      )}
      <ul className="cards">
        {story.sources.map((s) =>
          editing === s.documentId ? (
            <li key={s.documentId}>
              <SourceForm source={s} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={s.documentId} className="card source">
              <SourceCard source={s} onEdit={canEdit ? () => setEditing(s.documentId) : undefined} />
            </li>
          ),
        )}
      </ul>
      {canEdit && (
        <>
          <SearchPanel />
          <AddByHand />
        </>
      )}
    </section>
  )
}

function Thumb({ src }: { src: string | null }) {
  return src ? <img className="thumb" src={src} alt="" loading="lazy" referrerPolicy="no-referrer" /> : null
}

function SourceCard({ source, onEdit }: { source: Source; onEdit?: () => void }) {
  const { story, backend, run, busy } = useWorkspace()
  const unlink = (field: 'characters' | 'scenes', documentId: string) =>
    void run(() => updateEntry(backend, 'sources', source.documentId, { [field]: { disconnect: [documentId] } }))

  // only this story's characters and scenes; a shared source may be linked elsewhere too
  const cast = new Set(story.characters.map((c) => c.documentId))
  const sceneIds = new Set(story.scenes.map((s) => s.documentId))
  const characters = source.characters.filter((c) => cast.has(c.documentId))
  const scenes = source.scenes.filter((s) => sceneIds.has(s.documentId))
  const shared = source.stories.length > 1

  return (
    <>
      <Thumb src={source.imageUrl} />
      <div className="source-body">
        <div className="card-head">
          <strong>{source.url ? <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a> : source.title}</strong>
          {source.topic && source.topic !== 'other' && <span className={`tag topic-${source.topic}`}>{label(source.topic)}</span>}
        </div>
        {(source.period || source.publisher) && (
          <p className="slug">{[source.period, [source.publisher, source.license].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</p>
        )}
        {source.excerpt && <p className="excerpt">{source.excerpt}</p>}
        {source.notes && <p className="notes">{source.notes}</p>}
        {(characters.length > 0 || scenes.length > 0) && (
          <p className="chips" aria-label="Linked to">
            {characters.map((c) => (
              <span key={c.documentId} className="tag person">
                {c.name}
                {onEdit && (
                  <button type="button" className="unlink" disabled={busy} aria-label={`Unlink ${c.name}`} onClick={() => unlink('characters', c.documentId)}>
                    ×
                  </button>
                )}
              </span>
            ))}
            {scenes.map((s) => (
              <span key={s.documentId} className="tag">
                {s.title}
                {onEdit && (
                  <button type="button" className="unlink" disabled={busy} aria-label={`Unlink ${s.title}`} onClick={() => unlink('scenes', s.documentId)}>
                    ×
                  </button>
                )}
              </span>
            ))}
          </p>
        )}
        {onEdit && (
          <div className="row">
            <LinkPicker
              source={source}
              onPick={(target) => {
                const { field, documentId } = parseTarget(target)
                void run(() => updateEntry(backend, 'sources', source.documentId, { [field]: { connect: [documentId] } }))
              }}
            />
            <button type="button" className="secondary" onClick={onEdit}>
              Edit
            </button>
            <button
              type="button"
              className="link"
              disabled={busy}
              onClick={() => {
                if (shared) {
                  void run(() => updateEntry(backend, 'sources', source.documentId, { stories: { disconnect: [story.documentId] } }))
                } else if (window.confirm(`Remove “${source.title}” from this story's research?`)) {
                  void run(() => deleteEntry(backend, 'sources', source.documentId))
                }
              }}
            >
              Remove
            </button>
          </div>
        )}
      </div>
    </>
  )
}

/** A select of the story's characters and scenes that this source is not linked to yet. */
function LinkPicker({ source, onPick }: { source?: Pick<Source, 'characters' | 'scenes'>; onPick: (target: Target) => void }) {
  const { story, busy } = useWorkspace()
  const linked = new Set([...(source?.characters ?? []), ...(source?.scenes ?? [])].map((x) => x.documentId))
  const characters = story.characters.filter((c) => !linked.has(c.documentId))
  const scenes = story.scenes.filter((s) => !linked.has(s.documentId))
  if (characters.length === 0 && scenes.length === 0) return null
  return (
    <select
      aria-label="Link to a character or scene"
      value=""
      disabled={busy}
      onChange={(e) => e.target.value && onPick(e.target.value as Target)}
    >
      <option value="">Link to…</option>
      {characters.length > 0 && (
        <optgroup label="Characters">
          {characters.map((c) => (
            <option key={c.documentId} value={`characters:${c.documentId}`}>
              {c.name}
            </option>
          ))}
        </optgroup>
      )}
      {scenes.length > 0 && (
        <optgroup label="Scenes">
          {scenes.map((s, i) => (
            <option key={s.documentId} value={`scenes:${s.documentId}`}>
              {i + 1}. {s.title}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  )
}

function SourceForm({ source, onDone }: { source: Source; onDone: () => void }) {
  const { backend, run, busy } = useWorkspace()
  const [title, setTitle] = useState(source.title)
  const [topic, setTopic] = useState(source.topic)
  const [period, setPeriod] = useState(source.period ?? '')
  const [notes, setNotes] = useState(source.notes ?? '')

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const data = { title: title.trim(), topic, period: orNull(period), notes: orNull(notes) }
    if (await run(() => updateEntry(backend, 'sources', source.documentId, data))) onDone()
  }

  return (
    <form className="stacked card" onSubmit={onSubmit}>
      <label>
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} required />
      </label>
      <div className="row">
        <label>
          Topic <Choice value={topic} options={sourceTopics} empty="—" onChange={setTopic} />
        </label>
        <label className="grow">
          Period
          <input value={period} placeholder="e.g. 1837 – 1901" onChange={(e) => setPeriod(e.target.value)} />
        </label>
      </div>
      <label>
        Notes
        <textarea value={notes} rows={3} placeholder="What this story takes from it" onChange={(e) => setNotes(e.target.value)} />
      </label>
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

/** Attaches a finding to the story, reusing the story's copy when it has one, and optionally links it. */
async function attach(backend: Backend, story: StoryDetail, finding: Finding, target: Target | ''): Promise<unknown> {
  const link = target ? parseTarget(target) : null
  const connect = link ? { [link.field]: { connect: [link.documentId] } } : {}
  const existing = findExisting(story, finding)
  if (existing) return link ? updateEntry(backend, 'sources', existing.documentId, connect) : undefined
  const { title, url, topic, kind, wikidataId, excerpt, period, imageUrl, publisher, license } = finding
  return createEntry(backend, 'sources', {
    title,
    url,
    topic,
    kind,
    wikidataId,
    excerpt,
    period,
    imageUrl,
    publisher,
    license,
    accessedOn: today(),
    stories: { connect: [story.documentId] },
    ...connect,
  })
}

function SearchPanel() {
  const { story, backend, run, busy } = useWorkspace()
  const [text, setText] = useState('')
  const [provider, setProvider] = useState<Provider>('wikipedia')
  const [state, setState] = useState<{ status: 'idle' | 'searching' | 'done'; results: Finding[]; error: string | null; for: string }>({
    status: 'idle',
    results: [],
    error: null,
    for: '',
  })

  async function onSearch(event: FormEvent) {
    event.preventDefault()
    const q = text.trim()
    if (!q) return
    setState({ status: 'searching', results: [], error: null, for: q })
    try {
      setState({ status: 'done', results: await search(provider, q), error: null, for: q })
    } catch (e) {
      setState({ status: 'done', results: [], error: `Search failed: ${e instanceof Error ? e.message : String(e)}`, for: q })
    }
  }

  return (
    <div className="research-search">
      <form role="search" aria-label="Search public sources" onSubmit={onSearch}>
        <input
          type="search"
          placeholder="Search for a person, place or era"
          value={text}
          onChange={(e) => setText(e.target.value)}
          required
        />
        <select aria-label="Source" value={provider} onChange={(e) => setProvider(e.target.value as Provider)}>
          <option value="wikipedia">Wikipedia</option>
          <option value="wikidata">Wikidata</option>
        </select>
        <button type="submit" disabled={state.status === 'searching'}>
          Search
        </button>
      </form>
      {state.status === 'searching' && <p className="muted">Searching…</p>}
      {state.error && <p role="alert">{state.error}</p>}
      {state.status === 'done' && !state.error && state.results.length === 0 && (
        <p className="muted">Nothing found for “{state.for}”.</p>
      )}
      {state.results.length > 0 && (
        <ul className="cards results" aria-label="Search results">
          {state.results.map((f) => (
            <li key={f.wikidataId ?? f.url ?? f.title} className="card source">
              <FindingCard finding={f} inStory={!!findExisting(story, f)} busy={busy} onAttach={(target) => run(() => attach(backend, story, f, target))} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function FindingCard({
  finding,
  inStory,
  busy,
  onAttach,
}: {
  finding: Finding
  inStory: boolean
  busy: boolean
  onAttach: (target: Target | '') => Promise<boolean>
}) {
  const { story } = useWorkspace()
  const [target, setTarget] = useState<Target | ''>('')
  const existing = inStory ? findExisting(story, finding) : undefined
  const linked = new Set([...(existing?.characters ?? []), ...(existing?.scenes ?? [])].map((x) => x.documentId))

  return (
    <>
      <Thumb src={finding.imageUrl} />
      <div className="source-body">
        <div className="card-head">
          <strong>
            <a href={finding.url ?? undefined} target="_blank" rel="noopener noreferrer">
              {finding.title}
            </a>
          </strong>
          {finding.topic && finding.topic !== 'other' && <span className={`tag topic-${finding.topic}`}>{label(finding.topic)}</span>}
        </div>
        {(finding.description || finding.period) && (
          <p className="slug">{[finding.description, finding.period].filter(Boolean).join(' · ')}</p>
        )}
        {finding.excerpt && finding.excerpt !== finding.description && <p className="excerpt">{finding.excerpt}</p>}
        <form
          className="row"
          aria-label={`Attach ${finding.title}`}
          onSubmit={(e) => {
            e.preventDefault()
            void onAttach(target).then((ok) => ok && setTarget(''))
          }}
        >
          <select aria-label="Attach to" value={target} onChange={(e) => setTarget(e.target.value as Target | '')}>
            <option value="">{inStory ? 'In this story; link to…' : 'This story'}</option>
            {story.characters.some((c) => !linked.has(c.documentId)) && (
              <optgroup label="A character">
                {story.characters
                  .filter((c) => !linked.has(c.documentId))
                  .map((c) => (
                    <option key={c.documentId} value={`characters:${c.documentId}`}>
                      {c.name}
                    </option>
                  ))}
              </optgroup>
            )}
            {story.scenes.some((s) => !linked.has(s.documentId)) && (
              <optgroup label="A scene">
                {story.scenes.map((s, i) =>
                  linked.has(s.documentId) ? null : (
                    <option key={s.documentId} value={`scenes:${s.documentId}`}>
                      {i + 1}. {s.title}
                    </option>
                  ),
                )}
              </optgroup>
            )}
          </select>
          <button type="submit" className="secondary" disabled={busy || (inStory && !target)}>
            {inStory ? 'Link' : 'Attach'}
          </button>
        </form>
      </div>
    </>
  )
}

/** Any other page: a newspaper archive, a museum record, a book. */
function AddByHand() {
  const { story, backend, run, busy } = useWorkspace()
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!title.trim()) return
    const data = {
      title: title.trim(),
      url: orNull(url),
      kind: 'other',
      accessedOn: today(),
      stories: { connect: [story.documentId] },
    }
    if (await run(() => createEntry(backend, 'sources', data))) {
      setTitle('')
      setUrl('')
    }
  }

  return (
    <details className="add-by-hand">
      <summary>Add a source by hand</summary>
      <form onSubmit={onSubmit} aria-label="New source">
        <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <input type="url" placeholder="https://…" pattern="https?://.*" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button type="submit" disabled={busy}>
          Add source
        </button>
      </form>
    </details>
  )
}
