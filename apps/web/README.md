# Sitlab web

The Sitlab PWA: Vite + React + TypeScript, made installable and offline-capable by `vite-plugin-pwa`.

```sh
cp .env.example .env.local   # then paste an API token for each CMS you run
npm install
npm run dev                  # http://localhost:5173
```

The header switches between the two CMS apps (`apps/cms-php` on 1337, `apps/cms-node` on 1338).
They serve the same content model, so anything that works against one should work against the other.
