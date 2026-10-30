/**
 * A small client for the Strapi content API. Every backend (strapi-php, Strapi and CAMIS) speaks
 * the same REST dialect, so the same calls work against any of them.
 */
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

export const defaultBackend: Backend = import.meta.env.VITE_CMS_DEFAULT ?? 'php'

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

async function request<T>(backend: Backend, path: string, init: RequestInit = {}): Promise<T> {
  const { url, token } = backends[backend]
  const res = await fetch(`${url}/api${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  })
  if (res.status === 204) return undefined as T
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new CmsError(res.status, body?.error?.message ?? res.statusText)
  return body as T
}

export const listStories = (backend: Backend) =>
  request<ListResponse<Story>>(backend, '/stories?sort=updatedAt:desc&fields[0]=title&fields[1]=logline&fields[2]=format&fields[3]=status&fields[4]=genre')

export const createStory = (backend: Backend, data: Pick<Story, 'title'> & Partial<Story>) =>
  request<{ data: Story }>(backend, '/stories', { method: 'POST', body: JSON.stringify({ data }) })
