import { useLayoutEffect, useRef, type KeyboardEvent, type RefObject } from 'react'
import { timesOfDay, type Scene } from '../cms'
import { label } from '../workspace/format'
import { useWorkspace } from '../workspace/context'
import { cycleType, element, looksLikeCue, nextType, parse, serialize, type Element, type ElementType } from './elements'
import { focusElement, takeFocus } from './focus'
import type { Draft } from './useDrafts'

/** Puts the caret in an element's field now. */
function jump(id: string, caret: number): void {
  const field = document.getElementById(`sp-${id}`) as HTMLInputElement | HTMLTextAreaElement | null
  if (!field) return
  field.focus()
  const at = Math.min(caret, field.value.length)
  field.setSelectionRange(at, at)
}

const placeholders: Record<ElementType, string> = {
  action: 'What we see and hear',
  character: 'NAME',
  parenthetical: 'beat',
  dialogue: 'What they say',
  transition: 'CUT TO:',
}

/** Uppercase as typed: cues and transitions are written in capitals. */
const capitals = (type: ElementType) => type === 'character' || type === 'transition'

type Props = {
  scene: Scene
  index: number
  draft: Draft
  view: 'formatted' | 'fountain'
  onChange: (change: (draft: Draft) => Draft) => void
  onFocusElement: (element: Element | null) => void
}

/** One scene of the script: its heading and its lines, edited in place. */
export function SceneEditor({ scene, index, draft, view, onChange, onFocusElement }: Props) {
  const { story } = useWorkspace()
  const elements = draft.elements
  const setElements = (change: (els: Element[]) => Element[]) => onChange((d) => ({ ...d, elements: change(d.elements), raw: null }))

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>, i: number) {
    if (event.nativeEvent.isComposing) return
    const el = elements[i]
    const field = event.currentTarget
    const start = field.selectionStart ?? 0
    const end = field.selectionEnd ?? start

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      // Enter on an empty cue, parenthetical, line or transition turns it back into action
      if (!el.text.trim() && el.type !== 'action') {
        setElements((els) => els.map((e) => (e.id === el.id ? { ...e, type: 'action' } : e)))
        focusElement(el.id, 0)
        return
      }
      const before = el.text.slice(0, start)
      const after = el.text.slice(end)
      // a known name typed in capitals as action is a cue
      const type = el.type === 'action' && !after.trim() && looksLikeCue(before, story.characters) ? 'character' : el.type
      const added = element(nextType[type], after.trimStart())
      setElements((els) => els.flatMap((e) => (e.id === el.id ? [{ ...e, type, text: before.trimEnd() }, added] : [e])))
      focusElement(added.id, 0)
      return
    }

    if (event.key === 'Tab') {
      event.preventDefault()
      setElements((els) => els.map((e) => (e.id === el.id ? { ...e, type: cycleType(e.type, event.shiftKey ? -1 : 1) } : e)))
      focusElement(el.id, start)
      return
    }

    if (event.key === 'Escape') {
      field.blur()
      return
    }

    if (event.key === 'Backspace' && start === 0 && end === 0 && i > 0) {
      event.preventDefault()
      const prev = elements[i - 1]
      // joins this line onto the one before it
      setElements((els) => els.filter((e) => e.id !== el.id).map((e) => (e.id === prev.id ? { ...e, text: e.text + el.text } : e)))
      focusElement(prev.id, prev.text.length)
      return
    }

    if (event.key === 'ArrowUp' && start === 0 && end === 0 && i > 0) {
      event.preventDefault()
      jump(elements[i - 1].id, elements[i - 1].text.length)
    } else if (event.key === 'ArrowDown' && start === el.text.length && end === start && i < elements.length - 1) {
      event.preventDefault()
      jump(elements[i + 1].id, 0)
    }
  }

  return (
    <section className="sp-scene" id={`scene-${scene.documentId}`} aria-label={`Scene ${index + 1}: ${scene.title}`}>
      <div className="sp-margin muted">
        {index + 1}. {scene.title}
      </div>
      <div className="sp-el sp-heading">
        <input
          className="sp-location"
          aria-label="Location"
          placeholder={scene.title.toUpperCase()}
          size={Math.max(draft.location.length, scene.title.length, 8) + 1}
          value={draft.location}
          onChange={(e) => {
            const location = e.target.value.toUpperCase()
            onChange((d) => ({ ...d, location }))
          }}
        />
        <span aria-hidden="true"> - </span>
        <select
          aria-label="Time of day"
          value={draft.timeOfDay ?? ''}
          onChange={(e) => {
            const timeOfDay = (e.target.value || null) as Scene['timeOfDay']
            onChange((d) => ({ ...d, timeOfDay }))
          }}
        >
          <option value="">—</option>
          {timesOfDay.map((t) => (
            <option key={t} value={t}>
              {label(t).toUpperCase()}
            </option>
          ))}
        </select>
      </div>
      {view === 'fountain' ? (
        <Growing
          className="sp-fountain"
          aria-label={`Scene ${index + 1} in Fountain`}
          placeholder={'Action.\n\nNAME\n(beat)\nDialogue.\n\nCUT TO:'}
          value={draft.raw ?? serialize(elements)}
          onChange={(text) => onChange((d) => ({ ...d, raw: text, elements: withOne(parse(text)) }))}
          onFocus={() => onFocusElement(null)}
        />
      ) : (
        elements.map((el, i) => (
          <div key={el.id} className={`sp-el sp-${el.type}`} data-type={label(el.type)}>
            {el.type === 'character' || el.type === 'transition' ? (
              <Field
                el={el}
                list={el.type === 'character' ? 'sp-cues' : 'sp-transitions'}
                onText={(text) => setElements((els) => els.map((e) => (e.id === el.id ? { ...e, text } : e)))}
                onKeyDown={(e) => onKeyDown(e, i)}
                onFocus={() => onFocusElement(el)}
              />
            ) : (
              <>
                {el.type === 'parenthetical' && <span aria-hidden="true">(</span>}
                <Growing
                  id={el.id}
                  fit={el.type === 'parenthetical'}
                  aria-label={label(el.type)}
                  placeholder={placeholders[el.type]}
                  value={el.text}
                  onChange={(text) => setElements((els) => els.map((e) => (e.id === el.id ? { ...e, text } : e)))}
                  onKeyDown={(e) => onKeyDown(e, i)}
                  onFocus={() => onFocusElement(el)}
                />
                {el.type === 'parenthetical' && <span aria-hidden="true">)</span>}
              </>
            )}
          </div>
        ))
      )}
    </section>
  )
}

