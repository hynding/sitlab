// Hash routes (#/stories) work on static hosting without server rewrites.
export type Route = 'home' | 'stories' | 'signin' | 'signup'

const routes: Record<string, Route> = { '': 'home', stories: 'stories', signin: 'signin', signup: 'signup' }

export function currentRoute(): Route {
  return routes[window.location.hash.replace(/^#\/?/, '')] ?? 'home'
}

export function go(route: Route): void {
  window.location.hash = route === 'home' ? '/' : `/${route}`
}
