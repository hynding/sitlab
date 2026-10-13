# Sitlab

A creative lab for developing characters, stories, plot lines, humor and drama, character arcs,
storyboards and screenplays, drawing on researched public sources. It is an installable PWA backed by
a Strapi CMS.

Sitlab is also the first real application of [strapi-php](https://github.com/hynding/strapi-php).
The same content model runs on two backends side by side:

| App | What | Port |
| --- | --- | --- |
| `apps/cms-php` | strapi-php (the CMS Sitlab uses) | 1337 |
| `apps/cms-node` | Strapi on Node, the same version (the reference) | 1338 |
| `apps/web` | the PWA (Vite + React + TypeScript, `vite-plugin-pwa`) | 5173 |

Anything that behaves differently between the two CMS apps is a strapi-php bug to fix upstream.

## Layout

```
schema/                  the content model, the one place to edit it (Strapi schema.json format)
  api/<type>/content-types/<type>/schema.json
  components/story/*.json
apps/cms-php/            strapi-php project (create-strapi-app, vanilla template)
apps/cms-node/           Strapi project (npx create-strapi-app@5.56.0, TypeScript)
apps/web/                the PWA
conformance/             HTTP fixtures run against both CMS apps, with a response diff
scripts/sync-schema.mjs  copies schema/ into both apps (and --check, --pull)
scripts/init-env.mjs     creates each CMS app's .env with fresh secrets
```

## Content model

| Type | Holds |
| --- | --- |
| Story | title, logline, synopsis, format, genre, status; its characters, plot lines, scenes and sources |
| Character | name, role, summary, backstory, portrait, traits (component) |
| Character arc | one character's change across one story: start and end state, beats |
| Plot line | A/B/C plot, subplot or running gag, with beats tagged by mood (humor, drama, tension...) |
| Scene | position, location, time of day, summary, screenplay text, storyboard frames |
| Source | researched public material: URL, kind, publisher, license, date accessed, notes |

## Getting started

Needs PHP 8.3 (`pdo_sqlite`, `intl`, `gd`), Composer, and Node 20+.

```sh
npm run setup        # .env files with fresh secrets, composer + npm installs
npm run dev:php      # strapi-php admin at http://localhost:1337/admin
npm run dev:node     # Strapi admin at http://localhost:1338/admin
npm run dev:web      # the PWA at http://localhost:5173
```

Create an admin in each CMS on first visit. The content API is closed by default: for the PWA, create
an API token in each admin (Settings > API Tokens) and put it in `apps/web/.env.local`
(see `apps/web/.env.example`).

Both CMS apps use SQLite (`apps/*/.tmp/data.db`) for now. The deployed app will use MySQL: set
`DATABASE_CLIENT=mysql` and the `DATABASE_*` connection variables; the Node app also needs the
`mysql2` package then.

## Changing the content model

1. Edit `schema/` (or edit in one app's Content-Type Builder, then `node scripts/sync-schema.mjs --pull php`
   or `--pull node`).
2. `npm run schema:sync` copies it into both apps and adds a default router, controller and service
   for any new type. Custom code in either app is never overwritten.
3. `npm run schema:check` fails if the apps and `schema/` disagree.

## Conformance

With both CMS apps running:

```sh
npm run conformance                    # every fixture, both backends
node conformance/run.mjs --only php    # one backend
node conformance/run.mjs validation    # fixtures whose name contains "validation"
```

The runner signs in to each admin (registering `admin@sitlab.local` on a fresh database; override
with `CONFORMANCE_ADMIN_EMAIL` / `CONFORMANCE_ADMIN_PASSWORD`), creates a temporary API token, runs
`conformance/fixtures/*.json`, and deletes the token. Each step is checked against its `expect`, and
the two backends' responses are diffed with ids and timestamps masked.

### Known differences

- **Enumeration error message** (`validation.json`, step 2): for an invalid enum value strapi-php
  lists the allowed values ending in `null`, Strapi ends them with an empty string
  (`…, comic, other, ` vs `…, comic, other, null`).
- **Plugins enabled by default**: `hynding/strapi-php` is one package, so the PHP app also has GraphQL
  (`/graphql`), documentation and sentry, which a vanilla Node app does not.

## Versions

Both CMS apps track Strapi **5.56.0**, the version strapi-php mirrors. Each app's `package.json`
pins every `@strapi/*` package to 5.56.0 with `overrides`: without them npm resolves some internal
`@strapi/*` dependencies to a newer release, which in the Node app made a 403 come back as a 500.

strapi-php is not on Packagist yet, so `apps/cms-php/composer.json` pulls `hynding/strapi-php` from
GitHub (`dev-main as 5.56.0-beta.1`). Once it is tagged and published, switch to `"^5.56"` and drop
the `repositories` entry.
