import { useRef, useState, type FormEvent } from 'react'
import { createEntry, updateEntry, type Backend, type Character, type Scene } from '../cms'
import { describe } from '../errors'
import { elementTypes, matchCharacter, pages, parse, sceneLines, speakers, type Element, type ElementType } from '../screenplay/elements'
import { focusElement } from '../screenplay/focus'
import { SceneEditor } from '../screenplay/SceneEditor'
import { ScriptView } from '../screenplay/ScriptView'
import { castToAdd, draftText, useDrafts, type Draft } from '../screenplay/useDrafts'
import { useWorkspace, WorkspaceContext } from '../workspace/context'
import { label } from '../workspace/format'
import { downloadFountain, readFountainFile, sceneHeading } from '../workspace/fountain'
import { useStory } from '../workspace/useStory'

/** The story's scenes as one screenplay, written in standard screenplay format and kept as Fountain. */
export function Screenplay({ id, backend, signedIn }: { id: string; backend: Backend; signedIn: boolean }) {
  const { workspace, error, changeError, dismiss } = useStory(id, backend, signedIn)
  const back = <a href={`#/stories/${encodeURIComponent(id)}`}>← Story</a>

  if (!workspace) {
    return (
      <section>
        <p>{back}</p>
        {error ? <p role="alert">{error}</p> : <p>Loading…</p>}
      </section>
    )
  }

  return (
    <WorkspaceContext.Provider value={workspace}>
      <article className="sp">
        <p className="no-print">{back}</p>
        {changeError && (
          <p role="alert" className="change-error no-print">
            {changeError}{' '}
            <button type="button" className="link" onClick={dismiss}>
              Dismiss
            </button>
          </p>
        )}
        <ScriptEditor />
      </article>
    </WorkspaceContext.Provider>
  )
}

type View = 'formatted' | 'fountain'

function savedView(): View {
  try {
    return localStorage.getItem('sitlab.screenplay.view') === 'fountain' ? 'fountain' : 'formatted'
  } catch {
    return 'formatted'
  }
}

const transitions = ['CUT TO:', 'SMASH CUT TO:', 'MATCH CUT TO:', 'DISSOLVE TO:', 'FADE TO:', 'FADE OUT.', 'FADE TO BLACK.']

/** 'MRS. O'HARA' → 'Mrs. O'hara', the name a new character gets from a cue. */
const nameFromCue = (cue: string) => cue.toLowerCase().replace(/(^|[\s.-])\p{L}/gu, (m) => m.toUpperCase())

