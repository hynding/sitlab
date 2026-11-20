/** Helpers for the workspace's edit forms. */
import { deleteFile, type Backend, type Beat, type Media, type StoryboardFrame } from '../cms'
import { orNull } from './format'

/** Moves one entry of a list by `by` places. */
export function moved<T>(list: T[], i: number, by: number): T[] {
  const next = [...list]
  const [item] = next.splice(i, 1)
  next.splice(i + by, 0, item)
  return next
}

/** Beats as saved: blank ones dropped, text trimmed. The array's order is the beats' order. */
export const cleanBeats = (beats: Beat[]): Beat[] =>
  beats.filter((b) => b.title.trim()).map((b) => ({ ...b, title: b.title.trim(), description: orNull(b.description ?? '') }))

/** The storyboard as the scene form sends it: components keep their id, images go by file id. */
export const storyboardData = (frames: StoryboardFrame[]) =>
  frames.map(({ id, caption, shot, image }) => ({ ...(id ? { id } : {}), caption: orNull(caption ?? ''), shot, image: image?.id ?? null }))

/** Deletes uploads the scene form ended up not using. Best effort: an orphan only takes space in the media library. */
export async function deleteUnused(backend: Backend, uploaded: Media[], kept: StoryboardFrame[]): Promise<void> {
  const used = new Set(kept.map((f) => f.image?.id))
  await Promise.all(uploaded.filter((m) => !used.has(m.id)).map((m) => deleteFile(backend, m.id).catch(() => undefined)))
}
