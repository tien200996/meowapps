---
name: code-conventions
description: Name, order and format code and commits
---

# Code conventions

Rules for the code of meowapps and of every app built on it, one rule for each choice. Every file then reads the same, whoever wrote it.

## TL;DR

- A Firestore field keeps its name after the first store installs the app, because renaming a stored field forces a data migration.
- The functions export as `handleApi` and `proxyEmulator`, because `firebase.json` routes to these names.
- An exported function keeps its name, because `firebase deploy --force` deletes the function under the old name.

## Names

A name tells what a thing is, so the reader knows it without opening it.

- A word is one part of a camelCase, PascalCase or kebab-case name: `shopId` has the words `shop` and `Id`.
- Every name you choose has exactly two words.
- Variables, fields, keys and classes are nouns. Functions and methods are verbs.
- A boolean ends in `Flag`.
- The rule covers Firestore fields, attributes, ids in HTML, route params and localStorage keys.
- A JS file has the name of its class in kebab-case: `zalo-account.js` holds `ZaloAccount`.
- An env or secret name counts its provider prefix as a namespace: `ZALO_APP_ID` is `ZALO_` and `APP_ID`.
- A name that a platform, a tool or an outside API sets stays as it is, like `connectedCallback`, `access_token` or the entry file `functions/index.js`. So do folder names, routes and Firestore paths.

```js
export class ZaloAccount {
  static draftsPath = 'integrations/zalo/drafts'

  static async loadAccount(meowApp) {}
}
```

## Classes

Every function lives in a class, and a file reads from the top: what it uses, what it runs, then how.

- A file holds its imports, then its classes. Only the `export const` lines that Firebase reads come after them.
- A class holds, in order: fields, the code that runs once in `static {}`, public methods, private methods.
- The code in `static {}` only calls functions.
- Private methods follow the order in which the class first mentions them.
- A helper is a method that two or more members use. Helpers go last, in the same order, and so do the methods that only helpers use.

```js
class MeowTopic extends HTMLElement {
  static #notesPath = 'integrations/learn/notes'

  static {
    customElements.define('meow-topic', MeowTopic)
  }

  renderPage({ savedNotes }) {
    if (this.routeParams.topicName === 'firestore') this.#renderFirestore(savedNotes)
    else this.#renderMissing()
  }

  #renderFirestore(savedNotes) {
    this.meowApp.bindAction('note-button', this.#addNote)
  }

  #renderMissing() {}

  async #addNote() {}
}
```

## Web pages

Pages own the data and draw the screen, components only show what they get, and services hold the logic that doesn't draw.

- `public/meowapps/meow-app.js` defines `<meow-app>`, which signs in, routes and runs each page. Every app keeps the same copy.
- `<meow-app>` sets `this.meowApp`, `this.shopId` and `this.routeParams`, calls `loadData()` if the page has it, then calls `renderPage(pageData)`.
- A page draws itself in `renderPage`, not in `connectedCallback`.
- A page sits in `public/pages/` and imports only services from `public/services/`.
- A component sits in `public/components/` and imports nothing. It reads its attributes and builds its DOM with `textContent`.
- A service sits in `public/services/` and imports only services. It holds the rules of an outside API and what pages share, like `ZaloTemplate`, which builds what Zalo receives.
- `innerHTML` gets HTML only from `this.meowApp.buildHtml`, which escapes every value.
- An action that calls an API runs through `this.meowApp.bindAction`, which shows loading and an error toast.
- The text of `<meow-app>` comes from its attributes in `index.html`, like `error-heading`.

```js
class MeowIndex extends HTMLElement {
  static {
    customElements.define('meow-index', MeowIndex)
  }

  renderPage() {
    const { buildHtml, bindAction } = this.meowApp
    this.innerHTML = buildHtml`<s-button id="hello-button">Call /api/hello as ${this.shopId}</s-button>`
    bindAction('hello-button', this.#callHello)
  }

  async #callHello() {
    await this.meowApp.callApi('/api/hello')
  }
}
```

## Format and commits

Code and commits follow one shape, so a diff shows only real changes.

- Names, strings and error messages are in English. Only the text that merchants read is in the app's language.
- Code has no comments, uses single quotes and has no semicolons.
- Every value whose meaning the code doesn't show has a name, like `refreshMargin` for `300_000`.
- A script reports a failure with `process.exitCode = 1`.
- A commit message is one line in English that starts with an imperative verb, with no final period and no attribution lines.
- Docs and prompts use simple words, short sentences, active voice and present tense.

```text
Add a send button to the template page
```

## Don't

**Don't** import one component from another. **Do** pass data down as attributes. **Why:** the page then holds all the data and state of the screen.

**Don't** set `innerHTML` with a plain template string. **Do** use `buildHtml`. **Why:** text from merchants, customers or Zalo can hold HTML that runs in the admin.

**Don't** call `process.exit()`. **Do** set `process.exitCode`. **Why:** `process.exit()` can stop the script before its output is written.