/** The formatted view always has a line to type in. */
const withOne = (els: Element[]) => (els.length ? els : [element('action')])

/** Moves the caret into a field that was asked to take it. */
function useTakeFocus(id: string | undefined, ref: RefObject<HTMLTextAreaElement | HTMLInputElement | null>) {
  useLayoutEffect(() => {
    if (!id || !ref.current) return
    const caret = takeFocus(id)
    if (caret === null) return
    const at = Math.min(caret, ref.current.value.length)
    ref.current.focus()
    ref.current.setSelectionRange(at, at)
  })
}

/** A single-line field with suggestions, for cues and transitions. */
function Field({
  el,
  list,
  onText,
  onKeyDown,
  onFocus,
}: {
  el: Element
  list: string
  onText: (text: string) => void
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void
  onFocus: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useTakeFocus(el.id, ref)
  return (
    <input
      ref={ref}
      id={`sp-${el.id}`}
      aria-label={label(el.type)}
      list={list}
      placeholder={placeholders[el.type]}
      value={el.text}
      onChange={(e) => onText(capitals(el.type) ? e.target.value.toUpperCase() : e.target.value)}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
    />
  )
}

/** A textarea that grows with its text, so the script reads as one page rather than a stack of boxes. */
function Growing({
  id,
  fit,
  value,
  onChange,
  ...rest
}: {
  id?: string
  /** As wide as its text (up to the element's width), so a parenthetical closes right after it. */
  fit?: boolean
  value: string
  onChange: (text: string) => void
  className?: string
  placeholder?: string
  'aria-label'?: string
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void
  onFocus?: () => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useTakeFocus(id, ref)
  useLayoutEffect(() => {
    const field = ref.current
    if (!field) return
    const grow = () => {
      field.style.height = 'auto'
      field.style.height = `${field.scrollHeight}px`
    }
    grow()
    // a narrower window wraps the text onto more lines
    const observer = new ResizeObserver(grow)
    observer.observe(field.parentElement ?? field)
    return () => observer.disconnect()
  }, [value])
  const style = fit ? { width: `${Math.max(value.length, rest.placeholder?.length ?? 0) + 1}ch`, maxWidth: '100%', flex: '0 1 auto' } : undefined
  return <textarea ref={ref} id={id && `sp-${id}`} rows={1} style={style} value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
}
