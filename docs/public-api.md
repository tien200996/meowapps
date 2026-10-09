---
name: public-api
description: Find what apps can rely on in meowapps
---

# Public API

Apps can rely on everything on this page.
A change to it needs a minor version.
Anything else in meowapps can change in any release.

The examples come from meowengage, an app that sends Zalo messages for Shopify orders, and from the starter app in `templates/`.

## TL;DR

- Import only `MeowBackend` from `meowapps/functions`.
  `package.json` exports no other path.
- Test your app before you take a minor update, like 0.4.2 to 0.5.0.
  While the version is 0.x, a minor update can break apps.

## Backend

| Member | What it does |
| --- | --- |
| `createFunctions(appRoutes, { secretNames })` | returns `{ handleApi, proxyEmulator, handleIdentity }` with the built-in routes and yours |
| `createSchedule(scheduleText, scheduleTask, { secretNames, timeZone })` | returns a function that runs on a schedule |
| `appDatabase` | the Firestore of the app, through the Admin SDK |
| `queryAdmin(shopId, adminQuery, queryVariables)` | calls the Admin GraphQL API with the offline token of the shop |
| `getPlan(shopId)` | returns the plan name, or `null` |
| `reportUsage(shopId, eventHandle, actionId)` | adds 1 unit to a usage meter |
| `embedPath(shopId, appPath, pathParams)` | returns the URL of an app page in the Shopify admin |
| `approveIdentity(shopId, ticketId, customerClaims)` | returns `callbackUrl`, or `null` |
| `revokeIdentity(shopId, customerSub)` | deletes the refresh tokens of a customer |

`ZaloRoutes` holds the routes of meowengage.
`secretNames` lists the Firebase secrets that its routes read, like `ZALO_APP_ID`.
`queueSchedule` is a cron text, `*/15 6-21 * * *`.

`functions/index.js`, shortened:

```js
import { MeowBackend } from 'meowapps/functions'
import { ZaloRoutes } from './zalo-routes.js'

export const { handleApi, proxyEmulator } = MeowBackend.createFunctions(
  {
    '/api/zalo/connect': ZaloRoutes.startConnect,
    '/api/webhooks/orders/create': ZaloRoutes.handleOrder,
  },
  { secretNames: ZaloRoutes.secretNames },
)

export const flushQueue = MeowBackend.createSchedule(ZaloRoutes.queueSchedule, ZaloRoutes.flushQueue, {
  secretNames: ZaloRoutes.secretNames,
  timeZone: ZaloRoutes.timeZone,
})
```

## Routes

Every route gets `(httpRequest, httpResponse, routeContext)`.
The path decides how meowapps checks the request and what `routeContext` holds.

| Path | Checked by | `routeContext` |
| --- | --- | --- |
| `/api/public/…` | nothing | `{}` |
| `/api/webhooks/…` | the Shopify webhook signature | `{ shopId }` |
| `/api/proxy/…` | the app proxy signature | `{ shopId, customerId }` |
| any other `/api/…` | the session token of the admin page | `{ shopId, sessionPayload, sessionToken }` |

- meowapps adds `/api/auth` and `/api/identity` to `handleApi`.
- `handleIdentity` serves the routes under `/api/public/identity`, as in [Customer login](customer-login.md).
- A path with no route answers 404, and a request that fails its check answers 401.
- A route that sends nothing answers 200.

## Web pages

`<meow-app>` in `index.html` shows the page whose `<meow-route>` matches the path.
On each page, it sets `this.meowApp`, `this.shopId` and `this.routeParams`, calls `loadData()` if the page has it, then calls `renderPage(pageData)`.
Its `error-heading` attribute is the heading of the error page and the text of the error toast.

| `this.meowApp` member | What it does |
| --- | --- |
| `buildHtml` | builds HTML from a template and escapes every value |
| `readDoc(docPath)` | reads a doc under `shops/{shopId}/` |
| `listDocs(collectionPath, { newestCount })` | lists the docs of a collection under `shops/{shopId}/`, newest `saveTime` first when you set `newestCount` |
| `writeDoc(docPath, docData)` | merges data into a doc under `shops/{shopId}/` |
| `callApi(apiPath, { httpMethod, requestBody })` | calls your backend with the session token |
| `queryAdmin(adminQuery, queryVariables)` | calls the Admin GraphQL API through App Bridge |
| `readPlan()` | returns `{ planName, planUrl }` |
| `bindAction(elementId, actionTask, eventName)` | runs the task on click, or on `eventName`, with loading and an error toast |

`MeowIndex` is the Home page of the starter app.
`bindAction` runs `#callHello` when the merchant clicks the button.

`templates/public/pages/meow-index.js`, shortened:

```js
renderPage() {
  const { buildHtml, bindAction } = this.meowApp
  this.innerHTML = buildHtml`<s-button id="hello-button">Call /api/hello</s-button>`
  bindAction('hello-button', this.#callHello)
}
```

## Data

meowapps owns these Firestore paths.

| Path | Data |
| --- | --- |
| `private/{shopId}/integrations/shopify` | the offline token of the shop |
| `private/{shopId}/integrations/identity` | the client secret and `loginUrl` of customer login |
| `system/identity/{kind}/{id}` | signing keys, refresh tokens, tickets and codes of customer login |

## Commands

| Command | What it does |
| --- | --- |
| `npx meowapps init` | links a Shopify app, and copies the starter app into a new folder |
| `npx meowapps shopify …` | runs the Shopify CLI at the version that meowapps pins |
| `npx meowapps firebase …` | runs the Firebase CLI at the version that meowapps pins, from `.meowapps/` |

## Don't

**Don't** import a file from inside meowapps, like `meowapps/functions/meow-backend.js`.
**Do** import `meowapps/functions`.
**Why:** `package.json` exports only that path, so Node refuses the others with `ERR_PACKAGE_PATH_NOT_EXPORTED`.

**Don't** write to the Firestore paths that meowapps owns.
**Do** keep app data under `integrations/{name}`, with a name of your own, as in [Data conventions](data-conventions.md).
**Why:** meowapps overwrites those docs, like the offline token on each `/api/auth`.

## Learn more

- [Semantic Versioning 2.0.0](https://semver.org/): what each number of a version means, and why anything can change in 0.x.
- [npm/node-semver](https://github.com/npm/node-semver): how `^0.4.2` takes 0.4.x updates and stops before 0.5.0.
- [Modules: Packages](https://nodejs.org/api/packages.html): how `exports` limits the paths that other code can import.
