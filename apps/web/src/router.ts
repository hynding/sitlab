// Hash routes (#/stories) work on static hosting without server rewrites.
export type Route =
  | { name: 'home' }
  | { name: 'stories' }
  | { name: 'signin' }
  | { name: 'signup' }
  | { name: 'story'; id: string }

const simple = ['stories', 'signin', 'signup'] as const

export function currentRoute(): Route {
  const path = window.location.hash.replace(/^#\/?/, '')
  const story = /^stories\/([^/]+)$/.exec(path)
  if (story) return { name: 'story', id: decodeURIComponent(story[1]) }
  const name = simple.find((r) => r === path)
  return name ? { name } : { name: 'home' }
}

export function href(route: Route): string {
  if (route.name === 'home') return '#/'
  if (route.name === 'story') return `#/stories/${encodeURIComponent(route.id)}`
  return `#/${route.name}`
}

export function go(route: Route | Exclude<Route['name'], 'story'>): void {
  window.location.hash = href(typeof route === 'string' ? ({ name: route } as Route) : route).slice(1)
}
