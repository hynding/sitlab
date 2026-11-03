# Deploying to DreamHost

`.github/workflows/deploy.yml` builds and tests on every pull request, and deploys on a push:

| Branch | GitHub environment | cms-php | web |
| --- | --- | --- | --- |
| `dev` | `dev` | `~/domains/dev/sitlab/api-dev` (https://api-dev.sitlab.dev) | `~/domains/dev/sitlab/dev` (https://dev.sitlab.dev) |
| `main` | `production` | `~/domains/dev/sitlab/api` (https://api.sitlab.dev) | `~/domains/dev/sitlab/www` (https://www.sitlab.dev) |

"Run workflow" (Actions tab) redeploys a branch the same way. `apps/cms-node` is never deployed: it
exists for local conformance runs only.

A deploy builds cms-php on the runner (`composer install --no-dev`, the admin panel with
`php bin/strapi build`) and the PWA (`npm run build`), rsyncs both over SSH, writes the server's
`.env` from the `ENV_FILE` secret and runs `php bin/strapi migrations:run`, which also creates or
updates the tables for the content model.

## One-time DreamHost setup

1. **Web directories** (Panel → Websites → Manage, each site's settings): the two API sites must
   serve the app's `public/` folder, so set their web directory to
   `domains/dev/sitlab/api-dev/public` and `domains/dev/sitlab/api/public`. Otherwise `.env` and
   `vendor/` sit in the web root. The two web sites keep their folder as is.
2. **HTTPS** on all four sites (Let's Encrypt), with "Redirect HTTP to HTTPS" on.
3. **PHP 8.3** on the two API sites. The site setting does not change the `php` command over SSH, so
   the deploy runs `bin/strapi` with `/usr/local/php83/bin/php` (DreamHost's 8.3 build) when it exists,
   otherwise with `php`. If neither is 8.3, set the `PHP_BIN` variable to a PHP 8.3 binary.
   Over SSH, `/usr/local/php83/bin/php -m` must list `pdo_mysql`, `intl`, `gd`, `mbstring` and `sodium`.
4. **MySQL** (Panel → MySQL Databases): `sitlab_dev` and `sitlab_prod` on `mysql.sitlab.dev`, each
   with its own user. To point a local cms-php at one, add your IP to that user's allowable hosts.
5. **SSH deploy key**: the user that owns the sites needs shell (SSH) access. Make a key pair just for
   deploys and add the public half to that user's `~/.ssh/authorized_keys`:

   ```sh
   ssh-keygen -t ed25519 -C sitlab-deploy -f ~/.ssh/sitlab_deploy -N ''
   ssh-copy-id -i ~/.ssh/sitlab_deploy.pub <user>@<server>.dreamhost.com
   ```

   The private half (`~/.ssh/sitlab_deploy`) becomes the `DEPLOY_SSH_KEY` secret.
6. **Upload limits** (optional): DreamHost's PHP defaults cap uploads at a few MB. For larger media,
   create `~/.php/8.3/phprc` with `upload_max_filesize = 64M` and `post_max_size = 64M`.

## GitHub configuration

Settings → Environments: create `dev` and `production`. For `production`, consider "Deployment
branches: main only" and yourself as a required reviewer.

Secrets, in each environment:

| Secret | dev | production |
| --- | --- | --- |
| `DEPLOY_HOST` | the DreamHost server, e.g. `iad1-shared-b8-12.dreamhost.com` | same |
| `DEPLOY_USER` | the SSH user that owns the sites | same |
| `DEPLOY_SSH_KEY` | the private deploy key (whole file) | same |
| `API_PATH` | `/home/<user>/domains/dev/sitlab/api-dev` | `/home/<user>/domains/dev/sitlab/api` |
| `WEB_PATH` | `/home/<user>/domains/dev/sitlab/dev` | `/home/<user>/domains/dev/sitlab/www` |
| `ENV_FILE` | the cms-php `.env` for dev (below) | the cms-php `.env` for production |

Paths must be absolute (`/home/<user>/…`, not `~/…`).

Variables, in each environment:

| Variable | dev | production |
| --- | --- | --- |
| `API_URL` | `https://api-dev.sitlab.dev` | `https://api.sitlab.dev` |
| `PHP_BIN` | optional, default `/usr/local/php83/bin/php` if present, else `php` | optional |

`API_URL` is compiled into the PWA as `VITE_CMS_PHP_URL`. Never set a `VITE_*_TOKEN` for a deployed
build: anything `VITE_` ends up in the public JavaScript.

## ENV_FILE

Generate one file per environment from `apps/cms-php/.env.deploy.example`, with fresh secrets and
that environment's URL and database already filled in:

```sh
node scripts/init-env.mjs --deploy dev          # writes apps/cms-php/.env.dev
node scripts/init-env.mjs --deploy production   # writes apps/cms-php/.env.production
```

Both files are git-ignored. Fill in `DATABASE_USERNAME` and `DATABASE_PASSWORD` in each, then upload
them:

```sh
gh secret set ENV_FILE --env dev        < apps/cms-php/.env.dev
gh secret set ENV_FILE --env production < apps/cms-php/.env.production
```

The script never overwrites an existing file. Keep both files somewhere safe (a password manager):
rotating `ENCRYPTION_KEY` or `API_TOKEN_SALT` later breaks stored data and tokens.

## First deploy

1. Push `dev`. The run creates the tables in `sitlab_dev`.
2. Create the first admin straight away: until one exists, whoever opens `/admin` first can register
   as super admin. Open https://api-dev.sitlab.dev/admin and register, or over SSH:

   ```sh
   cd domains/dev/sitlab/api-dev && php bin/strapi admin:create-user \
     --email you@example.com --firstname Steve --password '<a strong password>'
   ```

3. Set what visitors and signed-in users may do: Settings → Users & Permissions → Roles.
   - **Public**: allow `find` and `findOne` on the types the PWA reads (Story, Character,
     Character-arc, Plot-line, Scene, Source).
   - **Authenticated**: the same, plus `create` (and `update` / `delete` if users should edit) on
     the types they write. Story is the only one the PWA writes so far.

   Anyone can sign up from the PWA. To close sign-ups, turn off "Enable sign-ups" under
   Settings → Users & Permissions → Advanced settings.
4. Check https://api-dev.sitlab.dev/api/stories and https://dev.sitlab.dev, then repeat with `main`
   for production.
