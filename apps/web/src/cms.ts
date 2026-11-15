/**
 * A small client for the Strapi content API. Every backend (strapi-php, Strapi and CAMIS) speaks
 * the same REST dialect, so the same calls work against any of them.
 */
import { getSession, setSession, type Session, type User } from './session'

export type Backend = 'php' | 'node' | 'camis'

export const backends: Record<Backend, { label: string; url: string; token: string }> = {
  php: {
    label: 'strapi-php',
    url: import.meta.env.VITE_CMS_PHP_URL ?? 'http://localhost:1337',
    token: import.meta.env.VITE_CMS_PHP_TOKEN ?? '',
  },
  node: {
    label: 'Strapi (Node)',
    url: import.meta.env.VITE_CMS_NODE_URL ?? 'http://localhost:1338',
    token: import.meta.env.VITE_CMS_NODE_TOKEN ?? '',
  },
  camis: {
    label: 'CAMIS',
    url: import.meta.env.VITE_CMS_CAMIS_URL ?? 'http://localhost:1339',
    token: import.meta.env.VITE_CMS_CAMIS_TOKEN ?? '',
  },
}

/** Switching backends is for comparing them locally; a deployed build talks to one CMS. */
export const canSwitchBackend = import.meta.env.DEV

export const defaultBackend: Backend = import.meta.env.VITE_CMS_DEFAULT ?? 'php'

export type Story = {
  documentId: string
  title: string
  logline: string | null
  format: (typeof storyFormats)[number]
  status: (typeof storyStatuses)[number]
  genre: string | null
}

export type ListResponse<T> = {
  data: T[]
  meta: { pagination: { page: number; pageSize: number; pageCount: number; total: number } }
}

export class CmsError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function send(backend: Backend, path: string, init: RequestInit, bearer: string): Promise<Response> {
  return fetch(`${backends[backend].url}/api${path}`, {
    ...init,
    // the refresh token lives in an httpOnly cookie on the API's domain
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      ...init.headers,
    },
  })
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new CmsError(res.status, body?.error?.message ?? res.statusText)
  return body as T
}

let refreshing: Promise<string | null> | null = null

/**
 * Trades the refresh cookie for a new access token; signs out when the session has ended. Requests
 * that fail together share one refresh, because each refresh rotates the cookie.
 */
function refresh(backend: Backend): Promise<string | null> {
  refreshing ??= (async () => {
    const session = getSession()
    if (!session) return null
    try {
      const { jwt } = await parse<{ jwt: string }>(await send(backend, '/auth/refresh', { method: 'POST', body: '{}' }, ''))
      setSession({ ...session, jwt })
      return jwt
    } catch {
      setSession(null)
      return null
    }
  })().finally(() => {
    refreshing = null
  })
  return refreshing
}

async function request<T>(backend: Backend, path: string, init: RequestInit = {}): Promise<T> {
  const session = getSession()
  // a signed-in user's token; otherwise, in local development only, an API token from .env.local
  const bearer = session?.jwt ?? (import.meta.env.DEV ? backends[backend].token : '')
  let res = await send(backend, path, init, bearer)
  if (res.status === 401 && session) {
    // another request may have refreshed while this one was in flight
    const latest = getSession()?.jwt
    const jwt = latest && latest !== session.jwt ? latest : await refresh(backend)
    if (jwt) res = await send(backend, path, init, jwt)
  }
  return parse<T>(res)
}

export const listStories = (backend: Backend) =>
  request<ListResponse<Story>>(backend, '/stories?sort=updatedAt:desc&fields[0]=title&fields[1]=logline&fields[2]=format&fields[3]=status&fields[4]=genre')

export const createStory = (backend: Backend, data: Pick<Story, 'title'> & Partial<Story>) =>
  request<{ data: Story }>(backend, '/stories', { method: 'POST', body: JSON.stringify({ data }) })

// --- the Story workspace -------------------------------------------------------------------------
// Enumeration values, as in schema/.

export const storyFormats = ['feature', 'short', 'series', 'episode', 'novel', 'short-story', 'comic', 'other'] as const
export const storyStatuses = ['idea', 'outline', 'draft', 'revision', 'done'] as const
export const characterRoles = ['protagonist', 'antagonist', 'deuteragonist', 'supporting', 'minor'] as const
export const plotLineKinds = ['a-plot', 'b-plot', 'c-plot', 'subplot', 'runner'] as const
export const beatMoods = ['humor', 'drama', 'tension', 'release', 'romance', 'neutral'] as const
export const timesOfDay = ['day', 'night', 'dawn', 'dusk', 'continuous'] as const
export const sourceTopics = ['person', 'place', 'era', 'event', 'organization', 'work', 'other'] as const
export const sourceKinds = ['article', 'book', 'dataset', 'image', 'video', 'audio', 'archive', 'other'] as const

/** A repeatable component entry. `id` is absent on one that has not been saved yet. */
export type Beat = { id?: number; title: string; description: string | null; mood: (typeof beatMoods)[number] }
export type Trait = { id?: number; label: string; value: string | null }

