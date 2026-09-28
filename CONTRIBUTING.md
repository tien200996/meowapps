# Contributing

## Run the app locally

1. Clone this repo and run `npm i`.
2. In `templates/functions`, run `npm link ../../`.
3. In `templates`, run `npm i`.
4. In `templates`, run `npx meowapps shopify app config link` and pick your Shopify app.
5. In `templates`, run `npm run dev`.

## Folder structure

```
bin/          the meowapps command
functions/    the code apps import from meowapps/functions
docs/         the guides shown in npx meowapps
templates/    the starter app that init copies
```

## Gotchas

- Files in `templates/` go into every new app, so keep only starter code there.
- To release, bump `version` in `package.json` and `meowapps` in `templates/functions/package.json` together.

## Suggest a change

Open an issue.
