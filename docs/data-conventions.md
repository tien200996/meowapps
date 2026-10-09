---
name: data-conventions
description: Choose where to store Firestore data
---

# Data conventions

Store every Firestore doc under one of three roots: `shops`, `private` or `system`.
The root decides who reads it: the admin page and the server, or only the server.
Time fields are `saveTime` and `expireTime`.

The examples come from meowengage, an app that sends Zalo messages for Shopify orders.

## TL;DR

- Put shop data the admin reads or edits under `shops/{shopId}/integrations/{name}`.
- Put OAuth tokens and anything the shop mustn't read under `private/{shopId}/integrations/{name}`.
- Put server-only data under `system/{name}/{kind}`.
- Use the full shop domain as `shopId`: `myshop.myshopify.com`.

## Where data lives

A Firestore path alternates a collection and a doc.
`shops/{shopId}/integrations/zalo` is the doc `zalo` in the collection `integrations` of one shop.
The admin page signs in as its shop, and the Firestore rules of meowapps let it read and write only `shops/{shopId}`.
The server skips the rules, so it reads every path.

| Data | Path | Client |
| --- | --- | --- |
| Settings | `shops/{shopId}/integrations/{name}` | read, write |
| Drafts, logs | `shops/{shopId}/integrations/{name}/{kind}/{id}` | read, write |
| OAuth tokens | `private/{shopId}/integrations/{name}` | none |
| Queues | `system/{name}/{kind}/{id}` | none |
| Short-lived docs | `system/{name}/temp/{id}` | none |

meowengage uses `zalo` as `{name}`.
It keeps the message logs where the admin can read them, and the Zalo token where only the server can.

`functions/zalo-routes.js`:

```js
static #locateLog(shopId, logId) {
  return MeowBackend.appDatabase.doc(`shops/${shopId}/integrations/zalo/logs/${logId}`)
}

static #locateToken(shopId) {
  return MeowBackend.appDatabase.doc(`private/${shopId}/integrations/zalo`)
}
```

Its queue sits at `system/zalo/queue/{shopId}_{logId}`, and its short-lived docs at `system/zalo/temp/{stateId}`.

## Fields

- `saveTime`: ms since epoch (`Date.now()`).
  Sort by it.
- `expireTime`: a `Date`.
  Required on `temp` docs.
  TTL (time to live) deletes the doc after that time.
  meowapps turns on TTL for `expireTime` in every collection named `temp`, in `.meowapps/firestore.indexes.json`.
  Check it on read, because TTL deletes up to a day late.

meowengage saves a state doc for 10 minutes while the merchant connects Zalo.
`pendingState` is that doc, read back when Zalo sends the merchant back to the app.
Firestore returns a `Date` as a Timestamp, so the check reads it with `toMillis()`.

`functions/zalo-routes.js`, the save and the check:

```js
await ZaloRoutes.#locateState(stateId).set({ shopId, codeVerifier, expireTime: new Date(Date.now() + ZaloRoutes.#stateLifetime) })
```

```js
if (!pendingState || pendingState.expireTime.toMillis() < Date.now()) return httpResponse.status(400).send('expired')
```

## Don't

**Don't** store tokens under `shops/{shopId}/…`.
**Do** use `private/{shopId}/integrations/{name}`.
**Why:** the client can write anything under `shops/{shopId}`.

**Don't** call `MeowBackend.appDatabase.collectionGroup('logs')`.
**Do** queue work in `system/{name}/queue/{id}`.
**Why:** collection group queries need indexes the app can't declare.

**Don't** use `shops/myshop/…`.
**Do** use `shops/myshop.myshopify.com/…`.
**Why:** the Firestore rules match the path with the full shop domain in the sign-in token, so the admin page can't read `shops/myshop/…`.

**Don't** name a collection `temp` outside `system/{name}`.
**Do** use `system/{name}/temp/{id}`.
**Why:** TTL deletes by collection name, anywhere in the database.

## Learn more

- [Cloud Firestore Data model](https://firebase.google.com/docs/firestore/data-model): docs, collections and subcollections.
- [Get started with Cloud Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started): how rules guard the client, and why the server skips them.
- [Manage data retention with TTL policies](https://firebase.google.com/docs/firestore/ttl): how TTL deletes expired docs, typically within 24 hours.