function ScriptEditor() {
  const { story, canEdit, backend, run, busy } = useWorkspace()
  const { draftFor, edit, flush, status, saveError, castOf } = useDrafts(story, backend)
  const [view, setView] = useState<View>(savedView)
  const [focused, setFocused] = useState<{ sceneId: string; elementId: string } | null>(null)
  const [newScene, setNewScene] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const scenes = story.scenes
  const sceneById = (sceneId: string) => scenes.find((s) => s.documentId === sceneId)
  const nextPosition = () => scenes.reduce((max, s) => Math.max(max, s.position ?? -1), -1) + 1

  function chooseView(next: View) {
    setView(next)
    try {
      localStorage.setItem('sitlab.screenplay.view', next)
    } catch {
      // remembering the view is a convenience
    }
  }

  const focusedScene = focused ? sceneById(focused.sceneId) : undefined
  const focusedType = focusedScene && draftFor(focusedScene).elements.find((e) => e.id === focused?.elementId)?.type

  function setFocusedType(type: ElementType) {
    if (!focused || !focusedScene) return
    const active = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null
    edit(focusedScene, (d) => ({ ...d, raw: null, elements: d.elements.map((e) => (e.id === focused.elementId ? { ...e, type } : e)) }))
    focusElement(focused.elementId, active?.selectionStart ?? 0)
  }

  const lines = scenes.reduce((n, s) => n + sceneLines(draftFor(s).elements), 0)
  const states = Object.values(status)
  const saveText = states.includes('error')
    ? (saveError ?? 'Not saved')
    : states.includes('saving')
      ? 'Saving…'
      : states.includes('dirty')
        ? 'Unsaved changes'
        : states.includes('saved')
          ? 'All changes saved'
          : ''

  /** The story with every scene as currently drafted, for export. */
  const drafted = () => ({
    ...story,
    scenes: scenes.map((s) => {
      const d = draftFor(s)
      return { ...s, screenplay: draftText(d) || null, location: d.location.trim() || null, timeOfDay: d.timeOfDay }
    }),
  })

  async function onImport(file: File) {
    setImportError(null)
    try {
      const script = await readFountainFile(file)
      if (script.scenes.length === 0) {
        setImportError(`No scenes were found in “${file.name}”.`)
        return
      }
      const count = script.scenes.length === 1 ? 'one scene' : `${script.scenes.length} scenes`
      if (!window.confirm(`Add ${count} from “${file.name}” after this story's scenes?`)) return
      await flush()
      let position = nextPosition()
      await run(async () => {
        for (const scene of script.scenes) {
          const cast = castToAdd({ elements: parse(scene.screenplay) }, story, new Set())
          await createEntry(backend, 'scenes', {
            ...scene,
            position: position++,
            story: story.documentId,
            ...(cast.length ? { characters: { connect: cast } } : {}),
          })
        }
      })
    } catch (e) {
      setImportError(describe(e, backend))
    }
  }

  async function onAddScene(event: FormEvent) {
    event.preventDefault()
    if (!newScene.trim()) return
    await flush()
    if (await run(() => createEntry(backend, 'scenes', { title: newScene.trim(), position: nextPosition(), story: story.documentId }))) setNewScene('')
  }

  function addCharacter(scene: Scene, cue: string) {
    void run(async () => {
      const created = await createEntry<Character>(backend, 'characters', {
        name: nameFromCue(cue),
        role: 'minor',
        stories: { connect: [story.documentId] },
      })
      await updateEntry(backend, 'scenes', scene.documentId, { characters: { connect: [created.data.documentId] } })
    })
  }

  // cue suggestions: the story's characters, then names already speaking
  const cues = [...new Set([...story.characters.map((c) => c.name.toUpperCase()), ...scenes.flatMap((s) => speakers(draftFor(s).elements))])]

  return (
    <>
      <header className="sp-head no-print">
        <h1>{story.title}</h1>
        <p className="muted">
          Screenplay · {scenes.length === 1 ? '1 scene' : `${scenes.length} scenes`} · about {Math.max(1, Math.round(pages(lines) * 10) / 10)}{' '}
          {pages(lines) <= 1 ? 'page' : 'pages'}
          {saveText && (
            <>
              {' · '}
              <span role="status" className={states.includes('error') ? 'sp-error' : undefined}>
                {saveText}
              </span>
            </>
          )}
        </p>
      </header>

      <div className="sp-toolbar no-print" role="toolbar" aria-label="Screenplay">
        {canEdit && (
          <div className="sp-views" role="group" aria-label="View">
            {(['formatted', 'fountain'] as const).map((v) => (
              <button key={v} type="button" className={view === v ? undefined : 'secondary'} aria-pressed={view === v} onClick={() => chooseView(v)}>
                {v === 'formatted' ? 'Formatted' : 'Fountain'}
              </button>
            ))}
          </div>
        )}
        {canEdit && view === 'formatted' && (
          <div className="sp-types" role="group" aria-label="Element type (Tab)">
            {elementTypes.map((t) => (
              <button
                key={t}
                type="button"
                className={focusedType === t ? undefined : 'secondary'}
                aria-pressed={focusedType === t}
                disabled={!focusedType}
                // keeps the caret in the script
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setFocusedType(t)}
              >
                {label(t)}
              </button>
            ))}
          </div>
        )}
        <div className="sp-files">
          {canEdit && (
            <>
              <button type="button" className="secondary" disabled={busy} onClick={() => fileInput.current?.click()}>
                Import .fountain
              </button>
              <input
                ref={fileInput}
                type="file"
                accept=".fountain,.spmd,.txt,text/plain"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (file) void onImport(file)
                }}
              />
            </>
          )}
          {scenes.length > 0 && (
            <>
              <button type="button" className="secondary" onClick={() => downloadFountain(drafted())}>
                Export .fountain
              </button>
              <button type="button" className="secondary" onClick={() => window.print()}>
                Print / PDF
              </button>
            </>
          )}
        </div>
      </div>
      {importError && (
        <p role="alert" className="change-error no-print">
          {importError}{' '}
          <button type="button" className="link" onClick={() => setImportError(null)}>
            Dismiss
          </button>
        </p>
      )}
      {canEdit && view === 'formatted' && (
        <p className="muted sp-hint no-print">
          Enter starts the next element, Shift+Enter a new line inside one. Tab and Shift+Tab change the type. Lines are saved as you type.
        </p>
      )}

      <div className="sp-layout">
        {scenes.length > 1 && (
          <nav className="sp-nav no-print" aria-label="Scenes">
            <ol>
              {scenes.map((s) => (
                <li key={s.documentId}>
                  <button
                    type="button"
                    className="link"
                    onClick={() => document.getElementById(`scene-${s.documentId}`)?.scrollIntoView({ behavior: 'smooth' })}
                  >
                    {s.title}
                  </button>
                </li>
              ))}
            </ol>
          </nav>
        )}

        <div className="sp-page">
          <div className="sp-title-page print-only">
            <p className="sp-title">{story.title}</p>
            {story.logline && <p>{story.logline}</p>}
          </div>

          {scenes.length === 0 && (
            <p className="muted no-print">No scenes yet. Add one below, or import a Fountain file{canEdit ? '' : ' after signing in'}.</p>
          )}

          {canEdit && (
            <div className="sp-edit no-print">
              {scenes.map((s, i) => (
                <div key={s.documentId}>
                  <SceneEditor
                    scene={s}
                    index={i}
                    draft={draftFor(s)}
                    view={view}
                    onChange={(change) => edit(s, change)}
                    onFocusElement={(el: Element | null) => setFocused(el ? { sceneId: s.documentId, elementId: el.id } : null)}
                  />
                  <Cast scene={s} draft={draftFor(s)} cast={castOf(s)} onAdd={(cue) => addCharacter(s, cue)} busy={busy} />
                </div>
              ))}
              <form onSubmit={onAddScene} aria-label="New scene" className="sp-new">
                <input placeholder="New scene" value={newScene} onChange={(e) => setNewScene(e.target.value)} required />
                <button type="submit" disabled={busy}>
                  Add scene
                </button>
              </form>
            </div>
          )}

          <div className={canEdit ? 'sp-print print-only' : 'sp-print'}>
            {scenes.map((s) => {
              const d = draftFor(s)
              return (
                <section key={s.documentId} className="sp-scene" id={canEdit ? undefined : `scene-${s.documentId}`}>
                  <div className="sp-el sp-heading">
                    <p>{sceneHeading({ title: s.title, location: d.location.trim() || null, timeOfDay: d.timeOfDay }).replace(/^\./, '')}</p>
                  </div>
                  <ScriptView elements={d.elements} />
                </section>
              )
            })}
          </div>
        </div>
      </div>

      <datalist id="sp-cues">
        {cues.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <datalist id="sp-transitions">
        {transitions.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </>
  )
}

/** Who is in a scene, and the speakers who are not characters of the story yet. */
function Cast({ scene, draft, cast, onAdd, busy }: { scene: Scene; draft: Draft; cast: Set<string>; onAdd: (cue: string) => void; busy: boolean }) {
  const { story } = useWorkspace()
  const talking = speakers(draft.elements)
  const strangers = talking.filter((name) => !matchCharacter(name, story.characters))
  const inScene = story.characters.filter((c) => cast.has(c.documentId) || talking.some((n) => matchCharacter(n, story.characters) === c))
  if (inScene.length === 0 && strangers.length === 0) return null
  return (
    <div className="sp-cast chips" aria-label={`Cast of ${scene.title}`}>
      {inScene.map((c) => (
        <span key={c.documentId} className="tag person">
          {c.name}
        </span>
      ))}
      {strangers.map((name) => (
        <button key={name} type="button" className="tag" disabled={busy} title="Add as a character of this story" onClick={() => onAdd(name)}>
          + {nameFromCue(name)}
        </button>
      ))}
    </div>
  )
}