export type Character = {
  documentId: string
  name: string
  role: (typeof characterRoles)[number]
  summary: string | null
  traits: Trait[]
  sources: Pick<Source, 'documentId' | 'title'>[]
}

export type PlotLine = {
  documentId: string
  title: string
  kind: (typeof plotLineKinds)[number]
  summary: string | null
  beats: Beat[]
}

export type Scene = {
  documentId: string
  title: string
  position: number | null
  location: string | null
  timeOfDay: (typeof timesOfDay)[number] | null
  summary: string | null
  screenplay: string | null
  characters: Pick<Character, 'documentId' | 'name'>[]
  plotLines: Pick<PlotLine, 'documentId' | 'title'>[]
  sources: Pick<Source, 'documentId' | 'title'>[]
}

/** Researched material: a Wikipedia article, a Wikidata entity, or any page added by hand. */
export type Source = {
  documentId: string
  title: string
  url: string | null
  topic: (typeof sourceTopics)[number] | null
  kind: (typeof sourceKinds)[number]
  wikidataId: string | null
  excerpt: string | null
  period: string | null
  imageUrl: string | null
  publisher: string | null
  license: string | null
  accessedOn: string | null
  notes: string | null
  characters: Pick<Character, 'documentId' | 'name'>[]
  scenes: Pick<Scene, 'documentId' | 'title'>[]
  /** The stories it belongs to; removing a source shared with another story only unlinks it. */
  stories: { documentId: string }[]
}

export type StoryDetail = Story & {
  characters: Character[]
  plotLines: PlotLine[]
  scenes: Scene[]
  sources: Source[]
}

/** Builds a Strapi query string; brackets stay readable, values are encoded. */
function query(params: [string, string | number][]): string {
  return '?' + params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
}

const storyPopulate = query([
  ['populate[characters][populate][traits]', 'true'],
  ['populate[characters][populate][sources][fields][0]', 'title'],
  ['populate[characters][sort][0]', 'name:asc'],
  ['populate[plotLines][populate][beats]', 'true'],
  ['populate[plotLines][sort][0]', 'kind:asc'],
  ['populate[scenes][populate][characters][fields][0]', 'name'],
  ['populate[scenes][populate][plotLines][fields][0]', 'title'],
  ['populate[scenes][populate][sources][fields][0]', 'title'],
  ['populate[scenes][sort][0]', 'position:asc'],
  ['populate[sources][populate][characters][fields][0]', 'name'],
  ['populate[sources][populate][scenes][fields][0]', 'title'],
  ['populate[sources][populate][stories][fields][0]', 'title'],
  ['populate[sources][sort][0]', 'title:asc'],
])

export const getStory = (backend: Backend, documentId: string) =>
  request<{ data: StoryDetail }>(backend, `/stories/${encodeURIComponent(documentId)}${storyPopulate}`)

/** The collections the workspace writes, by their REST plural. */
type Collection = 'stories' | 'characters' | 'plot-lines' | 'scenes' | 'sources'

export const createEntry = <T,>(backend: Backend, collection: Collection, data: object) =>
  request<{ data: T }>(backend, `/${collection}`, { method: 'POST', body: JSON.stringify({ data }) })

export const updateEntry = <T,>(backend: Backend, collection: Collection, documentId: string, data: object) =>
  request<{ data: T }>(backend, `/${collection}/${encodeURIComponent(documentId)}`, { method: 'PUT', body: JSON.stringify({ data }) })

export const deleteEntry = (backend: Backend, collection: Collection, documentId: string) =>
  request<void>(backend, `/${collection}/${encodeURIComponent(documentId)}`, { method: 'DELETE' })

/** Characters for the "add an existing character" picker. */
export const listCharacters = (backend: Backend) =>
  request<ListResponse<Pick<Character, 'documentId' | 'name'>>>(
    backend,
    '/characters' +
      query([
        ['fields[0]', 'name'],
        ['sort[0]', 'name:asc'],
        ['pagination[pageSize]', 100],
      ]),
  )

type AuthResponse = { jwt: string; user: User }

async function authenticate(backend: Backend, path: string, body: object): Promise<Session> {
  const res = await send(backend, path, { method: 'POST', body: JSON.stringify(body) }, '')
  const { jwt, user } = await parse<AuthResponse>(res)
  const session = { jwt, user: { id: user.id, documentId: user.documentId, username: user.username, email: user.email } }
  setSession(session)
  return session
}

export const signUp = (backend: Backend, username: string, email: string, password: string) =>
  authenticate(backend, '/auth/local/register', { username, email, password })

export const signIn = (backend: Backend, identifier: string, password: string) =>
  authenticate(backend, '/auth/local', { identifier, password })

export async function signOut(backend: Backend): Promise<void> {
  const session = getSession()
  setSession(null)
  if (session) {
    // ends the server session and clears the refresh cookie; signing out locally is what matters
    await send(backend, '/auth/logout', { method: 'POST', body: '{}' }, session.jwt).catch(() => undefined)
  }
}
