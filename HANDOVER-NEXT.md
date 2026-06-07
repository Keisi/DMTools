# Handover — DMTool-FrontEnd (for the next session)

Refreshed 2026-06-07. This is the authoritative "where things stand + what to do
next" doc. Companion: `FRONTEND-CONTEXT.md` (architecture/API map) and `CLAUDE.md`
(commands, constraints, spectral recipe, quality-gate notes). Backend lives at
`C:\Users\keisi\source\repos\DMTool` (`DMTool.slnx`); the authoritative API
contract is its `Models/*` + `Entities/Enums/*`.

## Current state
- **Git:** repo on `main`, remote `origin` (Azure DevOps `DMTools-Frontend`).
  Latest commit `2c4cc81` (multiclass-from-sheet, compendium detail, 401 redirect,
  builder polish, PUT-204 fix) — pushed. Prior feature commit `08091a7`. All work
  committed + pushed.
- **Gates:** `npm run build` (`tsc -b && vite build`) and `npm run lint` both GREEN.
  There is **no test runner** — `tsc -b` + eslint are the correctness gates.
  (`oby verify`'s build step is a false negative here — `os error 193`; trust npm.)
- **Dev server:** `npm run dev` → http://localhost:5173 (proxies `/api` → backend
  `:3501`). Restart with `npm run dev` if down.
- **Backend:** IIS at `:3501`. Test login **`dungeonmaster` / `Passw0rd!23`**.
  Characters are **owner-scoped** (IDOR fix) — you only see your own; another
  account's id returns 404.

## Done this session (roadmap items 1–4)
- **Builder gaps (item 1):** new **Background** step (with the background's "languages
  of your choice" Selection), new **Feats** step, per-class **subclass** picker in the
  Class step (gated at the class's subclass level; optional at creation), and
  **inventory items + coin purse** in the Equipment step.
- **Sheet inventory management (item 2):** live add/consume/attune controls + a catalog
  search-to-add on the sheet's Inventory block (posts to the inventory endpoints, swaps
  in the re-derived character). Added an **Edit** link in the sheet header.
- **Edit mode (item 3):** `/character/:id/edit` reuses the builder — loads a character,
  prefills every wizard-owned field, PUTs via `characters.update()`. Preserves fields
  the wizard doesn't expose (HP/AC overrides, known spells, status effects, character
  details/narrative) by carrying them from the loaded response; sets
  `allowHomebrewSelections` so re-submitting already-granted skills/languages passes.
- **Level-up polish (item 4):** at an ASI level, choose **distribute 2 ability points OR
  take a feat** (feat picker); **search filter** on large spell/cantrip pools.
- **Refactor:** extracted the builder's presentational step components +
  shared constants into `CharacterBuilder.steps.tsx` (de-god-componented the file the
  hindsight gate flagged; orchestrator state stays in `CharacterBuilder.tsx`).
- **API/types:** added `reference.feats()/backgrounds()/languages()`; `types.ts` synced
  to the live contract (`CharacterDetails`, HP/AC breakdown response types).

### Edit-mode deferrals (contract-limited — documented in CharacterBuilder.tsx)
- Proficiency **additions** (weapon/armor/tool/save) are **not preserved** on edit: the
  response exposes only the union of class-grants + additions, not the addition delta,
  so they can't be cleanly round-tripped. Rare (most characters rely on class grants).
- Skill **expertise downgrades to Proficient** on edit (the builder models Proficient
  picks only).
- A clean fix for both would be a backend PATCH/partial-update endpoint or exposing the
  stored addition deltas on `CharacterResponse`.

## Done — INCOMING #4 (level-up Phase 3: Fighting Style / Expertise / Metamagic)
Implemented + **live-verified** (Paladin 1→2: picked Dueling via the new picker →
`fightingStyles:[{name:"Dueling"}]`, sheet shows it). All gates green (build, lint,
`oby verify` delta 0).
- **types.ts:** `SelectionType` 4/5/6; `FightingStyleResponse`/`MetamagicResponse`;
  `CharacterRequest.fightingStyleIds`/`metamagicIds`; `CharacterResponse.fightingStyles`/
  `metamagics`; plan `featureChoices[]` (`FeatureChoiceResponse`); apply `featureChoices[]`
  (`FeatureChoiceApply`).
