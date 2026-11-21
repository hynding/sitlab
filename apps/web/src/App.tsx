import { useEffect, useState } from 'react'
import { backends, canSwitchBackend, defaultBackend, signOut, type Backend } from './cms'
import { Auth } from './pages/Auth'
import { Home } from './pages/Home'
import { Stories } from './pages/Stories'
import { Screenplay } from './pages/Screenplay'
import { StoryWorkspace } from './pages/StoryWorkspace'
import { currentRoute, go, type Route } from './router'
import { useSession } from './session'

function App() {
  const [route, setRoute] = useState<Route>(currentRoute)
  const [backend, setBackend] = useState<Backend>(defaultBackend)
  const session = useSession()

  useEffect(() => {
    const onHashChange = () => {
      setRoute(currentRoute())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  return (
    <>
      <header className="site-header">
        <a className="brand" href="#/">
          Sitlab
        </a>
        <nav>
          <a href="#/stories" aria-current={route.name === 'stories' || route.name === 'story' || route.name === 'screenplay' ? 'page' : undefined}>
            Stories
          </a>
          {session ? (
            <>
              <span className="muted">{session.user.username}</span>
              <button
                type="button"
                className="link"
                onClick={() => {
                  void signOut(backend)
                  go('home')
                }}
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <a href="#/signin" aria-current={route.name === 'signin' ? 'page' : undefined}>
                Sign in
              </a>
              <a className="button" href="#/signup">
                Sign up
              </a>
            </>
          )}
          {canSwitchBackend && (
            <label className="backend">
              Backend{' '}
              <select value={backend} onChange={(e) => setBackend(e.target.value as Backend)}>
                {(Object.keys(backends) as Backend[]).map((b) => (
                  <option key={b} value={b}>
                    {backends[b].label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </nav>
      </header>

      <main>
        {route.name === 'home' && <Home signedIn={session !== null} />}
        {route.name === 'stories' && <Stories backend={backend} signedIn={session !== null} />}
        {route.name === 'story' && <StoryWorkspace key={route.id} id={route.id} backend={backend} signedIn={session !== null} />}
        {route.name === 'screenplay' && <Screenplay key={route.id} id={route.id} backend={backend} signedIn={session !== null} />}
        {(route.name === 'signin' || route.name === 'signup') && <Auth key={route.name} mode={route.name} backend={backend} />}
      </main>
    </>
  )
}

export default App
