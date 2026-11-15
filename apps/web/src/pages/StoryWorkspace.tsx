import { useCallback, useEffect, useMemo, useState } from 'react'
import { getStory, type Backend, type StoryDetail } from '../cms'
import { describe } from '../errors'
import { Characters } from '../workspace/Characters'
import { WorkspaceContext, type Workspace } from '../workspace/context'
import { Details } from '../workspace/Details'
import { PlotLines } from '../workspace/PlotLines'
import { Research } from '../workspace/Research'
import { Scenes } from '../workspace/Scenes'

/** One story with its characters, plot lines, scenes and research, editable in place when signed in. */
export function StoryWorkspace({ id, backend, signedIn }: { id: string; backend: Backend; signedIn: boolean }) {
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

  if (!workspace) {
    return (
      <section>
        <p>
          <a href="#/stories">← Stories</a>
        </p>
        {error ? <p role="alert">{error}</p> : <p>Loading…</p>}
      </section>
    )
  }

  return (
    <WorkspaceContext.Provider value={workspace}>
      <article className="workspace">
        <p>
          <a href="#/stories">← Stories</a>
        </p>
        {changeError && (
          <p role="alert" className="change-error">
            {changeError}{' '}
            <button type="button" className="link" onClick={() => setChangeError(null)}>
              Dismiss
            </button>
          </p>
        )}
        <Details />
        <Characters />
        <PlotLines />
        <Scenes />
        <Research />
      </article>
    </WorkspaceContext.Provider>
  )
}