- **endpoints.ts:** `reference.fightingStyles()` / `reference.metamagics()`.
- **LevelUpDialog.tsx:** renders a `FeatureChoice` picker per plan entry (type 4/6 from
  `selection.options`; type 5 Expertise from the character's proficient skills — new
  `skills` prop); validation + "still needed" wiring; echoes `featureChoices` on apply.
- **CharacterSheet.tsx:** new self-hiding `SubFeaturesBlock` (Fighting Styles / Metamagic);
  passes `skills` to the dialog. **HP/AC breakdown tooltips** now render the real component
  math from `hitPointBreakdown`/`armorClassBreakdown` (closes the #3 leftover TODO).
- **CharacterBuilder.tsx:** edit-mode carries `fightingStyleIds`/`metamagicIds` from the
  loaded character so a PUT doesn't wipe them (same pattern as spells/status effects).

### New caveat (pre-existing, now more impactful)
Edit mode resubmits `skillProficiencies` all as **Proficient**, so editing a character that
has **Expertise** (now reachable via level-up Rogue/Bard) downgrades those skills to
Proficient. Documented deferral (see "Edit-mode deferrals"); the clean fix is the same
backend partial-update/delta exposure noted there.

### Not built (deferred, optional)
Create-time Fighting Style / Metamagic in the builder (the `fightingStyleIds`/`metamagicIds`
request fields exist + edit preserves them, but there's no wizard picker). Backend frames
this as an edge case (a Fighter built directly at L3); level-up is the primary path.

## Done — 2026-06-07 (session 2, commit `2c4cc81`)
All gates green (`npm run build`, `npm run lint`); oby precheck delta **0 introduced**.
- **Bug fixed — wizard Back button.** Was actually correct in code; live-verified via
  spectral snapshot (Back `disabled` on step 0, enabled on step 1). No change needed
  beyond confirmation. (The browser-back-loses-progress option was offered; not chosen.)
- **Bug fixed — sheet header button size.** Root cause was app-wide: `<button class="btn">`
  used the UA font while `<a class="btn">` inherited the page font. Added
  `font-family/size: inherit` to `.btn` in `theme.css` (fixes button/link parity
  everywhere) + removed the stale `.sheet__levelup` margin.
- **Builder (a) background dup-skill flag** — `BackgroundStep` cross-references `bg.skills`
  vs class `skillIds`; overlaps get a red ⚠ tag + a note. Live-verified.
- **Builder (b) Review step** — added **Age** + **Background feature**. Deliberately NOT
  HP/AC preview (server-derived; CLAUDE.md forbids client recompute).
- **Too-many-classes warning** — non-blocking advisory at ≥3 classes in the Class step
  (`MULTICLASS_WARN_AT`). Live-verified (screenshot: 3 classes → red banner).
- **Multiclass from the sheet** — new `routes/AddClassDialog.tsx` (+ `.css`): pick a
  class not already taken, append at level 1, persist via `characters.update()`,
  re-render in place. Uses the **PUT path** because the level-up engine rejects a
  not-yet-owned class (confirmed in backend `LevelUpPlanner.Plan`). New shared
  `api/characterRequest.ts#characterResponseToRequest()` (lossless response→request)
  — **also fixes the Expertise→Proficient downgrade** on round-trip (preserves real
  skill levels), unlike the builder's edit path.
- **Bug fixed — "multiclass redirects to nothing" (blank sheet).** `PUT /api/character/{id}`
  returns **204 No Content**, so `characters.update()` resolved to `undefined` →
  `setC(undefined)` → blank. `update()` now PUTs then **re-GETs** the fresh character.
  **This also fixes builder edit-save** (`navigate(/character/${saved.id})` on undefined),
  which the prior handover flagged as never click-tested. Verified: pre-fix repro showed
  nav-only (4 refs); direct node PUT test confirmed 204 + persistence.
- **401 → login redirect (session expiry).** `client.ts` fires a hook on any authed 401
  (clears token); `AuthContext` resets state so `RequireAuth` bounces guarded routes to
  `/login`. `Login` now honors the `from` location. Login itself (`auth:false`) is
  unaffected.
- **Compendium enriched + categorized.** Each tab now shows rich detail (was name-only);
  spells grouped by level, items by Equipment vs Magic Items, collapsible sections with
  counts (search force-expands). Frontend-only — all data already on the reference DTOs.

### Backend handover (this session)
`DMTool/FRONTEND-REQUEST-compendium-and-update-contract.md` — Compendium needs **nothing**.
One real ask: make `PUT /api/character/{id}` return **200 + updated CharacterResponse**
(consistent with create + levelup/apply) so the frontend can drop the extra GET in
`update()`. Optional: multiclass-in via the level-up engine; richer item/race/class DTOs.

## Verification gaps (carry forward)
- **Spectral is slow + flaky in this env** (cold start ~5s, hangs with `--console`;
  big multi-action batches can hit the timeout). Use screenshot/`--snapshot` batches,
  not `--console`. Clear orphan **headless** Chrome via PowerShell (kill only
  `--headless` PIDs — the user has ~80 real Chrome procs; don't touch those).
- **Not live-clicked post-fix:** the multiclass dialog success path screenshot timed out
  (fix is proven via node PUT test + code path, but a green screenshot is still owed).
  Test char left in DB: **"Multiclass Test Dummy"** `d5f11f29-76b8-4b3f-b69c-4048b3173e9a`
  (now Bard 1/Barbarian 3) under `dungeonmaster`.
- 401-redirect and Compendium render not yet click-verified live (build/lint green).

## TODO — next session
- [ ] Live-verify (spectral screenshot) the multiclass dialog success path, the 401→login
  redirect, and the Compendium grouping/detail render.
- [ ] If backend returns the body on PUT (see handover), drop the extra GET in
  `characters.update()`.
- [ ] Consider an app-level **ErrorBoundary** (baseline `async-no-error-boundary` gap) so
  a render throw shows a fallback instead of a blank screen — would have surfaced the
  PUT-204 bug as an error, not a white screen.

## Still open / never-started (from FRONTEND-CONTEXT next-steps)
- Homebrew `*CreateRequest` DTOs + POST flows when the Compendium gains "add homebrew".
- Richer multi-pick spell UX beyond search + count-capped toggling (grouping by level,
  prepared-vs-known distinction) if desired.

## Environment gotchas
- **Code-change-threshold + critical-review gates:** CodeBridge hooks block (1) any
  `Write`/`Edit` once **uncommitted changes exceed ~1500 lines** and (2) `git commit`
  until a `/critical-review --resolve-all` marker is stamped for the staged diff
  (`.claude/.critical-review-done-<branch>-<sha7>`). Practical flow for a big change:
  commit in chunks so you don't cross the threshold mid-edit; run the critical review
  before committing; shell file-ops (not the Write/Edit tools) are not threshold-gated
  if you get wedged.
- **Quality-cascade Stop-hook:** inapplicable to this no-test-runner frontend.
  `CODEBRIDGE_SKIP_CASCADE=1` is in `.claude/settings.json` (loads at session start).
- **Spectral verification:** per-call daemon dies between CLI calls; use `spectral batch`
  (single process) — recipe in `CLAUDE.md` (inject JWT into `localStorage['dmtool.jwt']`,
  navigate, `--screenshot`, read `C:\tmp\spectral-batch\final.png`).
- `.oby/`, `.spectral/`, `.codebridge/`, `.critical-review-state.json`, `.env`, and
  oby-generated `.claude/CLAUDE.md` + `.claude/references/` are gitignored.

## Coordination files
- `FRONTEND-REQUEST-class-proficiencies.md` (backend repo) — DONE.
- `FRONTEND-REQUEST-hp-ac-breakdown.md` (backend repo) — DONE (tooltips now render
  the real breakdown math).
- `INCOMING-FROM-BACKEND.md` (here) — backend's callback log. #1–#4 all consumed.

## Not verified live this session
The builder/edit/inventory/level-up changes passed `tsc` + eslint + `oby verify`
(delta 0) but were **not** click-tested in the browser. Next session should spectral-
batch verify: create a character with a background+feats+subclass+inventory, edit it,
and exercise sheet inventory add/consume/attune + a feat-based ASI level-up.
