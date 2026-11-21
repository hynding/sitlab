import { useCallback, useEffect, useMemo, useState } from 'react'
import { getStory, type Backend, type StoryDetail } from '../cms'
import { describe } from '../errors'
import type { Workspace } from './context'

/**
 * Loads one story for a page that edits it: the workspace the page provides to its sections, the
 * error that stopped it loading, and the error of the last change, which `dismiss` clears.
 */
export function useStory(id: string, backend: Backend, signedIn: boolean) {
  const [version, setVersion] = useState(0)
  const [loaded, setLoaded] = useState<{ key: string; story: StoryDetail | null; error: string | null }>({
    key: '',
    story: null,
    error: null,
  })
  const [changeError, setChangeError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const key = `${backend}:${id}:${signedIn}:${version}`

  useEffect(() => {
    let current = true
    getStory(backend, id).then(
      (res) => current && setLoaded({ key, story: res.data, error: null }),
      (e) => current && setLoaded({ key, story: null, error: describe(e, backend) }),
    )
    return () => {
      current = false
    }
  }, [backend, id, key])

  const run = useCallback(
    async (change: () => Promise<unknown>) => {
      setBusy(true)
      setChangeError(null)
      try {
        await change()
        setVersion((v) => v + 1)
        return true
      } catch (e) {
        setChangeError(describe(e, backend))
        return false
      } finally {
        setBusy(false)
      }
    },
    [backend],
  )

  const { story, error } = loaded
  const workspace = useMemo<Workspace | null>(
    () => (story ? { backend, story, canEdit: signedIn, run, busy } : null),
    [backend, story, signedIn, run, busy],
  )

  return { workspace, error, changeError, dismiss: () => setChangeError(null) }
}
