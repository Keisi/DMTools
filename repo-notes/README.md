# repo-notes — DMTool-FrontEnd persistent knowledge base

A tracked, accumulating store of **non-obvious things learned from real scenarios and
issues** while working on the DMTool-FrontEnd SPA — recurring gotchas, the cross-boundary
flow between this client and the DMTool backend API, and diagnostic recipes that worked. It
is the durable, repo-scoped layer that sits between:

- **`CLAUDE.md`** (repo root) — the stable architecture / how-to-build doc (changes rarely).
- **`.handovers/`** (gitignored, per-session) — the full blow-by-blow of one piece of work.
- **global `~/.claude` memory** — cross-project facts, not DMTool-specific.

A note here is the *distilled, reusable lesson* extracted from a handover or investigation —
the thing a future session needs to know so it doesn't re-derive it from scratch.

## How it loads (and why it saves tokens)

- **`INDEX.md` is `@import`-ed from the root `CLAUDE.md`**, so it loads into every
  DMTool-FrontEnd session automatically. Keep it **lean** — one line per note (pointer + a
  short hook).
- **Note bodies (`<slug>.md`) are NOT imported.** A session reads a body only when the index
  hook tells it the note is relevant to the task at hand.
- That split is the whole point: the always-loaded cost stays tiny, while the knowledge base
  can grow indefinitely. The savings come from *not re-deriving* expensive discoveries (build
  failures, contract drift, browser-verification dead ends, cross-boundary tracing) — a
  session reads a 1-2 KB note instead of burning tens of thousands of tokens rediscovering the
  same thing.

## The bar — what to record

Record something only if **all** of these hold:

1. It's **durable** — true across pieces of work, not a one-off status (those belong in `.handovers/`).
2. It's **non-obvious** — you had to dig to learn it; a fresh session wouldn't guess it.
3. It's **not already** in `CLAUDE.md`, the code, or git history.

Good: "the backend serializes enums as numbers, not strings", "`oby verify`'s build step is a
false negative here — npm can't spawn under it", "character access is owner-scoped so another
account's id returns 404 in browser verification", "the spectral per-call daemon dies between
invocations — use `spectral batch`". Bad: a piece-of-work status, a fix already visible in
`git log`, anything restating the architecture doc. **If a session has nothing durable to add,
it should add nothing** — do not invent notes to satisfy the reminder.

## How to add a note

1. Write the body as `repo-notes/<short-kebab-slug>.md` using the template below.
2. Add one line to `INDEX.md`: `- [Title](<slug>.md) — one-line hook of when it's relevant.`
3. Commit it with the related code change (it's tracked — teammates get it too).

## Template

```markdown
# <Title — the lesson, stated as a fact>

**Scope:** <which screens/layers/flows this touches>

## The gotcha / what's true
<the durable, non-obvious fact and why it matters>

## How it shows up / how to diagnose
<symptoms, error signatures, the read-only recipe that worked>

## Pointers
<file:line anchors, related notes [[slug]], and the handover/work with full detail>
```
