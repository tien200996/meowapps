---
name: theme-extensions
description: Add app blocks to the store theme
---

# Theme extensions

A theme app extension adds app blocks to the store theme. The merchant places a block in the theme editor, and the block calls the app through the app proxy.

## TL;DR

- Put every file directly in `assets`, `blocks`, `locales` or `snippets`. A deploy leaves out files in subfolders and at the root, like a `README.md`, without an error.
- Use an Online Store 2.0 theme. Vintage themes like Debut show no **Add section** on pages, so they can't take app blocks.

## Create the extension

```
npx meowapps shopify app generate extension -t theme_app_extension -n {extensionName}
```

It creates `extensions/{extensionName}/` with a sample star rating block. Delete the sample and write your own. Commit the `uid` that the CLI writes into `shopify.extension.toml`.

## Write a block

`blocks/loyalty-login.liquid`:

```liquid
<loyalty-login proxy-path="/apps/{proxyPath}/login">
  <form>
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

- `"target": "section"` makes an app block, and `enabled_on` limits it to page templates.
- The `t` filter reads `locales/{locale}.json`, and `"name"` reads `locales/{locale}.schema.json`.
- `defer` runs the script after the block markup, so the custom element finds its children.

`assets/loyalty-login.js` calls `/apps/{proxyPath}/login/phone`, which reaches the route `/api/proxy/login/phone`:

```js
const phoneResponse = await fetch(`${this.getAttribute('proxy-path')}/phone`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ phoneNumber }),
})
```

## Try it

1. Run `npm run dev`.
2. In the theme editor of the dev store, open a page template, click **Add section** → **Apps**, pick the block and save.
3. Check the extension:

   ```
   npx meowapps shopify theme check --path extensions/{extensionName} --config theme-check:theme-app-extension
   ```

## Don't

**Don't** show data from the app proxy with `innerHTML`. **Do** set `textContent`. **Why:** customer data can hold HTML that runs on the storefront.

**Don't** find elements by class in the block script. **Do** find them by `data-` attributes and field `name`s. **Why:** designers change classes and tags when they restyle the block.
