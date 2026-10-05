---
name: deploy-github-actions
description: Deploy on push to main with GitHub Actions
---

# Deploy with GitHub Actions

Push to `main` deploys Firebase (hosting, functions, rules) and Shopify (app config).

## TL;DR

- Do the one-time setup once per Firebase project.
- Commit `.firebaserc` with the Firebase project ID.
- Add the 4 GitHub secrets, then copy the workflow.

## One-time setup

1. **Firebase**: Blaze plan, Firestore database, Authentication, a Web app
2. **Deploy service account**: Editor, Secret Manager Admin, Cloud Functions Admin, then a JSON key
3. **Runtime service account**: Service Account Token Creator on `{projectNumber}-compute@developer.gserviceaccount.com`, where `{projectNumber}` is digits, like `123456789012`
4. **Shopify**: `application_url` and `redirect_urls` in `shopify.app.toml` point to `https://{project}.web.app`
5. **App Automation Token**: Dev Dashboard → app → Settings

## .firebaserc

Create it at the app root:

```sh
npx meowapps firebase use --add
```

It writes:

```json
{ "projects": { "default": "{project}" } }
```

`meowapps` copies it into `.meowapps/` before each run and back after, so `meowapps firebase …` targets `{project}` without `--project`.

## GitHub secrets

| Secret | Value |
| --- | --- |
| `GCP_SA_KEY` | the deploy service account JSON key |
| `SHOPIFY_API_KEY` | the app's client ID |
| `SHOPIFY_API_SECRET` | the app's client secret |
| `SHOPIFY_APP_AUTOMATION_TOKEN` | the App Automation Token |

Add the app's own secrets too, and list them in the workflow loop.

## Workflow

`.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    env:
      SHOPIFY_API_KEY: ${{ secrets.SHOPIFY_API_KEY }}
      SHOPIFY_API_SECRET: ${{ secrets.SHOPIFY_API_SECRET }}
      SHOPIFY_APP_AUTOMATION_TOKEN: ${{ secrets.SHOPIFY_APP_AUTOMATION_TOKEN }}
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 22
      - uses: google-github-actions/auth@v3
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}
      - run: npm ci
      - run: sed -i "s/__SHOPIFY_API_KEY__/$SHOPIFY_API_KEY/" public/index.html
      - run: |
          for name in SHOPIFY_API_KEY SHOPIFY_API_SECRET; do
            printf %s "${!name}" | npx meowapps firebase functions:secrets:set $name --data-file -
          done
      - run: npx meowapps firebase deploy --force
      - run: npx meowapps firebase functions:secrets:prune --force
      - run: npx meowapps shopify app deploy --config shopify.app.toml --allow-updates
```

## When a step fails

| Error | Fix |
| --- | --- |
| `No currently active project` | Commit `.firebaserc` at the app root |
| `Permission denied to get service`, `secretmanager.secrets.get denied`, `cloudfunctions.functions.setIamPolicy is required` | Grant the deploy service account Editor, Secret Manager Admin and Cloud Functions Admin |
| `iam.serviceAccounts.signBlob denied` in the `handleApi` function logs | Grant Service Account Token Creator to `{projectNumber}-compute@developer.gserviceaccount.com` |
| `starts with a reserved prefix` | Rename the secret so it doesn't start with `FIREBASE_`, `X_GOOGLE_`, `EXT_` or `KIT_` |
| `/api/auth` returns 401 after a green deploy | Pipe secrets with `printf %s`, then push again |
| `No matching version found for meowapps` | Wait until the version leaves "Validating" on npm |
| `not approved to subscribe to webhook topics containing protected customer data` | Partner Dashboard → app → API access requests → Protected customer data access, then Step 1 |

## Don't

**Don't** edit `.meowapps/.firebaserc`. **Do** edit `.firebaserc` at the app root. **Why:** the root file overwrites it on the next run.

**Don't** commit the real client ID in `index.html`. **Do** keep `__SHOPIFY_API_KEY__`. **Why:** CI replaces it with the key of the app it deploys.

**Don't** pipe secrets with `printenv` or `echo`. **Do** use `printf %s "${!name}"`. **Why:** they add a newline, and Firebase stores it in the secret.

**Don't** pass `--force` to `functions:secrets:set`. **Do** run `functions:secrets:prune --force` after deploy. **Why:** each set adds a billed version, and `--force` redeploys functions once per secret.

**Don't** use `shopify app deploy --force` or `SHOPIFY_CLI_PARTNERS_TOKEN`. **Do** use `--allow-updates` with `SHOPIFY_APP_AUTOMATION_TOKEN`. **Why:** Shopify CLI 4 dropped both.

**Don't** add `include_config_on_deploy` to `[build]`. **Do** leave it out. **Why:** Shopify CLI 4 always deploys the config and warns about the field.

**Don't** let CI pick the Shopify config. **Do** pass `--config shopify.app.toml`. **Why:** with a `shopify.app.dev.toml` next to it, the right app gets deployed no matter which config `shopify app config use` picked.

**Don't** point two tomls at the same `application_url`. **Do** give each Shopify app its own Firebase project. **Why:** one backend holds one `SHOPIFY_API_KEY`, so the other app's session tokens get 401.

**Don't** stop after `npm run dev` when dev and prod share one Shopify app. **Do** push to `main` again. **Why:** dev points the app's URLs at the tunnel.
