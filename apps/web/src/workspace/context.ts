import { createContext, useContext } from 'react'
import type { Backend, StoryDetail } from '../cms'

export type Workspace = {
  backend: Backend
  story: StoryDetail
  /** Signed in: the workspace shows its editing controls. */
  canEdit: boolean
  /** Runs a change, shows its error if it fails, and reloads the story when it succeeds. */
  run: (change: () => Promise<unknown>) => Promise<boolean>
  busy: boolean
}

export const WorkspaceContext = createContext<Workspace | null>(null)

export function useWorkspace(): Workspace {
  const workspace = useContext(WorkspaceContext)
  if (!workspace) throw new Error('useWorkspace outside a StoryWorkspace')
  return workspace
}
