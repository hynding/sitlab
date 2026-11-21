/** Small form pieces shared by the workspace sections. */
import { beatMoods, type Beat } from '../cms'
import { moved } from './edit'
import { label } from './format'

export function Choice<T extends string>({
  value,
  options,
  onChange,
  empty,
  ...rest
}: {
  value: T | null
  options: readonly T[]
  onChange: (value: T | null) => void
  /** Offers a blank choice, for an optional field. */
  empty?: string
  'aria-label'?: string
}) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange((e.target.value || null) as T | null)} {...rest}>
      {empty !== undefined && <option value="">{empty}</option>}
      {options.map((o) => (
        <option key={o} value={o}>
          {label(o)}
        </option>
      ))}
    </select>
  )
}

/** A numbered list of beats with their mood, as on plot lines and character arcs. */
export function BeatList({ beats }: { beats: Beat[] }) {
  if (beats.length === 0) return null
  return (
    <ol className="beats">
      {beats.map((b) => (
        <li key={b.id}>
          <span className={`mood mood-${b.mood}`}>{label(b.mood)}</span> <strong>{b.title}</strong>
          {b.description && <span className="muted"> {b.description}</span>}
        </li>
      ))}
    </ol>
  )
}

/** Edits a list of beats: add, reorder, remove. Saved entries keep their id so the CMS updates them in place. */
export function BeatsEditor({ beats, onChange, legend = 'Beats' }: { beats: Beat[]; onChange: (beats: Beat[]) => void; legend?: string }) {
  const setBeat = (i: number, patch: Partial<Beat>) => onChange(beats.map((b, j) => (j === i ? { ...b, ...patch } : b)))
  return (
    <fieldset>
      <legend>{legend}</legend>
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
            <button type="button" className="link" disabled={i === 0} onClick={() => onChange(moved(beats, i, -1))} aria-label="Move up">
              ↑
            </button>
            <button
              type="button"
              className="link"
              disabled={i === beats.length - 1}
              onClick={() => onChange(moved(beats, i, 1))}
              aria-label="Move down"
            >
              ↓
            </button>
            <button type="button" className="link" onClick={() => onChange(beats.filter((_, j) => j !== i))}>
              Remove
            </button>
          </div>
        </div>
      ))}
      <button type="button" className="secondary" onClick={() => onChange([...beats, { title: '', description: null, mood: 'neutral' }])}>
        Add beat
      </button>
    </fieldset>
  )
}
