---
name: app-pricing
description: Charge merchants with Shopify App Pricing
---

# App pricing

Create plans in the Partner Dashboard.
Shopify then hosts the plan page and charges the merchant.
In the app, `getPlan` checks the plan, `readPlan` gives the link to the plan page, and `reportUsage` bills each action.

The examples come from meowengage, an app that sends Zalo messages for Shopify orders.

## TL;DR

- Create plans in the Partner Dashboard, not in code.
- Pick plan names and handles once.
  Shopify never lets you change them.
- Use one event handle for the usage meter of every plan, like `zalo-messages`.
  Send exactly that string.
- Open the app once on each store after install.
  `/api/auth` then stores the token that `getPlan` and `reportUsage` need.

## Step 1: create plans

A plan is what the merchant pays, like `Basic` for $19 a month.
A usage meter counts billable actions, like Zalo messages.
The event handle of the meter is the string that the app sends.

1. Partner Dashboard → app → **Distribution** → **Manage submission**, or **Manage listing** once the app is published.
2. Create a listing in one language.
   It can stay a draft.
3. Open **Pricing content** → **Manage**, then **Add** a public or private plan.
4. For a public plan, fill in **Display name** and **Top features** for every listing language.
   Shopify hides a public plan that has none.

| Field | Example |
| --- | --- |
| Plan name for merchant invoices | `Basic` |
| Internal plan handle | `basic` |
| Redirect URL | `/` |
| Monthly charge | `19` |
| Usage charge | event handle `zalo-messages`, **Tiered, graduated**, tier 1 `$0` up to `{includedUnits}` |

- Bill usage only on monthly plans.
  Shopify can't combine usage charges with yearly-only plans.
- Test with a private plan limited to your dev store.
  Dev stores in the same Partner organization get every plan free.

## Step 2: check the plan

When a store gets an order, Shopify calls the webhook `/api/webhooks/orders/create` of meowengage, and `handleOrder` runs.
It gets `{ shopId }` as its 3rd argument, like every route.
It sends no Zalo message when the store has no plan.

`functions/zalo-routes.js`, shortened:

```js
import { MeowBackend } from 'meowapps/functions'

if (!(await MeowBackend.getPlan(shopId))) return
```

- `getPlan` returns the plan name, like `Basic`.
- It returns `null` when the store has no plan.
- It throws when Shopify can't answer.
  Let a webhook throw.
  Shopify then retries it 8 times over 4 hours.

## Step 3: send the merchant to the plan page

App Store review requires a way to change plans inside the app, so meowengage shows the plan on its Settings page with a button to change it.
`<meow-app>` sets `this.meowApp` on every page, and its `buildHtml` escapes every value.
`Đổi gói` means "Change plan", and `Chọn gói` means "Choose a plan".

`public/services/zalo-account.js` and `public/pages/meow-settings.js`, shortened:

```js
const { buildHtml, readPlan } = this.meowApp
const { planName, planUrl } = await readPlan()
this.innerHTML = buildHtml`<s-button href="${planUrl}" target="_top">${planName ? 'Đổi gói' : 'Chọn gói'}</s-button>`
```

- `readPlan` returns the plan name, or `null` when the store has no plan.
  It also returns the URL of the plan page.
- Turn on `embedded_app_direct_api_access = true` under `[access.admin]` in `shopify.app.toml`.
  Without it, `readPlan` throws.
- Keep `target="_top"`.
  The app runs in an iframe, and the plan page must open outside it.

## Step 4: report usage

meowengage bills each Zalo message it sends.
It saves a log doc for each message, with the id `{orderEvent}-{orderId}`, like `paid-{orderId}`.
`logReference` points to that log doc.

`functions/zalo-routes.js`, shortened:

```js
static #usageHandle = 'zalo-messages'

static #reportSend(shopId, logReference) {
  return MeowBackend.reportUsage(shopId, ZaloRoutes.#usageHandle, logReference.id)
}
```

- Call it after the billable action succeeds.
  meowengage calls it only after Zalo answers that the message is sent.
- Each call adds 1 unit.
- Make the action id unique per action and at most 64 characters, like the id of the log doc.
- Send the same action id again on retries.
  Shopify never bills a key twice.
  When a webhook comes again for a sent message, meowengage reports the same log id again.
- Check Dev Dashboard → **Logs** → **App billing event** for **Billing result code** `SUCCESS`.
  The API answers `202` even when billing fails.

## When something fails

| Error | Fix |
| --- | --- |
| The plan page shows 404 | Give the store a plan it can see: a public plan with a display name, or a private plan for that store |
| `getPlan` or `reportUsage` throws `No Shopify token for {shopId}` | Open the app once on that store |
| `401 https://{shopId}/admin/oauth/access_token` | The merchant opens the app again, because the token ends after an uninstall or 90 days without use |
| Billing result code `NO_SUBSCRIPTION` | Give the store a plan with this meter |
| The event is missing under **App billing event** | Send the event handle of the meter exactly, because handles are case-sensitive |

## Don't

**Don't** wait for the `app_subscriptions/update` webhook.
**Do** call `getPlan` when you need the plan.
**Why:** Shopify doesn't send it for App Pricing.

**Don't** read usage from the Admin API.
**Do** read it from the Partner API `activeSubscription`, with a Partner API token.
**Why:** the Admin API doesn't return App Pricing meters, and the App Events API only accepts events.

**Don't** create charges with `appSubscriptionCreate`.
**Do** create plans in the Partner Dashboard.
**Why:** Shopify creates the subscription when the merchant approves a plan.

**Don't** let the request body decide whether an action is billed.
**Do** decide on the server.
For example, the test send route of meowengage sets `testFlag: true` itself, and a message with `testFlag` is never billed.
**Why:** a merchant can call `/api/*` with any body.

**Don't** gate features on the plan that `readPlan` returns.
**Do** call `getPlan` on the server.
**Why:** the merchant controls the browser.

## Learn more

- [Shopify App Pricing](https://shopify.dev/docs/apps/launch/billing/shopify-app-pricing): plans, the plan page and subscriptions.
- [Setup usage charges](https://shopify.dev/docs/apps/launch/billing/shopify-app-pricing/subscription-billing/setup-usage-charges): meters, and fixed, graduated and volume pricing.
- [Build a Billing Event](https://shopify.dev/docs/apps/launch/billing/shopify-app-pricing/subscription-billing/build-billing-event): the event that `reportUsage` sends, and every billing result code.
- [Verify webhook deliveries](https://shopify.dev/docs/apps/build/webhooks/verify-deliveries): how Shopify retries a webhook that fails.
