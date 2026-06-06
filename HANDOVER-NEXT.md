# Handover — DMTool-FrontEnd (for the next session)

Written 2026-06-06 at the end of a long build session. This is the authoritative
"where things stand + what to do next" doc. Companion: `FRONTEND-CONTEXT.md`
(architecture/API map) and `CLAUDE.md` (commands, constraints, spectral recipe,
quality-gate notes). Backend lives at `C:\Users\keisi\source\repos\DMTool`
(`DMTool.slnx`); the authoritative API contract is its `Models/*` + `Entities/Enums/*`.

## Current state
- **Git:** repo on `main`, remote `origin` (Azure DevOps `DMTools-Frontend`). HEAD =
  `5d6e705`. Working tree clean. All session work is committed + pushed.
- **Gates:** `npm run build` (`tsc -b && vite build`) and `npm run lint` both GREEN.
  There is **no test runner** — `tsc -b` + eslint are the correctness gates.
- **Dev server:** `npm run dev` → http://localhost:5173 (proxies `/api` → backend
  `:3501`). May not survive a context clear — restart with `npm run dev` if down.
- **Backend:** IIS at `:3501`. Test login **`dungeonmaster` / `Passw0rd!23`**.
  Characters are **owner-scoped** (IDOR fix) — you only see your own; another
  account's id returns 404. The owner currently has one real character ("Keisi").

## Done this session
`types.ts` reconciled to the live backend contract; character **builder**
(multiclass, equipment, point-buy + Manual ability modes, creation validations,
non-proficient-gear red flags, primary-ability badge, skill governing-ability
labels, StepNav valid/incomplete coloring); **level-up** dialog (plan→choose→apply,
portal-centered, Escape-to-close, "Still needed" apply feedback, ASI shows current
score, aligned ASI rows); rich **character sheet** (attacks, resources, spellcasting,
features, traits, encumbrance, status, equipped gear) with custom token-driven
**tooltips** (ability/save/skill/attack/spellcasting breakdowns; vitals; aligned
equipped-row proficiency warnings). Backend IDOR/BOLA fix + class
proficiency/primary-ability exposure were handed off and landed (see
`INCOMING-FROM-BACKEND.md`).

## ⏳ IN-FLIGHT — the one pending feature
**Full HP & AC breakdown tooltips.** The HP/AC vital tooltips on the sheet are
currently **partial** (HP = derived-vs-override; AC = source armor) because the API
doesn't return the component math. A handoff was sent to the backend:
`C:\Users\keisi\source\repos\DMTool\FRONTEND-REQUEST-hp-ac-breakdown.md`, asking for
`hitPointBreakdown {fromHitDice, fromConstitution, total}` and
`armorClassBreakdown {base, dexterity, shield, other, total, source}` on
`CharacterResponse`.

**Next session must:**
1. Check `INCOMING-FROM-BACKEND.md` — has the backend shipped it? (The background
   watcher from last session is gone after the context clear.) If not, relay the
   request to the backend session.
2. When it lands: add the two fields to `CharacterResponse` in `src/api/types.ts`,
   then upgrade `hpTip` / `acTip` in `src/routes/CharacterSheet.tsx` (search for
   `const hpTip` / `const acTip`) to render the real components.

## Environment gotchas
- **Quality-cascade Stop-hook:** the work-grade cascade (tests/causal-proof/
  persistence/race) is inapplicable to this no-test-runner frontend. Break-glass
  `CODEBRIDGE_SKIP_CASCADE=1` is committed in `.claude/settings.json` and loads at
  **session start**, so a fresh session won't be blocked. (Last session was blocked
  mid-run only because settings load at launch.)
- **Spectral verification:** the per-call daemon dies between CLI calls here; use
  `spectral batch` (single process) — full recipe in `CLAUDE.md` (inject JWT into
  `localStorage['dmtool.jwt']`, navigate, `--screenshot`, read `C:\tmp\spectral-batch\final.png`).
- `.oby/`, `.spectral/`, `.codebridge/`, `.critical-review-state.json`, `.env`, and
  oby-generated `.claude/CLAUDE.md` + `.claude/references/` are gitignored.

## Open / never-started (from FRONTEND-CONTEXT next-steps)
- Builder: feats, background, subclass-at-creation, inventory items.
- Level-up: feat-based ASI (ability improvements only today).
- Sheet: inventory management (add/consume/attune — endpoints + DTOs exist).
- Character **editing** via `PUT /api/character/{id}` (reuse the builder).
- Homebrew `*CreateRequest` DTOs when the Compendium gains "add homebrew".

## Coordination files (records of cross-session handoffs)
- `FRONTEND-REQUEST-class-proficiencies.md` (backend repo) — DONE.
- `FRONTEND-REQUEST-hp-ac-breakdown.md` (backend repo) — PENDING (see above).
- `INCOMING-FROM-BACKEND.md` (here) — backend's callback log.
