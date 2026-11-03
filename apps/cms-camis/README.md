# cms-camis

A [camis](https://github.com/hynding/camis) project: one content model, generated into
filament.

- `camis.json` is the content model (the IR). Edit it, then run `camis build`.
- `roles.json` holds the roles and their grants: `public` and `authenticated`, as in Strapi, and
  `super-admin`, the role that may sign in to the admin (`php artisan camis:admin <email>` makes one).
- `camis.config.json` names the targets and where each one is generated.
- `protected/` is copied into every target after generation; hand-written code lives there.
- `generated/` is rebuilt by `camis build` and is not committed.

```sh
camis validate camis.json   # check the content model
camis generate              # list what each target would write
camis build                 # write every target into generated/
```
