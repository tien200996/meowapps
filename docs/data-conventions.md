---
name: data-conventions
description: Choose where to store Firestore data
---

# Data conventions

Rules for storing app data in Firestore. Read before adding a collection or field.

## TL;DR

- Put shop data the admin reads or edits under `shops/{shopId}/integrations/{name}`.
- Put OAuth tokens and anything the shop mustn't read under `private/{shopId}/integrations/{name}`.
- Put server-only data under `system/{name}/{kind}`.
- Use the full shop domain as `shopId`: `myshop.myshopify.com`.

## Where data lives

| Data | Path | Client |
| --- | --- | --- |
| Settings | `shops/{shopId}/integrations/{name}` | read, write |
| Drafts, logs | `shops/{shopId}/integrations/{name}/{kind}/{id}` | read, write |
| OAuth tokens | `private/{shopId}/integrations/{name}` | none |
| Queues | `system/{name}/{kind}/{id}` | none |
| Short-lived docs | `system/{name}/temp/{id}` | none |

## Fields

- `at`: ms since epoch (`Date.now()`). Sort by it.
- `expireAt`: `Date`. Required on `temp` docs. Check it on read, because TTL deletes up to a day late.

## Don't

**Don't** store tokens under `shops/{shopId}/…`. **Do** use `private/{shopId}/integrations/{name}`. **Why:** the client can write anything under `shops/{shopId}`.

**Don't** call `db.collectionGroup("logs")`. **Do** queue work in `system/{name}/queue/{id}`. **Why:** collection group queries need indexes the app can't declare.

**Don't** use `shops/myshop/…`. **Do** use `shops/myshop.myshopify.com/…`.

**Don't** name a collection `temp` outside `system/{name}`. **Do** use `system/{name}/temp/{id}`. **Why:** TTL deletes by collection name, anywhere in the database.
