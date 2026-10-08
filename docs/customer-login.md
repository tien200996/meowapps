---
name: customer-login
description: Sign customers in with your own login page
---

# Customer login

The app becomes the identity provider of Shopify customer accounts. Shopify asks the app who the customer is, your login page checks them, and the app gives Shopify a signed token.

## TL;DR

- Use a Shopify Plus store with new customer accounts. Only Plus can connect an identity provider.
- Export `handleIdentity`. It keeps 1 instance warm, and Firebase bills it with no traffic, because Shopify fails the login when a route takes more than 1 second.
- Open the app once on each store, because `/authorize` reads the domains of the shop with the token that `/api/auth` stores.
- Send a verified `email` in `customerClaims`, because Shopify finds or creates the customer by email.
- Keep `customerClaims.sub` the same for a customer, because Shopify links the customer to it.
- Paste the discovery URL again when the host of the app changes, like a new tunnel in `npm run dev`, because the discovery URL uses that host.

## How it works

The merchant sets up each store once:

```
Merchant ── enters the login page URL in the app admin ──▶ the app shows discoveryUrl, clientId, clientSecret
Merchant ── pastes them ─────────────────────────────────▶ Shopify admin → Customer accounts → Identity provider
```

Then every sign-in runs these steps:

```
Customer          Shopify          handleIdentity        login page           your route
   │ 1. Sign in      │                   │                     │                    │
   │────────────────▶│──── /authorize ──▶│                     │                    │
   │◀──────── 2. redirect with ticketId ─┴────────────────────▶│                    │
   │ 3. fills the login form ─────────────────────────────────▶│                    │
   │                 │                   │                     │── 4. ticketId ────▶│
   │                 │                   │                     │◀─ 5. callbackUrl ──│
   │◀─────────────── 6. redirect to callbackUrl ───────────────│                    │
   │────────────────▶│──── 7. /token ───▶│                     │                    │
   │◀── 8. signed in │◀─── ID token ─────│                     │                    │
```

1. The customer clicks Sign in, which opens `/customer_authentication/login` on the store. Shopify sends them to `/authorize`.
2. `/authorize` saves a ticket and sends them to the login page with `?ticketId={ticketId}`.
3. The customer fills the login form.
4. The page posts `ticketId` and the form to your route through the app proxy.
5. Your route checks the customer and calls `approveIdentity`, which returns `callbackUrl`.
6. The page opens `callbackUrl`, a Shopify URL with a one-time code.
7. Shopify trades the code at `/token` for a signed ID token.
8. Shopify finds or creates the customer by email and signs them in.

meowapps runs steps 1, 2, 5 and 7. You write the login page and the route that checks the customer.

## Step 1: export handleIdentity

`functions/index.js`:

```js
import { MeowBackend } from 'meowapps/functions'
import { AppRoutes } from './app-routes.js'

export const { handleApi, proxyEmulator, handleIdentity } = MeowBackend.createFunctions({
  '/api/proxy/login/check': AppRoutes.checkLogin,
})
```

`handleIdentity` serves these routes under `https://{appHost}/api/public/identity`:

| Route | Shopify calls it to |
| --- | --- |
| `/.well-known/openid-configuration` | find the other routes |
| `/authorize` | send the customer to your login page |
| `/token` | trade a code or a refresh token for tokens |
| `/.well-known/jwks.json` | check the token signature |
| `/userinfo` | read the customer claims |
| `/logout` | sign the customer out |

## Step 2: set up each store

Shopify has no API for this step, so the merchant copies 3 values by hand. The built-in route `/api/identity` saves the login page URL and returns the values. The client secret stays the same on every call.

1. From an admin page, send the URL of the login page and show what comes back:

   ```js
   const { discoveryUrl, clientId, clientSecret } = await this.meowApp.callApi('/api/identity', {
     httpMethod: 'POST',
     requestBody: { loginUrl: 'https://{shopDomain}/pages/{loginPage}' },
   })
   ```

   Call it without a body to read the values and the saved `loginUrl`.

2. In Shopify admin, go to **Settings** → **Customer accounts**. In the **Identity provider** section, click **Manage**, then **Connect to provider**.
3. Fill in the form:

   | Field | Value |
   | --- | --- |
   | Provider | Custom or other |
   | Identity provider name | any name up to 30 characters |
   | Well-known or discovery endpoint URL | `discoveryUrl` |
   | Client ID | `clientId` |
   | Client secret | `clientSecret` |
   | Additional scopes (other than openid and email) | `profile phone` |
   | Post-sign-out redirect URI parameter name | `post_logout_redirect_uri` |
   | Sync customer data | on, to import the claims of step 4 |

4. Click **Save**, then **Test connection**, then **Activate**.

