---
name: doc-conventions
description: Write docs that save readers time
---

# Doc conventions

A doc saves time for a developer who adds one feature to their app.
They read the top, copy the example, fill in the placeholders, and it works.
Every doc in `docs/` has the same shape, so readers know where to look.

The examples come from `docs/app-pricing.md`.

## TL;DR

- Write only what you tested or what an official page says.
  Readers copy it into their app.
- Leave out the business rules of the example app.
  Readers take them as rules of meowapps.

## Shape

Every doc has these parts, in this order:

- Name the file with a noun phrase of 2 or more words in kebab-case, like `app-pricing.md`, and use the same name in `name`.
- Write `description` as `{Verb} {task}`, like `Charge merchants with Shopify App Pricing`.
- Use the file name in words as the title, like `# App pricing`.
- Under the title, put the bottom line up front: what the reader does and gets.
- Then name the app that the examples come from.
- Add a `## TL;DR` of the mistakes that cost the most time, like a broken deploy, sign-in or bill, or a data migration.
- In a feature doc, write the steps in the order the reader does them, as `## Step {number}: {task}`.
- Add a `## When something fails` table of each failure you tested: the exact error text or what the reader sees, and its fix.
- Write a `## Don't` section as **Don't** / **Do** / **Why**, each on its own line.
- End with a `## Learn more` section of 2–5 official pages as `[Title](url): what it explains`, and open each link before you add it.
- Add other sections, like `## How it works` or `## Data`, only where the reader needs them.

A feature doc shows how to add one feature, like `app-pricing.md`.
A conventions doc lists rules, like `code-conventions.md`, so it has topics instead of steps.
`npx meowapps` prints the path and the `description` of every doc.

`docs/app-pricing.md`, shortened:

```md
---
name: app-pricing
description: Charge merchants with Shopify App Pricing
---

# App pricing

Create plans in the Partner Dashboard.
Shopify then hosts the plan page and charges the merchant.

The examples come from meowengage, an app that sends Zalo messages for Shopify orders.

## TL;DR
## Step 1: create plans
## Step 2: check the plan
## When something fails
## Don't
## Learn more
```

## Content

- Show only what meowapps, Shopify or Firebase need, and leave out the business rules of the example app.
- Write only what you tested or what an official page says.
- Copy examples from real app code, replace client names with neutral ones, and mark cut code as `shortened`.
- Before an example, write the 2–3 facts the reader needs to understand it.
- Make each example readable without its source: explain every name the reader can't see, or cut it.
- Give exact commands, file paths and admin paths, like **Settings** → **Customer accounts**.
- Write values the reader fills in as `{camelCase}`, like `{shopId}`.
- Write one sentence per line, with simple words, active voice and present tense.

Step 4 of `app-pricing.md` follows each content rule.
Its facts explain `logReference` before the example uses it.
The label names the file and says that the code is shortened.

`docs/app-pricing.md`, shortened:

````md
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
````

## When something fails

| Error | Fix |
| --- | --- |
| `npx meowapps` lists a doc as `No description` | Add `description:` to its frontmatter |

## Don't

**Don't** put the business rules of the example app in a doc.
**Do** write what meowapps, Shopify or Firebase need.
For example, which email the loyalty app sends stays in that app, out of `customer-login.md`.
**Why:** readers take them as rules of meowapps and copy them.

**Don't** point the reader to code they can't open.
**Do** explain each name in the example, or cut it.
**Why:** the example apps aren't in this repo.

**Don't** add a link you didn't open.
**Do** open it, and check that it says what your line says.
**Why:** a page that moved or says something else costs the reader more time than no link.

**Don't** write two sentences on one line.
**Do** start each sentence on a new line.
**Why:** the raw file then reads one step at a time, and a diff shows the one sentence that changed.

## Learn more

- [Google developer documentation style guide](https://developers.google.com/style): how to write clear and consistent technical docs.
- [Procedures](https://developers.google.com/style/procedures): numbered steps, with one action in each step.
- [Code samples](https://developers.google.com/style/code-samples): how to show code in a doc.
- [Top 10 tips for Microsoft style and voice](https://learn.microsoft.com/en-us/style-guide/top-10-tips-style-voice): get to the point fast, and write like you speak.
