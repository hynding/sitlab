import { useEffect, useState } from 'react'
import { backends, canSwitchBackend, defaultBackend, signOut, type Backend } from './cms'
import { Auth } from './pages/Auth'
import { Home } from './pages/Home'
import { Stories } from './pages/Stories'
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
          <a href="#/stories" aria-current={route === 'stories' ? 'page' : undefined}>
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
              <a href="#/signin" aria-current={route === 'signin' ? 'page' : undefined}>
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
        {route === 'home' && <Home signedIn={session !== null} />}
        {route === 'stories' && <Stories backend={backend} signedIn={session !== null} />}
        {(route === 'signin' || route === 'signup') && <Auth key={route} mode={route} backend={backend} />}
      </main>
    </>
  )
}

export default App