The login page can't be `/customer_authentication/login`, because that page sends the customer to `/authorize` again.

You don't copy the callback URL and the sign-out URLs from **Setup configurations**. `/authorize` and `/logout` accept a URL when its host belongs to the shop:

- `shopify.com`, with the shop number in the path
- `{storeHandle}.account.myshopify.com` and `{storeHandle}.myshopify.com`
- the primary domain, like `your-store.com`
- the customer accounts domain, like `account.your-store.com`

They read the domains from the Admin API on each call, so a domain change in Shopify needs no step here. Every refused URL shows in the function logs as `Refused return URL`.

## Step 3: build the login page

The login page sits in the theme and talks to the app through the app proxy.

`shopify.app.toml`:

```toml
[app_proxy]
url = "https://{project}.web.app/api/proxy"
subpath = "{proxyPath}"
prefix = "apps"
```

The script of `/pages/{loginPage}`:

```js
const ticketId = new URLSearchParams(location.search).get('ticketId')
const checkResponse = await fetch('/apps/{proxyPath}/login/check', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ticketId }),
})
location.href = (await checkResponse.json()).callbackUrl
```

Add the fields of your login form to the body next to `ticketId`.

## Step 4: check the customer

`functions/app-routes.js`. Check the login form with your own rules, then fill `customerClaims` with the customer you checked:

```js
import { MeowBackend } from 'meowapps/functions'

export class AppRoutes {
  static async checkLogin(httpRequest, httpResponse, { shopId }) {
    const { ticketId } = httpRequest.body
    const customerClaims = { sub: '{accountId}', email: '{customerEmail}', email_verified: true, phone_number: '+84{phoneDigits}' }
    const callbackUrl = await MeowBackend.approveIdentity(shopId, ticketId, customerClaims)
    if (!callbackUrl) return httpResponse.status(410).json({ errorMessage: 'login expired' })
    httpResponse.json({ callbackUrl })
  }
}
```

- A route under `/api/proxy/` gets `{ shopId, customerId }` from the signed app proxy request. `customerId` is `null` for guests.
- `approveIdentity` returns `null` when the ticket is used, older than 30 minutes or from another shop. Send the customer back to sign in.
- It throws when `customerClaims` has no `sub`, no `email` or no `email_verified: true`.
- Shopify imports `given_name`, `family_name`, `phone_number`, `urn:shopify:customer:tags` and `urn:shopify:customer:addresses` when **Sync customer data** is on. With **Do not overwrite existing customer data**, they only fill empty fields.
- Send `phone_number` in E.164, like `+84912345678`, because one bad value skips the whole import.

## Step 5: sign a customer out

Call `revokeIdentity` when a customer must lose access, like when you close their account:

```js
await MeowBackend.revokeIdentity(shopId, '{accountId}')
```

- It deletes the refresh tokens of the customer. Shopify can't renew the session, so the customer is signed out within 1 hour, when the access token expires.
- Refresh tokens last 90 days.

## Data

| Path | Data |
| --- | --- |
| `private/{shopId}/integrations/identity` | client secret, `loginUrl` |
| `system/identity/keys/{keyId}` | signing keys |
| `system/identity/grants/{grantId}` | refresh tokens, stored by hash |
| `system/identity/temp/{entryId}` | tickets, codes and access tokens, stored by hash |

## When something fails

| Error | Fix |
| --- | --- |
| `/authorize` answers `invalid_request` and logs `No login page for {shopId}` | Enter the login page URL in the app admin |
| `/authorize` or `/logout` answers `invalid_request` and logs `Refused return URL` | The host of that URL doesn't belong to the shop |
| `/authorize` fails with `No Shopify token for {shopId}` | Open the app once on that store |
| `/authorize` fails with `Can't read the domains of {shopId}` | Read the GraphQL errors at the end of the message |
| `/token` answers `invalid_client` | Paste the `clientSecret` that `/api/identity` returns |
| Shopify can't read the discovery URL | Paste the `discoveryUrl` that the admin page shows on the current host |
| The customer has no phone in Shopify | Send `phone_number` in E.164 |

## Don't

**Don't** take `shopId` from the request body. **Do** pass the `shopId` of the `/api/proxy/` route context to `approveIdentity`. **Why:** `approveIdentity` then refuses a ticket from another shop.

**Don't** set `email_verified: true` on an email that someone else can own. **Do** use an email the customer verified, or one on a domain you own. **Why:** Shopify signs the customer in to the account with that email.

**Don't** change the email in `customerClaims` alone. **Do** update the email of the Shopify customer first. **Why:** Shopify finds the customer by email.

**Don't** serve customer data by `customerId` without a check. **Do** check that the data belongs to `customerId`. **Why:** the signature only proves that Shopify sent the request.
