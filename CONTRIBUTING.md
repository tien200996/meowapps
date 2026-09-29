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

## Writing docs

```md
---
name: {fileName}
description: {Verb} {task}
---
```

- Start with frontmatter, because `npx meowapps` prints `description` under the file path.
- Open with a `## TL;DR` of the rules that break a deploy or force a data migration.
- Follow each rule with a real example.
- Write values the reader fills in as `{camelCase}`, like `{shopId}`.
- End with a `## Don't` section written as **Don't** / **Do** / **Why**.
- Describe only what exists now.

## Gotchas

- Files in `templates/` go into every new app, so keep only starter code there.
- To release, bump `version` in `package.json` and `meowapps` in `templates/functions/package.json` together.

## Suggest a change

Open an issue.
