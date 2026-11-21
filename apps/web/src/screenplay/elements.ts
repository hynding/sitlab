/**
 * A scene's screenplay as a list of elements (action, character cue, parenthetical, dialogue,
 * transition), read from and written back to the Fountain text kept in `Scene.screenplay`.
 *
 * Only the scene body lives here: the scene heading comes from the scene's location and time of
 * day (see ../workspace/fountain.ts). Anything Fountain can say that the editor has no element for
 * (notes, sections, synopses, centered text, a heading typed by hand) is kept as action text,
 * unchanged, so it survives a round trip and still exports.
 */

export const elementTypes = ['action', 'character', 'parenthetical', 'dialogue', 'transition'] as const
export type ElementType = (typeof elementTypes)[number]

export type Element = { id: string; type: ElementType; text: string }

let counter = 0
/** Ids only key React lists; they are not saved. */
export const element = (type: ElementType, text = ''): Element => ({ id: `el${++counter}`, type, text })

const hasLetter = /\p{L}/u
const hasLower = /\p{Ll}/u

/** All capitals: STEEL, MRS. O'HARA (V.O.). Extensions in parentheses may be in any case. */
const isUpper = (line: string) => hasLetter.test(line) && !hasLower.test(line.replace(/\([^)]*\)/g, ''))

const isTransitionLine = (line: string) =>
  (line.startsWith('>') && !line.trimEnd().endsWith('<')) || (isUpper(line) && /TO:$/.test(line.trim()))

const isParenthetical = (line: string) => /^\(.*\)$/.test(line.trim())

/** Reads a scene body written in Fountain. */
export function parse(text: string | null | undefined): Element[] {
  const elements: Element[] = []
  const paragraphs = (text ?? '')
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n/)
    .map((p) => p.replace(/^\n+|\s+$/g, ''))
    .filter((p) => p.trim())

  for (const paragraph of paragraphs) {
    const lines = paragraph.split('\n')
    const first = lines[0].trim()

    if (first.startsWith('!')) {
      elements.push(element('action', paragraph.trimStart().slice(1)))
      continue
    }

    const forcedCue = first.startsWith('@')
    if (lines.length > 1 && (forcedCue || isUpper(first))) {
      elements.push(element('character', forcedCue ? first.slice(1).trim() : first))
      let dialogue: string[] = []
      const flush = () => {
        if (dialogue.length) elements.push(element('dialogue', dialogue.join('\n')))
        dialogue = []
      }
      for (const line of lines.slice(1)) {
        if (isParenthetical(line)) {
          flush()
          elements.push(element('parenthetical', line.trim().slice(1, -1).trim()))
        } else {
          dialogue.push(line.trim())
        }
      }
      flush()
      continue
    }

    if (lines.length === 1 && isTransitionLine(first)) {
      elements.push(element('transition', first.startsWith('>') ? first.slice(1).trim() : first))
      continue
    }

    elements.push(element('action', paragraph))
  }
  return elements
}

/** Writes elements back as Fountain, forcing an element's type wherever Fountain would read it as another. */
export function serialize(elements: Element[]): string {
  const out: string[] = []
  let inDialogue = false

  for (const el of elements) {
    const text = el.text.replace(/\r\n?/g, '\n').trim()
    if (!text) continue

    switch (el.type) {
      case 'character': {
        const cue = text.replace(/\s+/g, ' ')
        out.push((out.length ? '\n\n' : '') + (isUpper(cue) ? cue : `@${cue}`))
        inDialogue = true
        break
      }
      case 'parenthetical':
      case 'dialogue': {
        const line =
          el.type === 'parenthetical'
            ? `(${text.replace(/^\(|\)$/g, '').replace(/\s+/g, ' ')})`
            : // a blank line would end the speech
              text.replace(/\n\s*\n/g, '\n')
        if (inDialogue) out.push('\n' + line)
        else {
          // dialogue with no cue before it reads as action
          out.push((out.length ? '\n\n' : '') + `!${line}`)
        }
        break
      }
      case 'transition': {
        const t = text.replace(/\s+/g, ' ')
        out.push((out.length ? '\n\n' : '') + (isUpper(t) && /TO:$/.test(t) ? t : `> ${t}`))
        inDialogue = false
        break
      }
      default: {
        const lines = text.split('\n')
        const misread =
          (lines.length > 1 && (isUpper(lines[0]) || lines[0].startsWith('@'))) ||
          (lines.length === 1 && isTransitionLine(lines[0])) ||
          lines[0].startsWith('!')
        // blank lines inside action split it into paragraphs, which read back as separate actions
        out.push((out.length ? '\n\n' : '') + (misread ? `!${text}` : text))
        inDialogue = false
      }
    }
  }
  return out.join('')
}

/** What Enter starts after an element of each type. */
export const nextType: Record<ElementType, ElementType> = {
  action: 'action',
  character: 'dialogue',
  parenthetical: 'dialogue',
  dialogue: 'action',
  transition: 'action',
}

/** Tab steps through the types in this order; Shift+Tab goes back. */
export function cycleType(type: ElementType, by: 1 | -1): ElementType {
  const order: ElementType[] = ['action', 'character', 'parenthetical', 'dialogue', 'transition']
  return order[(order.indexOf(type) + by + order.length) % order.length]
}

/** 'ADA (V.O.)', '@McCoy', "ADA (CONT'D) ^" → the name the cue refers to, in capitals. */
export function speakerName(cue: string): string {
  return cue
    .replace(/^@/, '')
    .replace(/\^\s*$/, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

/** The distinct names that speak, in order of first line. */
export function speakers(elements: Element[]): string[] {
  const names = elements.filter((e) => e.type === 'character').map((e) => speakerName(e.text))
  return [...new Set(names.filter(Boolean))]
}

/**
 * Finds the story character a cue refers to: the whole name ("ADA LOVELACE"), or the first name
 * ("ADA") when only one character has it.
 */
export function matchCharacter<C extends { name: string }>(speaker: string, characters: C[]): C | undefined {
  const upper = (s: string) => s.trim().replace(/\s+/g, ' ').toUpperCase()
  const exact = characters.find((c) => upper(c.name) === speaker)
  if (exact) return exact
  const byFirst = characters.filter((c) => upper(c.name).split(' ')[0] === speaker)
  return byFirst.length === 1 ? byFirst[0] : undefined
}

/** Characters per line in standard screenplay layout (Courier 12pt). */
const widths: Record<ElementType, number> = { action: 61, character: 38, parenthetical: 25, dialogue: 35, transition: 61 }

function lineCount(text: string, width: number): number {
  return text.split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / width)), 0)
}

/** Printed lines a scene takes: heading, then each element, with blank lines where they print. */
export function sceneLines(elements: Element[]): number {
  let lines = 2 // the heading and the blank line after it
  let prev: ElementType | null = null
  for (const el of elements) {
    if (!el.text.trim()) continue
    const joined = (el.type === 'dialogue' || el.type === 'parenthetical') && prev !== null && prev !== 'action' && prev !== 'transition'
    lines += (prev === null || joined ? 0 : 1) + lineCount(el.text.trim(), widths[el.type])
    prev = el.type
  }
  return lines + 1
}

/** A script page holds about 55 lines, which is why a page runs about a minute of screen time. */
export const pages = (lines: number) => lines / 55

/** True for a line typed in capitals that names one of the story's characters, so it is a cue. */
export function looksLikeCue<C extends { name: string }>(line: string, characters: C[]): boolean {
  const text = line.trim()
  return isUpper(text) && !text.includes('\n') && matchCharacter(speakerName(text), characters) !== undefined
}
