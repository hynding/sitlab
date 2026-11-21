import type { Backend } from '../cms'
import { Arcs } from '../workspace/Arcs'
import { Characters } from '../workspace/Characters'
import { WorkspaceContext } from '../workspace/context'
import { Details } from '../workspace/Details'
import { PlotLines } from '../workspace/PlotLines'
import { Research } from '../workspace/Research'
import { Scenes } from '../workspace/Scenes'
import { useStory } from '../workspace/useStory'

/** One story with its characters, plot lines, scenes and research, editable in place when signed in. */
export function StoryWorkspace({ id, backend, signedIn }: { id: string; backend: Backend; signedIn: boolean }) {
  const { workspace, error, changeError, dismiss } = useStory(id, backend, signedIn)

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
            <button type="button" className="link" onClick={dismiss}>
              Dismiss
            </button>
          </p>
        )}
        <Details />
        <Characters />
        <Arcs />
        <PlotLines />
        <Scenes />
        <Research />
      </article>
    </WorkspaceContext.Provider>
  )
}
