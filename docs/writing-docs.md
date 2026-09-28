---
name: writing-docs
description: Write a meowapps doc
---

# Writing docs

Rules for every file in `docs/`. Read before adding or editing one.

## TL;DR

- Start each file with frontmatter: `name` and `description`.
- Write `description` as one imperative line that names the task.
- Open the body with a TL;DR of the rules that break things when ignored.
- Describe the current state only.

## Frontmatter

```md
---
name: {fileName}
description: {Verb} {task}
---
```

- `name`: the file name without `.md`.
- `description`: one line that starts with a verb, like `Deploy on push to main with GitHub Actions`. `meowapps` prints it under the file path in its help.

## Body

1. `# Title`, then one line on what the rules cover.
2. `## TL;DR`: 3–7 imperative rules. A rule belongs here if breaking it forces a data migration or breaks a deploy.
3. Sections with tables or lists, each rule followed by a concrete example.
4. `## Don't`: plausible mistakes as **Don't** / **Do** / **Why**.

## Placeholders

- Write every value the reader fills in as `{camelCase}` in braces: `{shopId}`, `{name}`, `{project}`.
- Use the same placeholder name for the same value in every doc.
- Follow a placeholder with one real value when its format isn't obvious: `{shopId}`, like `myshop.myshopify.com`.

## Style

- Put the rule first, so the first line of each item is enough to act on.
- Write commands, not suggestions: "Put tokens under `private/`", not "tokens should go under `private/`".
- Give a **Why** only when a rule looks arbitrary, in one sentence.
- Use real paths, field names and commands that can be copied.

## Don't

**Don't** use emoji. **Do** write **Don't** / **Do** / **Why**.

**Don't** write placeholders as `<project>`, `PROJECT` or `xxx`. **Do** write `{project}`. **Why:** one style tells the reader what to replace.

**Don't** use examples from one app, like `zalo`. **Do** use placeholders.

**Don't** tell history, like "we used to…". **Do** state what exists now. **Why:** readers take the old way as still allowed.

**Don't** document features that don't exist yet. **Do** add the rule when the code lands.

**Don't** write a vague `description`, like "Set up or fix deploys". **Do** name the task.
