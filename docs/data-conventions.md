# Data best practices

A Firestore layout that works well for meowapps apps.

## Layout

```
shops/{shopId}/integrations/{name}               settings, read by the shop's admin
shops/{shopId}/integrations/{name}/{kind}/{id}   drafts, logs
private/{shopId}/integrations/{name}             tokens, server only
private/{shopId}/wallet                          balance, server only
system/{name}/{kind}/{id}                        queues, server only
system/{name}/temp/{id}                          short-lived docs, deleted after expireAt
```

The default rules let a signed-in shop read and write `shops/{shopId}/**`, and deny everything else.

## Gotchas

**Do** keep money, tokens and anything the shop mustn't edit under `private/`. **Why:** the client can write anything under `shops/{shopId}`.

**Do** set `expireAt` on `temp` docs and check it on read. **Why:** TTL deletes them, up to a day late.

**Don't** name any other collection `temp`. **Why:** TTL matches the collection name anywhere in the database.

**Do** queue cross-shop work under `system/{name}`. **Don't** use collection group queries. **Why:** they need indexes the app can't declare.
