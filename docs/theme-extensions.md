---
name: theme-extensions
description: Add app blocks to the store theme
---

# Theme extensions

Create a theme app extension with one command.
Write an app block in Liquid, and let its script call the app through the app proxy.
The merchant then adds the block to a page in the theme editor.

The examples come from a loyalty app that signs members in with their phone number and PIN.

## TL;DR

- Put every file directly in `assets`, `blocks`, `locales` or `snippets`.
  A deploy leaves out files in subfolders and at the root, like a `README.md`, without an error.
- Use an Online Store 2.0 theme.
  Vintage themes like Debut show no **Add section** on pages, so they can't take app blocks.

## Step 1: create the extension

An extension is a folder in `extensions/`.
`shopify app deploy` releases it with the app.

```sh
npx meowapps shopify app generate extension -t theme_app_extension -n {extensionName}
```

It creates `extensions/{extensionName}/` with a sample star rating block.
Delete the sample and write your own.
Commit the `uid` that the CLI writes into `shopify.extension.toml`.

## Step 2: write a block

An app block is a Liquid file in `blocks/` with a `{% schema %}` at the end.
The schema tells the theme editor the name of the block and where it can go.
`<loyalty-login>` is a custom element, and `assets/loyalty-login.js` defines it.

`blocks/loyalty-login.liquid`, shortened:

```liquid
<loyalty-login proxy-path="/apps/loyalty/login">
  <form data-login-step="phone">
    <input name="phoneNumber" type="tel" required>
    <button>{{ 'phoneStep.continueButton' | t }}</button>
  </form>
</loyalty-login>

<script src="{{ 'loyalty-login.js' | asset_url }}" defer></script>

{% schema %}
{
  "name": "t:loginBlock.blockName",
  "target": "section",
  "stylesheet": "loyalty-login.css",
  "enabled_on": { "templates": ["page"] },
  "settings": []
}
{% endschema %}
```

- `"target": "section"` makes an app block.
  `enabled_on` limits it to page templates.
- The `t` filter reads `locales/{locale}.json`.
  `"name"` reads `locales/{locale}.schema.json`.
- `defer` runs the script after the block markup, so the custom element finds its children.

The app proxy in `shopify.app.toml`, with `subpath = "loyalty"`, sends `/apps/loyalty/…` on the store to `/api/proxy/…` on the app.
So `#callRoute('/phone', { phoneNumber })` posts to `/apps/loyalty/login/phone`, which reaches the route `/api/proxy/login/phone`.
`#ticketId` is the `ticketId` from the page URL, as in [Customer login](customer-login.md).

`assets/loyalty-login.js`, shortened:

```js
async #callRoute(routePath, requestBody) {
  const routeResponse = await fetch(`${this.getAttribute('proxy-path')}${routePath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticketId: this.#ticketId, ...requestBody }),
  })
  const responseBody = await routeResponse.json().catch(() => ({}))
  if (!routeResponse.ok) throw Object.assign(new Error(`${routePath} answered HTTP ${routeResponse.status}`), responseBody)
  return responseBody
}
```

## Step 3: try it

1. Run `npm run dev`.
2. In the theme editor of the dev store, open a page template, click **Add section** → **Apps**, pick the block and save.
3. Check the extension:

   ```sh
   npx meowapps shopify theme check --path extensions/{extensionName} --config theme-check:theme-app-extension
   ```

## When something fails

| Error | Fix |
| --- | --- |
| The theme editor shows no **Add section** on a page | Use an Online Store 2.0 theme, because vintage themes like Debut can't take app blocks |
| A file is missing on the store after a deploy | Move it directly into `assets`, `blocks`, `locales` or `snippets` |
| The block's calls to `/apps/{subpath}/…` answer 404, and the app logs show no request | In **Settings** → **Apps** → `{appName}`, click **Customize URL** and change **App Proxy URL** from `/apps/{subpath}-1` back to `/apps/{subpath}` |

## Don't

**Don't** show data from the app proxy with `innerHTML`.
**Do** set `textContent`.
For example, `#updateValues` sets `textContent` on every `[data-login-value]`.
**Why:** customer data can hold HTML that runs on the storefront.

**Don't** find elements by class in the block script.
**Do** find them by `data-` attributes and field `name`s.
**Why:** designers change classes and tags when they restyle the block.

## Learn more

- [About theme app extensions](https://shopify.dev/docs/apps/build/online-store/theme-app-extensions): app blocks, app embed blocks and what an extension holds.
- [Configure theme app extensions](https://shopify.dev/docs/apps/build/online-store/theme-app-extensions/configuration): the 4 folders, `target` and `enabled_on`.
- [App blocks for themes](https://shopify.dev/docs/storefronts/themes/architecture/blocks/app-blocks): which theme sections can hold app blocks.
- [About app proxies and dynamic data](https://shopify.dev/docs/apps/build/online-store/app-proxies): how `/apps/{subpath}` on the store reaches the app.
