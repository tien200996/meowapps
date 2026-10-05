---
name: billing
description: Charge merchants with Shopify App Pricing
---

# Billing

Shopify hosts the plan page and charges the merchant. The app checks the plan and reports usage.

## TL;DR

- Create plans in the Partner Dashboard, not in code.
- Pick plan names and handles once, because Shopify never lets you change them. `getPlan` returns the name, like `Basic`.
- Use one event handle for the usage meter of every plan, like `{eventHandle}`, and send exactly that string.
- Open the app once on each store after install. `/api/auth` stores the token that `getPlan` and `reportUsage` need.

## Create plans

1. Partner Dashboard → app → **Distribution** → **Manage submission**, or **Manage listing** once the app is published.
2. Create a listing in one language. It can stay a draft.
3. Open **Pricing content** → **Manage**, then **Add** a public or private plan.
4. For a public plan, fill in **Display name** and **Top features** for every listing language. Shopify hides a public plan that has none.

| Field | Example |
| --- | --- |
| Plan name for merchant invoices | `Basic` |
| Internal plan handle | `basic` |
| Redirect URL | `/` |
| Monthly charge | `19` |
| Usage charge | event handle `{eventHandle}`, **Tiered, graduated**, tier 1 `$0` up to `{includedUnits}` |

- Bill usage only on monthly plans. Shopify can't combine usage charges with yearly-only plans.
- Test with a private plan limited to your dev store. Dev stores in the same Partner organization get every plan free.

## Check the plan

```js
import { MeowBackend } from 'meowapps/functions'

const planName = await MeowBackend.getPlan(shopId)
if (!planName) return
```

- It returns the plan name, or `null` when the store has no plan.
- It throws when Shopify can't answer. Let a webhook throw, and Shopify retries it 8 times over 4 hours.

## Send the merchant to the plan page

App Store review requires a way to change plans inside the app.

```js
const { buildHtml, readPlan } = this.meowApp
const { planName, planUrl } = await readPlan()
this.innerHTML = buildHtml`<s-button href="${planUrl}" target="_top">${planName ? 'Change plan' : 'Choose a plan'}</s-button>`
```

- `readPlan` returns the plan name, or `null` when the store has no plan, and the URL of the plan page.
- Turn on `embedded_app_direct_api_access = true` under `[access.admin]` in `shopify.app.toml`, or `readPlan` throws.
- Keep `target="_top"`, because the app runs in an iframe.

## Report usage

```js
import { MeowBackend } from 'meowapps/functions'

await MeowBackend.reportUsage(shopId, '{eventHandle}', '{actionId}')
```

- Call it after the billable action succeeds. Each call adds 1 unit.
- Make `{actionId}` unique per action and at most 64 characters, like the id of the log doc.
- Send the same `{actionId}` again on retries. Shopify never bills a key twice.
- Check Dev Dashboard → **Logs** → **App billing event** for **Billing result code** `SUCCESS`. The API answers `202` even when billing fails.

## When something fails

| Error | Fix |
| --- | --- |
| The plan page shows 404 | Give the store a plan it can see: a public plan with a display name, or a private plan for that store |
| `getPlan` or `reportUsage` throws `No Shopify token for {shopId}` | Open the app once on that store |
| `401 https://{shopId}/admin/oauth/access_token` | The merchant uninstalled, or nothing used the token for 90 days. The merchant opens the app to fix it |
| Billing result code `NO_SUBSCRIPTION` | The store has no plan with this meter |
| The event is missing under **App billing event** | The event handle doesn't match the meter. Handles are case-sensitive |

## Don't

**Don't** wait for the `app_subscriptions/update` webhook. **Do** call `getPlan` when you need the plan. **Why:** Shopify doesn't send it for App Pricing.

**Don't** read usage from the Admin API. **Do** read it from the Partner API `activeSubscription`, with a Partner API token. **Why:** the Admin API doesn't return App Pricing meters, and the App Events API only accepts events.

**Don't** create charges with `appSubscriptionCreate`. **Do** create plans in the Partner Dashboard. **Why:** Shopify creates the subscription when the merchant approves a plan.

**Don't** let the request body decide whether an action is billed. **Do** decide on the server. For example, the server marks every test send as unbilled. **Why:** a merchant can call `/api/*` with any body.

**Don't** gate features on the plan that `readPlan` returns. **Do** call `getPlan` on the server. **Why:** the merchant controls the browser.
