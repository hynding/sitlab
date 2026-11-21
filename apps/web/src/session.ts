/**
 * The signed-in user, shared by every page. Strapi's users-permissions plugin hands out a short-lived
 * access token (the `jwt`) and keeps the refresh token in an httpOnly cookie on the API's domain, so
 * only the access token and the user are kept here.
 */
import { useSyncExternalStore } from 'react'

export type User = { id: number; documentId: string; username: string; email: string }
export type Session = { jwt: string; user: User }

const KEY = 'sitlab.session'
const listeners = new Set<() => void>()

function read(): Session | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

let current = read()

export function getSession(): Session | null {
  return current
}

export function setSession(session: Session | null): void {
  current = session
  try {
    if (session) localStorage.setItem(KEY, JSON.stringify(session))
    else localStorage.removeItem(KEY)
  } catch {
    // private browsing: the session lasts until the tab closes
  }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useSession(): Session | null {
  return useSyncExternalStore(subscribe, getSession)
}
