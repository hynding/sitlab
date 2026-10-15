/**
 * A small client for the Strapi content API. Both backends (strapi-php and Strapi) speak the same
 * REST dialect, so the same calls work against either.
 */
import { getSession, setSession, type Session, type User } from './session'

export type Backend = 'php' | 'node'

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
}

/** Switching backends is for comparing the two locally; a deployed build talks to one CMS. */
export const canSwitchBackend = import.meta.env.DEV

export const defaultBackend: Backend = import.meta.env.VITE_CMS_DEFAULT === 'node' ? 'node' : 'php'

export type Story = {
  documentId: string
  title: string
  logline: string | null
  format: string
  status: string
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
