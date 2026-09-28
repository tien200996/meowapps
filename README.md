# meowapps

Embedded Shopify apps on Firebase.

## Folder structure

```
bin/
    meowapps.js                                the CLI: init, shopify, firebase

functions/
    index.js                                   createFunctions, createSchedule, db, adminUrl

templates/
    .meowapps/firebase.json                    hosting, functions, emulator ports
    .meowapps/firestore.rules                  each shop reads and writes only its own data
    .meowapps/shopify.web.toml                 the dev command Shopify runs
    functions/index.js                         the starter routes
    public/index.html                          the starter shell
    public/components/meow-router.js           signs in, renders the page for the path
    public/components/<page>.js                the starter pages
```

## Install

```sh
npx meowapps init
```

## Gotchas

**Do** bump `version` to release. **Don't** run `npm publish` locally. **Why:** CI publishes on push to `main` only when the version is new.

**Do** bump `meowapps` in `templates/functions/package.json` with `version`. **Why:** new apps install the version the template names.
