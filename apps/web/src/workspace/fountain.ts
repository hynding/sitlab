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
