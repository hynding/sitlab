import { backends, CmsError, type Backend } from './cms'

/** A readable message for a failed content API request. */
export function describe(e: unknown, backend: Backend): string {
  if (e instanceof CmsError && (e.status === 401 || e.status === 403)) {
    // the token hint is for local development only; a deployed build never carries a token
    return import.meta.env.DEV
      ? `${backends[backend].label} refused the request (${e.status}). Sign in, or set VITE_CMS_${backend.toUpperCase()}_TOKEN in apps/web/.env.local to an API token from its admin panel.`
      : 'You do not have access to this yet.'
  }
  if (e instanceof CmsError && e.status === 404) return 'This could not be found. It may have been deleted.'
  if (e instanceof CmsError) return e.message
  return import.meta.env.DEV
    ? `${backends[backend].label} is not reachable at ${backends[backend].url}. Is it running?`
    : 'Sitlab cannot be reached right now. Please try again later.'
}
