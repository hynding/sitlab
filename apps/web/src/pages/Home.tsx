const features = [
  {
    title: 'Stories',
    text: 'Keep every idea in one place, from a one-line logline to a finished draft. Track the format (feature, series, novel, comic and more) and where each story stands.',
  },
  {
    title: 'Characters',
    text: 'Give each character a role, a backstory, a portrait and the traits that make them who they are, and see every story and scene they appear in.',
  },
  {
    title: 'Character arcs',
    text: 'Chart how a character changes, from where they start to where they end up, beat by beat.',
  },
  {
    title: 'Plot lines',
    text: 'Weave A, B and C plots, subplots and running gags, and mark each beat as humor, drama, tension, release or romance.',
  },
  {
    title: 'Scenes and storyboards',
    text: 'Order your scenes, set the time and place, write the screenplay and sketch the shots frame by frame.',
  },
  {
    title: 'Research',
    text: 'Collect the articles, books, datasets and archives behind your story, with their licenses, so public sources are always one click away.',
  },
]

export function Home({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="home">
      <section className="hero">
        <h1>A creative lab for your stories</h1>
        <p className="lead">
          Sitlab helps you organize, plan and plot story work: characters, plot lines, character arcs, storyboards and
          screenplays, side by side with the research that inspires them.
        </p>
        <div className="actions">
          {signedIn ? (
            <a className="button" href="#/stories">
              Go to your stories
            </a>
          ) : (
            <>
              <a className="button" href="#/signup">
                Create a free account
              </a>
              <a href="#/stories">Browse stories</a>
            </>
          )}
        </div>
      </section>

      <section className="features" aria-label="What you can do">
        {features.map((feature) => (
          <article key={feature.title}>
            <h2>{feature.title}</h2>
            <p>{feature.text}</p>
          </article>
        ))}
      </section>

      <section className="how">
        <h2>How it works</h2>
        <ol>
          <li>Sign up with an email address and a password.</li>
          <li>Start a story with a title and a logline.</li>
          <li>Add characters, plot lines and scenes as the story grows.</li>
        </ol>
        <p className="muted">
          Sitlab is a work in progress. Stories are here today; characters, plot lines, arcs, scenes and research are
          coming to the app next.
        </p>
      </section>
    </div>
  )
}
