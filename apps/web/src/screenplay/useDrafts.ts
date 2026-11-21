import { useCallback, useEffect, useRef, useState } from 'react'
import { updateEntry, type Backend, type Scene, type StoryDetail } from '../cms'
import { describe } from '../errors'
import { orNull } from '../workspace/format'
import { element, matchCharacter, parse, serialize, speakers, type Element } from './elements'

/** A scene as the editor holds it until it is saved. */
export type Draft = {
  elements: Element[]
  /** The Fountain text as typed in the Fountain view; null once the formatted view has edited it. */
  raw: string | null
  location: string
  timeOfDay: Scene['timeOfDay']
}

export type SaveState = 'dirty' | 'saving' | 'saved' | 'error'

const loaded = new WeakMap<Scene, Draft>()

/** The draft of a scene as loaded. One per loaded scene, so its element ids stay put across renders. */
export function fromScene(scene: Scene): Draft {
  const cached = loaded.get(scene)
  if (cached) return cached
  const elements = parse(scene.screenplay)
  const draft: Draft = {
    elements: elements.length ? elements : [element('action')],
    raw: null,
    location: scene.location ?? '',
    timeOfDay: scene.timeOfDay,
  }
  loaded.set(scene, draft)
  return draft
}

/** The Fountain text a draft saves. */
export const draftText = (draft: Draft) => (draft.raw ?? serialize(draft.elements)).trim()

/** The cast ids a scene's saved lines add: speakers who are story characters not yet in the scene. */
export function castToAdd(draft: Pick<Draft, 'elements'>, story: Pick<StoryDetail, 'characters'>, cast: Set<string>): string[] {
  const ids = speakers(draft.elements).map((name) => matchCharacter(name, story.characters)?.documentId)
  return [...new Set(ids.filter((id): id is string => id !== undefined && !cast.has(id)))]
}

const autosaveDelay = 1000

/**
 * Holds edited scenes and saves each one a second after its last change. Saves of one scene run
 * in order; leaving the page saves what is pending. Saving also adds every story character who
 * speaks in the scene to its cast.
 */
export function useDrafts(story: StoryDetail, backend: Backend) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [status, setStatus] = useState<Record<string, SaveState>>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  // read by saves that start after the render that scheduled them
  const draftsRef = useRef(drafts)
  const storyRef = useRef(story)
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const queue = useRef(new Map<string, Promise<void>>())
  /** Characters this page has added to each scene's cast since the story was loaded. */
  const linked = useRef(new Map<string, Set<string>>())

  useEffect(() => {
    draftsRef.current = drafts
    storyRef.current = story
  })

  const castOf = useCallback(
    (scene: Scene) => new Set([...scene.characters.map((c) => c.documentId), ...(linked.current.get(scene.documentId) ?? [])]),
    [],
  )

  const save = useCallback(
    (id: string): Promise<void> => {
      clearTimeout(timers.current.get(id))
      timers.current.delete(id)
      const next = (queue.current.get(id) ?? Promise.resolve()).then(async () => {
        const draft = draftsRef.current[id]
        const scene = storyRef.current.scenes.find((s) => s.documentId === id)
        if (!draft || !scene) return
        const add = castToAdd(draft, storyRef.current, castOf(scene))
        const text = draftText(draft)
        setStatus((s) => ({ ...s, [id]: 'saving' }))
        try {
          await updateEntry(backend, 'scenes', id, {
            screenplay: text || null,
            location: orNull(draft.location),
            timeOfDay: draft.timeOfDay,
            ...(add.length ? { characters: { connect: add } } : {}),
          })
          linked.current.set(id, new Set([...(linked.current.get(id) ?? []), ...add]))
          setStatus((s) => ({ ...s, [id]: timers.current.has(id) ? 'dirty' : 'saved' }))
        } catch (e) {
          setStatus((s) => ({ ...s, [id]: 'error' }))
          setSaveError(describe(e, backend))
        }
      })
      queue.current.set(id, next)
      return next
    },
    [backend, castOf],
  )

  const edit = useCallback(
    (scene: Scene, change: (draft: Draft) => Draft) => {
      const id = scene.documentId
      setDrafts((prev) => ({ ...prev, [id]: change(prev[id] ?? fromScene(scene)) }))
      setStatus((s) => (s[id] === 'dirty' ? s : { ...s, [id]: 'dirty' }))
      setSaveError(null)
      clearTimeout(timers.current.get(id))
      timers.current.set(
        id,
        setTimeout(() => void save(id), autosaveDelay),
      )
    },
    [save],
  )

  /** Saves every scene with a change waiting. */
  const flush = useCallback(() => Promise.all([...timers.current.keys()].map((id) => save(id))), [save])

  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const id of [...pending.keys()]) void save(id)
    }
  }, [save])

  const unsaved = Object.values(status).some((s) => s === 'dirty' || s === 'saving' || s === 'error')
  useEffect(() => {
    if (!unsaved) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsaved])

  const draftFor = useCallback((scene: Scene) => drafts[scene.documentId] ?? fromScene(scene), [drafts])

  return { draftFor, edit, flush, status, saveError, castOf }
}
