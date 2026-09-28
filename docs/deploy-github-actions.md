# Deploy with GitHub Actions

Push to `main` deploys Firebase (hosting, functions, rules) and Shopify (app config).

## One-time setup

1. **Firebase** — Blaze plan, Firestore database, Authentication, a Web app
2. **Service account** — Editor, Secret Manager Admin, Cloud Functions Admin, then a JSON key
3. **Shopify** — `application_url` and `redirect_urls` in `shopify.app.toml` point to `https://<project>.web.app`
4. **App Automation Token** — Dev Dashboard → app → Settings

## GitHub secrets

| Secret | Value |
| --- | --- |
| `GCP_SA_KEY` | the service account JSON key |
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
            printenv $name | npx meowapps firebase functions:secrets:set $name --data-file - --project <project>
          done
      - run: npx meowapps firebase deploy --project <project> --force
      - run: npx meowapps firebase functions:secrets:prune --project <project> --force
      - run: npx meowapps shopify app deploy --allow-updates
```

## Gotchas

**Do** name secrets without `FIREBASE_`, `X_GOOGLE_`, `EXT_` or `KIT_`. **Why:** Firebase reserves those prefixes, and the emulator doesn't check.

**Do** keep `__SHOPIFY_API_KEY__` in `index.html`. **Don't** commit the real key. **Why:** CI replaces it with the key of the app it deploys.

**Do** register a Web app in the project. **Why:** the router reads its config from Hosting's `/__/firebase/init.json`.

**Do** prune secrets after deploy. **Don't** pass `--force` to `secrets:set`. **Why:** each set adds a billed version, and `--force` redeploys functions once per secret.

**Do** deploy Shopify with `--allow-updates` and `SHOPIFY_APP_AUTOMATION_TOKEN`. **Don't** use `--force` or `SHOPIFY_CLI_PARTNERS_TOKEN`. **Why:** Shopify CLI 4 dropped both.

**Do** grant Cloud Functions Admin and Secret Manager Admin on top of Editor. **Why:** Editor can't make HTTPS functions public or let them read secrets.

**Do** keep absolute paths in `.meowapps/firebase.json`. **Don't** go back to `../`. **Why:** `firebase deploy` rejects sources outside the folder of `firebase.json`.

**Do** push again after `npm run dev` when dev and prod share one app. **Why:** dev points the app's URLs at the tunnel.

**Do** wait for a new meowapps version to leave "Validating" on npm. **Don't** `npm install` it before. **Why:** npm hides it until its automated review ends.
