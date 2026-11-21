/**
 * The story's scenes as one screenplay in Fountain (https://fountain.io), the plain-text format
 * that Highland, Fade In, WriterSolo, Slugline and Final Draft import.
 */
import type { Scene, StoryDetail } from '../cms'

/** INT./EXT. and friends start a scene heading on their own; anything else needs Fountain's leading dot. */
const standardHeading = /^(int|ext|est|int\.?\/ext|i\/e)[. ]/i

export function sceneHeading(scene: Pick<Scene, 'title' | 'location' | 'timeOfDay'>): string {
  const place = (scene.location ?? scene.title).trim().replace(/\s+/g, ' ')
  const heading = [place, scene.timeOfDay].filter(Boolean).join(' - ').toUpperCase()
  return standardHeading.test(heading) ? heading : `.${heading}`
}

/** One line per value; Fountain title-page values that wrap are indented. */
function titleField(key: string, value: string): string {
  const lines = value.trim().split(/\r?\n/).filter((l) => l.trim())
  if (lines.length <= 1) return `${key}: ${lines[0] ?? ''}`
  return `${key}:\n${lines.map((l) => `   ${l.trim()}`).join('\n')}`
}

export function toFountain(story: Pick<StoryDetail, 'title' | 'logline' | 'scenes'>, draftDate = new Date()): string {
  const titlePage = [titleField('Title', story.title), titleField('Draft date', draftDate.toISOString().slice(0, 10))]
  if (story.logline?.trim()) titlePage.push(titleField('Notes', story.logline))

  const scenes = [...story.scenes]
    .sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity))
    .map((scene) => {
      const parts = [sceneHeading(scene)]
      // a synopsis line (=) is kept by screenwriting apps but not printed
      if (scene.summary?.trim()) parts.push(scene.summary.trim().split(/\r?\n/).map((l) => `= ${l}`).join('\n'))
      if (scene.screenplay?.trim()) parts.push(scene.screenplay.replace(/\r\n?/g, '\n').trim())
      return parts.join('\n\n')
    })

  return [titlePage.join('\n'), ...scenes].join('\n\n') + '\n'
}

/** 'The Lighthouse!' → 'the-lighthouse' */
export const fileSlug = (title: string) =>
  title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'screenplay'

/** Saves the screenplay as `<title>.fountain`. */
export function downloadFountain(story: Pick<StoryDetail, 'title' | 'logline' | 'scenes'>): void {
  const blob = new Blob([toFountain(story)], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${fileSlug(story.title)}.fountain`
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

// --- import -----------------------------------------------------------------------------------

/** A scene read from a Fountain file, shaped like the scene fields it fills. */
export type ImportedScene = {
  title: string
  location: string | null
  timeOfDay: Scene['timeOfDay']
  summary: string | null
  screenplay: string | null
}

export type ImportedScript = { title: string | null; scenes: ImportedScene[] }

const headingLine = /^(?:(?:int|ext|est|int\.?\/ext|i\/e)[. ]|\.(?=[^.\s]))/i
const titleKey = /^([A-Za-z][A-Za-z ]*):(.*)$/

/** Time-of-day words that map onto the scene's choices; anything else stays part of the location. */
const times: Record<string, Scene['timeOfDay']> = {
  DAY: 'day',
  NIGHT: 'night',
  DAWN: 'dawn',
  DUSK: 'dusk',
  CONTINUOUS: 'continuous',
  MORNING: 'dawn',
  SUNRISE: 'dawn',
  EVENING: 'dusk',
  SUNSET: 'dusk',
}

/** 'INT. LIGHTHOUSE - NIGHT #12#' → location 'INT. LIGHTHOUSE', time 'night'. A forced '.HEADING' loses its dot. */
export function readHeading(line: string): Pick<ImportedScene, 'title' | 'location' | 'timeOfDay'> {
  let text = line.trim().replace(/\s*#[^#]*#\s*$/, '')
  if (text.startsWith('.')) text = text.slice(1).trim()
  let timeOfDay: Scene['timeOfDay'] = null
  const dash = /^(.*\S)\s+[-–—]\s+([^-–—]+)$/.exec(text)
  if (dash && times[dash[2].trim().toUpperCase()]) {
    text = dash[1]
    timeOfDay = times[dash[2].trim().toUpperCase()]
  }
  const place = text.replace(/^(int\.?\/ext|i\/e|int|ext|est)[. ]\s*/i, '').trim() || text
  const title = place.toLowerCase().replace(/(^|[\s/-])\p{L}/gu, (m) => m.toUpperCase())
  return { title, location: text.toUpperCase(), timeOfDay }
}

/**
 * Reads a Fountain screenplay into scenes: every scene heading starts one, the `=` synopsis lines
 * right after it become the summary, and the rest is its screenplay text, kept as written.
 * Text before the first heading (FADE IN:, a cold open) goes to the top of the first scene.
 */
export function fromFountain(source: string): ImportedScript {
  let lines = source.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n')

  // the title page: key: value lines (values may continue on indented lines) up to the first blank line
  let title: string | null = null
  if (titleKey.test(lines[0] ?? '') && !headingLine.test(lines[0])) {
    const end = lines.findIndex((l) => !l.trim())
    const page = lines.slice(0, end === -1 ? lines.length : end)
    let key = ''
    const values: Record<string, string[]> = {}
    for (const line of page) {
      const kv = /^\s/.test(line) ? null : titleKey.exec(line)
      if (kv) {
        key = kv[1].trim().toLowerCase()
        values[key] = kv[2].trim() ? [kv[2].trim()] : []
      } else if (key) values[key].push(line.trim())
    }
    title = values.title?.join(' ').replace(/[*_]/g, '').trim() || null
    lines = lines.slice(page.length)
  }

  const scenes: ImportedScene[] = []
  const preamble: string[] = []
  let body: string[] = preamble
  for (const [i, line] of lines.entries()) {
    const startsBlock = i === 0 || !lines[i - 1].trim()
    if (startsBlock && headingLine.test(line.trim())) {
      const scene = { ...readHeading(line), summary: null, screenplay: null, lines: [] as string[] }
      scenes.push(scene as ImportedScene & { lines: string[] })
      body = scene.lines
      continue
    }
    body.push(line)
  }

  const finished = (scenes as (ImportedScene & { lines: string[] })[]).map(({ lines: own, ...scene }, i) => {
    const text = own.join('\n').trim().split('\n')
    const synopsis: string[] = []
    while (text.length && /^=(?!==)/.test(text[0].trim())) synopsis.push(text.shift()!.trim().slice(1).trim())
    const opening = i === 0 ? preamble.join('\n').trim() : ''
    const screenplay = [opening, text.join('\n').trim()].filter(Boolean).join('\n\n')
    return { ...scene, summary: synopsis.join('\n') || null, screenplay: screenplay || null }
  })

  if (finished.length === 0) {
    const screenplay = preamble.join('\n').trim()
    if (screenplay) finished.push({ title: 'Scene 1', location: null, timeOfDay: null, summary: null, screenplay })
  }
  return { title, scenes: finished }
}

/** Reads a chosen .fountain (or .txt) file. */
export const readFountainFile = async (file: File) => fromFountain(await file.text())
