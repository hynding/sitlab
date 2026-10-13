# Sitlab: notes for contributors and agents

- `schema/` is the content model's source of truth. Change it there, then `npm run schema:sync`.
  Never edit `apps/cms-*/src/api/*/content-types/*/schema.json` or `apps/cms-*/src/components` by hand
  without pulling the change back (`node scripts/sync-schema.mjs --pull php|node`).
- `apps/cms-php` (strapi-php) and `apps/cms-node` (Strapi) must stay behaviourally identical. Custom
  server code goes into both: a `.php` file in cms-php and a `.ts` file at the same path in cms-node.
- When the two backends disagree, add or extend a fixture in `conformance/fixtures/`, list it under
  "Known differences" in README.md, and fix it in hynding/strapi-php rather than working around it here.
- Both apps track the Strapi version strapi-php mirrors (5.56.0). Upgrade them together, and keep
  every `@strapi/*` package pinned through `overrides` in both `package.json` files.
- `apps/web` talks to the CMS only through the REST content API (`src/cms.ts`), so it runs on either.
