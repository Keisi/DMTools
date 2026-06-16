# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

SPA frontend for **DMTool**, a D&D 5e Dungeon Master toolkit. It is a pure JWT
client of the headless DMTool JSON Web API (ASP.NET Core 10, Dapper/SQL Server).
The backend is the **sibling repo** `..\DMTool`
(`C:\Users\keisi\source\repos\Personal\DMTool`); solution file `DMTool.slnx`.
(Older docs — `FRONTEND-CONTEXT.md`, `HANDOVER-NEXT.md` — cite the pre-move path
`C:\Users\keisi\source\repos\DMTool` and an Azure DevOps frontend remote; both
are stale. There is no workspace-root `CLAUDE.md`.)

**The backend repo is the source of truth for the API contract.** Read, in order
of relevance to frontend work:
- `<backend>\DMTool\Models\Characters\CharacterContracts.cs` — the authoritative
  `CharacterRequest` / `CharacterResponse` / level-up DTOs. **Read this before
  touching `src/api/types.ts` or building character UI** (see the divergence note
  under "Architecture").
- `<backend>\DMTool\Models\{Auth,Reference}\` — the other DTOs.
- `<backend>\CLAUDE.md`, `<backend>\docs\ROADMAP.md`, `<backend>\docs\LEVELUP-ENGINE.md` —
  domain rules and the level-up engine design.
- (`<backend>` = machine-dependent path; see workspace root `CLAUDE.md`)

`FRONTEND-CONTEXT.md` is the fuller frontend handover (route map, screen status,
gotchas). Keep it in sync when architecture changes.

The backend **is its own git repo** (Azure DevOps
`coolstorypro.visualstudio.com/DMTools/_git/DMTool`, branch `master`) and is
hosted in-process on IIS (`:3501`); its DLL is locked while the pool runs, so a
backend rebuild is **stop pool → `dotnet build DMTool.slnx` → start pool**
(`Stop-WebAppPool DMTool` / `Start-WebAppPool DMTool`). Kestrel dev (`dotnet
run`) avoids the lock.

## Commands

```bash
npm run dev      # Vite dev server :5173, HMR, proxies /api -> backend :3501
npm run build    # tsc -b (typecheck, must stay green) && vite build
npm run preview  # serve the production build
npm run lint     # eslint .
```

There is **no unit-test runner configured** — do not invent `npm test`. The build's
`tsc -b` typecheck is the correctness gate. There **is** an out-of-build **API
end-to-end harness** at `tests/api-e2e/` (pure-HTTP, plain Node ESM, zero deps, NOT
wired into `npm` and NOT in the `tsc -b`/vite path): `node tests/api-e2e/run.mjs`
against a live backend walks level-up 1→20 for every class, above-L1 creation +
convergence, and full encounter scenarios. See `tests/api-e2e/README.md` and the
plan + per-class/per-level reference in `projectnotes/api-e2e-test-plan.md`.

### Quality gates (oby-first; playbook-derived, trimmed for this personal project)

This repo has `.oby/`, so the oby completion-loop applies as the code gate:
- Per change: `oby verify --files "a.ts,b.tsx"` (comma-separated). The signal is
  **`delta`** — new issues vs. baseline; aim for `delta: 0`. The scaffold ships
  ~16 baseline anti-patterns + 31 AST violations (jwt-in-localstorage,
  fetch-no-timeout, async-error-boundary, …); `oby health` grades **D/~66** off
  those. They're pre-existing, not per-change — don't chase them under "make the
  gate green," just don't *add* to the delta.
- **`oby verify`'s build step is a false negative here** — it can't spawn npm
  (`os error 193`). **`npm run build` + `npm run lint` are the authoritative
  build/lint gates** (both must be green before "done"). Run them, not oby's.

**What does NOT apply** (the global standard/analyze/worktree playbooks are for
**work** repos): this is a **personal project**. It IS a git repo — GitHub
`Keisi/DMTools`, `origin/main`, commit directly to `main` — but none of the
work-repo machinery applies: no worktrees, feature branches, PRs, parent-branch
selection, JIRA/`tjira`/ticket triage, tenant/BondFrontEnd machinery, or
session-naming. A CodeBridge PreToolUse hook gates `git push` on a
critical-review marker for HEAD (`.claude/.critical-review-done-main-<sha7>` —
untracked/local, never commit them). **Pushing to `main` is a production
deploy**: `.github/workflows/deploy.yml` builds (Node 22, `npm ci` + `npm run
build` with base path `/DMTools/` and `VITE_API_BASE` = the Azure App Service
backend) and publishes to GitHub Pages on every push.

The backend must be running for live data: IIS at `http://localhost:3501`, or
Kestrel via `dotnet run --project DMTool --launch-profile http` (`:5157`).

## Browser verification (spectral) — project-local notes

This is a **personal project**. The global `spectral-jira-playbook` skill is for
**work** tenants (AMS admin login, JIRA comment/attachment posting, BondFrontEnd
workflows) — **none of that applies here**. Only borrow the spectral *browser
launch* mechanics from it. What's relevant for this app:

- **PATH:** spectral finds Chrome by name on `$PATH`; the installer doesn't add it.
  Export per Bash call (it doesn't persist): `export PATH="/c/Program Files/Google/Chrome/Application:$PATH"`. (Chrome is also on the user PATH now.)
- **Liveness:** probe with `spectral browser open --headless about:blank` → `status:ok`. Don't trust `spectral browser status` (`daemon_running:false` is normal — it idles out).
- **Wedged daemon / "Failed to launch Chrome daemon":** `spectral browser close --force` clears orphaned Chrome instances (it has piled up 30+ here), then re-probe.
- **The per-call daemon does NOT survive between `spectral browser` invocations here**
  (2026-06): `open` returns `status:ok`, then the Chrome process self-terminates within
  seconds, so `open` → `eval` → `navigate` → `screenshot` as separate calls always fails
  on the 2nd call. **Use `spectral batch` instead — it runs every action in ONE process,
  which holds.** This is the working verification recipe for this app:
  ```bash
  spectral browser close --force >/dev/null 2>&1   # clear piled-up orphan Chrome first
  TOKEN=$(curl -s -X POST http://localhost:3501/api/auth/login -H "Content-Type: application/json" -d '{"username":"dungeonmaster","password":"Passw0rd!23"}' | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
  ACT=/c/Users/keisi/AppData/Local/Temp/act.json
  # eval action uses "expression" (not "script"); use JS BACKTICK string literals to
  # dodge JSON quote-escaping. Auth = inject the JWT into localStorage key dmtool.jwt
  # (see src/api/client.ts) — no login form needed.
  printf '[{"action":"eval","expression":"localStorage.setItem(`dmtool.jwt`,`%s`)"},{"action":"navigate","url":"http://localhost:5173/character/<ID>"},{"action":"wait","ms":3000}]' "$TOKEN" > "$ACT"
  spectral batch "http://localhost:5173/" --actions "$ACT" --screenshot --width 1280 --height 2000
  # screenshot lands at spectral's /tmp == Windows C:\tmp : read C:\tmp\spectral-batch\final.png
  # (use a tall --height to capture the whole sheet; default 720 cuts off below "Inventory")
  ```
- **`spectral batch` pops a VISIBLE Chrome window every run** — it's headed (no
  `--headless` option, unlike `spectral browser open` which runs hidden; confirmed
  2026-06-16). To stop the tab stealing focus, run the **`spectral-quiet`** watcher
  (skill — say `/spectral-quiet`, or the commands in
  `~/.claude/skills/spectral-quiet/SKILL.md`) **before** a batch session and **STOP
  it after** — it's use-then-close, not a permanent daemon. It moves each batch's
  "Chrome for Testing" window off-screen; `--screenshot` is unaffected (CDP captures
  the render surface, not the OS window).
- **INTERACTION BATCHES NEED `--action-timeout` OR THEY HANG (2026-06-16, the fix for the
  long-running "spectral can't click here" saga).** A batch that *only* navigates +
  screenshots works fine, but the moment an action runs **after the React app has loaded**
  (a `click`, or an `eval` against the live DOM), spectral's default per-action stability
  wait **never resolves** and the whole batch hangs indefinitely (reproduced with both
  `eval`-`.click()` and the native `click` action). **Cap it: `--action-timeout 20`** (≈20s
  per action) — the click then registers, the wait gives up gracefully, and the batch
  completes. Confirmed end-to-end: clicked the Half-Elf race card and the campaign "Sheet"
  button, screenshots captured. Two more gotchas: (1) the batch **`screenshot` action**
  writes `C:\tmp\spectral-batch\action-<name>.png` (note the `action-` prefix) — different
  from the `--screenshot` **flag**, which writes `final.png`; (2) target click selectors by
  CSS position/class, not text — there is no text selector (e.g. the 5th race card =
  `.builder__picks button:nth-of-type(5)`; the Sheet button =
  `.camp__char-item:nth-of-type(1) button.btn:not(.camp__char-copy):not(.camp__char-remove)`).
  This **supersedes** the older "spectral can't drive interactions / hangs on state-changing
  actions" notes — it can, with `--action-timeout`.
- **Character access is owner-scoped** (the IDOR fix): you can only view a character
  under the account that created it; another account's id returns 404. `dungeonmaster` /
  `Passw0rd!23` is a working login.
- **Seeded test data under `dungeonmaster` (2026-06-12, reusable):** vault characters
  Seraphine Dawnbringer (Paladin 10, `6311ebed-e957-49b0-a789-d3a4593f9c67`) and Borin
  Ironfist (Fighter 5, retired); campaign "Layout Preview"
  (`020242eb-17ce-4c4b-b072-a55fc2e47afe`) with Active encounter "Goblin Ambush"
  (`60a4574c-3d64-4ede-baf7-41435561d7fa`: Theren ally w/ temp HP + condition, Goblin
  4/7, Goblin Boss). Note: ally/enemy *sides* live in `dmtool-enc-sides-<eid>`
  localStorage — seed it in the batch eval or unlinked combatants all read as enemies.
- **More batch gotchas (2026-06-12):**
  - **Guard the login token** — if the `curl` login fails (pool mid-restart → 503) the
    eval writes an empty `dmtool.jwt` and the app renders a **fully black page** (empty
    React root). A solid-black screenshot means the app crashed/didn't mount, not that
    capture failed. `[ -n "$TOKEN" ] || exit 1` before writing action files.
  - **Eval results are NOT echoed** in batch output — smuggle diagnostics through
    `document.title` (the JSON result's `final_state.title`). This also works for live
    layout assertions, e.g. `getBoundingClientRect` overlap checks.
  - **Repeated clicks on the same React control need separate eval actions** with a
    wait between them — N synchronous `.click()`s in one eval all see the same stale
    state closure and collapse into one increment. (Same root cause as the 2026-06-08
    CDP-driver note in HANDOVER-NEXT.md.)
  - **First page load after a pool restart can exceed 8s** — use `wait` ≥ 8000ms after
    navigate, and re-run rather than trust a skeleton screenshot.
  - **Orphaned Chrome processes can wedge the BACKEND (2026-06-12):** spectral's
    `browser close --force` doesn't reliably reap its Chromes; dozens of orphans
    accumulate across batches, each holding a live `/hubs/encounter` SignalR
    connection, until the IIS worker starves and stops answering new requests
    (looks like a backend hang, but the app "started successfully" in the event
    log). Fix: kill all Chrome processes (PowerShell `Stop-Process -Name chrome
    -Force`), recycle the pool, re-check `/api/health`. Prevention: kill orphan
    Chromes before each spectral batch, not just `browser close --force`.
  - **The Vite dev `/api` proxy dies after repeated IIS pool recycles (2026-06-13):**
    once the backend pool has been stopped/started several times in a session, the
    running `npm run dev` proxy to `:3501` goes stale and **hangs** — `curl :5173/api/...`
    times out (`000`) while `curl :3501/api/...` works fine. Symptom in the browser:
    pages that fetch on mount (e.g. CharacterBuilder's class list) render **empty** with
    no error, app-wide. **Fix: restart `npm run dev`.** Don't mistake this for a code bug
    — verify the proxy with `curl -m5 :5173/api/classes` before debugging a "missing data"
    screen.

## TypeScript constraints (will fail the build if violated)

`tsconfig.app.json` sets `erasableSyntaxOnly` + `verbatimModuleSyntax`:
- **No TS `enum`s** — use the const-object + union pattern (see `src/api/types.ts`,
  e.g. `FeatureKind`). Same call-site ergonomics, and the type is the numeric union.
- **No parameter properties** in constructors.
- **Type-only imports must use `import type`.**
- `noUnusedLocals` / `noUnusedParameters` are on.

## Architecture

**API layer (`src/api/`)** is the contract boundary with the backend:
- `client.ts` — single `fetch` wrapper. Injects `Bearer` from `localStorage`
  (`dmtool.jwt`, via `tokenStore`), centralizes base URL and error handling,
  throws `ApiError` (carries `status` + parsed `body`). All requests go through
  `api.get/post/put/del`.
- `endpoints.ts` — one function per backend route, grouped `auth` / `characters`
  / `reference` / `health` / `campaigns` (campaign CRUD, membership, characters,
  sessions/rosters, encounters + combatant ops). Add new calls here, not ad-hoc
  `fetch` in components.
- `types.ts` — TS mirrors of backend DTOs, **reconciled to the live contract**
  (camelCase names, enums as numeric unions with the real C# values, full
  `CharacterResponse`/`CharacterRequest` + reference + auth + level-up DTOs). Two
  things to know: (1) the API does **not** return the ability *modifier* — derive
  it from `effective` via `floor((effective-10)/2)` (see `CharacterSheet.tsx`);
  (2) homebrew `*CreateRequest` DTOs are not modeled yet — add from
  `ReferenceContracts.cs` when a screen POSTs them. When you touch a field, it
  should already match the C# record; if the backend contract changes, update
  `types.ts` from the C# source, not from guesswork.

**Base-URL / proxy behavior:** `VITE_API_BASE` empty (the `.env` default) →
client uses relative URLs that hit the Vite dev proxy (`vite.config.ts` forwards
`/api` → `VITE_PROXY_TARGET`), so **no CORS setup is needed in dev**. Set a full
URL to bypass the proxy (backend must then allow the origin).

**Auth:** `src/auth/AuthContext.tsx` exposes `useAuth()` (+ `userId` decoded
from the JWT `sub`, `username` stored at login — screens compute DM/owner
identity from these); token stored in localStorage. `components/RequireAuth.tsx`
guards routes; `components/AppShell.tsx` is the nav + `<Outlet/>` layout. Routes
are wired in `src/App.tsx` — **every route except `/login` is guarded,
including `/compendium`** (the old "compendium is public" note is stale).

**Backend rules that shape the client (don't fight them):**
- **Enums serialize as NUMBERS** over the wire (no `JsonStringEnumConverter`).
  Send/expect integers (`type: 2`, not `"Subclass"`); `types.ts` models numeric unions.
- **Derived-not-stored:** level, ability modifiers, HP, AC, saves, skills,
  proficiency bonus, etc. are computed server-side and returned read-only. The
  client submits only base/stored inputs — **render what the API returns, never
  recompute these client-side.**
- Record-DTO validation is server-side; expect `400` with a problem-details body
  in `ApiError.body`.
- **Rules and schedules come from backend data — never hardcode them client-side**
  (Kevin, 2026-06-11). The API is rules/data-driven; the client renders and defers:
  - Derive counts/budgets/schedules from response data, not literals or class-name
    matching: ASIs from `ClassResponse.features` rows (kind
    `AbilityScoreImprovement`, level ≤ pick level), spell counts from
    `spellcasting.progression`, choice budgets from `Selections`/`featureSelections`,
    multiclass minimums from `multiclassPrerequisite.minimumScore`.
  - Client-side checks are advisory UX only; the backend's `400` is the gate.
    Don't invent client formulas for rules the API doesn't expose — write a
    `FRONTEND-REQUEST-*.md` asking the backend to derive/enforce it instead (see
    `FRONTEND-REQUEST-prepared-spell-cap.md`, `FRONTEND-REQUEST-rules-enforcement-audit.md`).
  - Keep user-facing copy **schedule-neutral**: no hardcoded class names, levels,
    or thresholds that are really data ("at their ASI levels", "a minimum score in
    each class's key ability" — not "Fighter 6/14", "13+", "Paladin before level 2").
    Deliberate exception: point-buy (27 pts, 8–15) is a client-side table convention
    by design (backend accepts 1–30; manual mode is the DM escape hatch).

## Visual system (the reason for the CSS structure)

Plain CSS + design tokens — no framework, no CSS-in-JS — chosen so the look is
retunable from one place. All under `src/styles/`:
- **`tokens.css`** — the control panel: every color, font, spacing, radius,
  shadow, duration, easing is a `:root` custom property. Change here → cascades
  everywhere. A commented `[data-theme]` block shows how to add an alternate skin.
- **`theme.css`** — base elements + shared primitives (`.btn`, `.panel`,
  `.input`, `.badge`, `.rule`) built from tokens.
- **`animations.css`** — `@keyframes` + utility classes; motion tuned via
  `--dur-*` / `--ease-*`; respects `prefers-reduced-motion`.
- Per-screen CSS is co-located (`routes/Vault.css`, etc.) and must reference
  tokens only — no hardcoded colors/sizes.

Aesthetic: Fight Club 5e inspired (ink/leather bg, parchment text, crimson
actions, gold accents). Fonts (Cinzel display, Inter body) load in `index.html`.

## Status

`CharacterBuilder` (`/character/new`) is **implemented**: a 10-step wizard (Race →
Class → Abilities → Skills → Choices → Spells → Background → Feats → Equipment →
Review) that assembles a `CharacterRequest` and `POST`s via `characters.create()`,
then navigates to the new sheet. Also mounts at `/character/:id/edit` (PUT path).

Features implemented:
- **Multiclass**: add multiple classes (levels summing to ≤20, starting class designation).
- **Subclass at creation**: dropdown in the Class step once a class reaches its subclass
  level; subclass `featureSelections` (e.g. Champion's extra Fighting Style) flow into
  the Choices step automatically.
- **Ability scores**: point-buy (27-pt, 8–15) or Manual (1–30); above-L1 ASI panel when
  the build has earned ASIs.
- **Skills**: starting-class skill picks (Selection-validated).
- **Choices**: fighting styles, expertise, metamagic — per class + chosen subclass at level.
- **Spells**: required cantrips/spells for known casters; optional pre-population pool for
  prepared casters (Paladin, Cleric, Druid, Wizard) once they have castable spell levels.
- **Background**: pick + language choice Selection.
- **Feats**: optional multi-select from the `/api/feats` catalog.
- **Equipment**: armor/shield/weapons (proficiency-highlighted) + general inventory items
  + coin purse.
- **Review**: summary of all choices before save.

Create errors surface server-side problem-details field messages. Edit mode (`/edit`)
prefills all wizard-owned fields and carries through non-wizard fields (HP/AC overrides,
status effects, narrative) on PUT.

The `CharacterRequest` minimum: `name`, `raceId`, `classes` (≥1 `{classId, level}`,
levels summing to ≤20), and `abilityScores` (one per `IsDefault` stat — **base**
scores). For multiclass, `startingClassId` is required (sole source of save
proficiencies + the maxed HP die); single-class omits it (backend defaults it).

`CharacterSheet` renders the full `CharacterResponse`: vitals, abilities, saves,
skills, inventory, plus weapon attacks, resources, spellcasting + known spells,
class features, traits (speeds/languages/resistances), encumbrance, and status
effects — each block self-hides when empty.

Level-up UI is **implemented** in `routes/LevelUpDialog.tsx` (opened from the sheet
header): it `POST`s `{id}/levelup/plan`, renders the forced choices (HP average/roll,
subclass, spell pools), and `POST`s `/apply`, handing the updated character back to
the sheet. Verified live (HP, subclass, and null-count caster spell pools). At an ASI
level the dialog offers an `AsiMode` toggle: distribute two ability points **or** take a
feat (the feat picker lists `/api/feats` with prerequisites/descriptions and sends
`featId` on apply; backend rejects sending both). Not yet handled: multi-pick spell
counts beyond toggling.

**Scope B (multi-user campaigns + live combat) is implemented** — routes:
- `/vault` (`Vault.tsx`) — character grid with per-card retire toggle
  (`PUT /api/character/{id}/retire`) behind a "Show retired" filter.
- `/campaigns` (`CampaignList.tsx`) — campaign grid (DM/Member badge), inline create.
- `/campaigns/:id` (`CampaignDetail.tsx`) — one component, DM-vs-member controls
  conditional: membership (invite/join/accept/reject/remove, DM transfer),
  registered characters (+ DM "Copy" via `POST /api/character/{id}/copy`),
  sessions + rosters, encounter list/create. Non-members get a 404 → Join CTA.
  A per-character **"Sheet"** button (gated DM-or-owner) opens
  `components/CampaignCharacterPanel.tsx` — a modal of the character's
  **per-campaign runtime state** (INCOMING #31): HP (heal/damage/set/temp), DM
  inspiration grant + spend, read-only exhaustion, interactive spell-slot pips,
  display-only class resources, status-effect add/remove, short/long rest. Sourced
  from `GET …/characters/{id}/state` via the `campaignCharacterState` endpoint
  group; every mutation state-replaces on the returned `CampaignCharacterSheetResponse`
  — **plain REST, no campaign SignalR** (refetch via the response).
- `/campaigns/:id/encounters/:encounterId` (`EncounterView.tsx`) — the live combat
  tracker (Pending → Active → Ended; start/next-turn/end, combatant add/remove,
  initiative, HP delta/set/temp; ally-vs-enemy split persisted per-encounter in
  localStorage). **Every encounter mutation returns the full `EncounterResponse`**
  and flows through a single `applyUpdate` state-replace path — SignalR pushes use
  the same path. `PlayerEncounterView.tsx` has no route of its own by design:
  `EncounterView` renders it for any **non-DM** viewer (the sides/initiative
  tracker below it is the DM control surface).

**Live sync:** `src/hooks/useEncounterHub.ts` (`@microsoft/signalr`) connects to
`/hubs/encounter` with the JWT as `?access_token=` (WS can't carry a Bearer
header), handles `EncounterUpdated`/`EncounterArchived`, auto-reconnects and
re-joins its group. Local IIS has no WebSocket upgrade, so the connection
negotiates down to **SSE — that's normal, not a bug**. `/hubs` is proxied in
`vite.config.ts` with `ws: true`; callbacks live in refs so re-renders don't
rebuild the connection.

Backend features still **not modeled** — don't build UI for them: spell slots as
anything but a single int. (Half-Elf "choose +1 to two" and weapon properties are
now MODELED by the backend — INCOMING #34/#35 — but **not yet consumed by the
client**; see the backend-context section below. Subraces ARE modeled — picker in
the builder race step, modifiers in the ability tooltip, plus subrace choice-Selections
— High Elf cantrip + extra language — and auto-granted racial spells; see INCOMING #25.)

## Backend context you can't see from this repo (synced 2026-06-16)

- **INCOMING #19–#36 are all DONE and wired into the client (DB through migration 077).** #19–#32
  are pushed to `origin/main` (#31/#32 at `347c167` = a live prod Pages deploy); **#33–#36 were
  consumed + committed 2026-06-16 (not yet pushed)** — see the session entry in `HANDOVER-NEXT.md`.
  All four were live-verified against `:3501` at the contract level + by code inspection (`tsc -b` /
  `eslint` green) **and now have rendered spectral screenshots** (the click-through captures that were
  first blocked by a spectral hang were unblocked with `--action-timeout` — see the browser-verification
  section): #35 sheet (weapon-property badges), #34 builder (Half-Elf choose-2 picker), #33/#36 campaign
  panel (hit-dice pool + exhaustion "penalties applied" hint + halved speed). The #33–#36 entries below
  carry per-delivery consumption notes:
  - **#19 resource tracking** (mig 064) — per-combatant `resources`/`spellSlots`/`pactSlot`
    pools; `components/CombatantPools.tsx` renders pip tracks + set-semantics steppers +
    Short/Long Rest on DM + player cards. Endpoints `…/resources/{key}`,
    `…/spell-slots/{level}` (`isPact?`), `…/rest` (`RestKind` 1/2 numeric).
  - **#20 spell source-class** (mig 067) — `SpellRef.sourceClassId/sourceClass`; multiclass
    sheets attribute each spell to its governing caster's DC. `spellPicks` write path modeled
    (no manual picker UI yet — tags auto-populate via level-up).
  - **#21 log grammar + `TurnRewound=4`** — server-reworded ("gains/loses Bless"); `↩` glyph.
  - **#22 hide-turn-order** (mig 065) — `EncounterResponse.turnOrderHiddenFromPlayers` +
    generic `PATCH …/encounters/{id}` (`campaigns.patchEncounter`). DM header toggle; player
    hides the tracker, keeps the turn banner.
  - **#23 session-required encounters** (mig 066) — backend now 400s a null `sessionId` and
    **409s a session delete that still holds live encounters** (frontend warns + surfaces it).
    Orphan encounters were backfilled into auto-created "General" sessions.
  - **#24 Wizard spellbook** (mig 068) — `progression[].spellbookSize` (Wizard 6/8/…); the
    builder treats it as a required levelled count.
  - **#25 subrace choice-traits** (mig 069) — `SubraceResponse.featureSelections` (High Elf
    cantrip = `SelectionType.Cantrip` 9 / extra language = type 3) + `racialSpells[]`;
    `CharacterResponse.racialSpells[]` (auto-grants, level-gated, own-ability DC). Builder
    Race step renders the two pickers (`SubraceSelections` in `CharacterBuilder.steps.tsx`),
    merges the cantrip into bare `spellIds` (null source) + the language into `languageIds`;
    sheet shows a "Racial Spells" subsection (visible even for non-casters).
  - **#27 Bardic Inspiration recharge** — value-only fix: a Bard L5+ Bardic die recharges on a
    **Short** rest (was Long); flows through `resources[].recharge` — no client change needed.
  - **#28 Wizard spellbook cap** (no migration) — the prepared-spell cap now uses `spellbookSize`
    (not `maxPrepared`) as the **stored**-spell budget for spellbook casters;
    `SpellcastingResponse.spellbookSize` modeled (optional). Harness homebrew workaround dropped.
    Closed `FRONTEND-REQUEST-wizard-spellbook-prepared-cap.md`.
  - **#29 High Elf cantrip DC** (mig 071) — the *chosen* racial cantrip now returns server-computed
    `saveDc`/`spellAttack` (INT-based; was null). Sheet already renders them conditionally — no
    client change (closes the #25 deferral).
  - **#30 Extra Attack + situational advantage** (migs 072/073) — `CharacterResponse.attacksPerAction`
    (MAX across classes, never a sum; shown in the sheet Attacks block, defensive `?? 1` guard); 6
    generic advantage/disadvantage StatusEffects (flow through the existing `rollAdvantages` path,
    no new shape); `POST …/combatants/{id}/advantage` (`campaigns.grantAdvantage` +
    `GrantAdvantageRequest`) wired to DM Adv/Dis-(attack/save) quick-grant buttons in `EncounterView`.
  - **#31 per-campaign character state + DM inspiration** (mig 074) — a character carries SEPARATE
    runtime state per campaign (current/temp HP, spell-slot + class-resource remaining, exhaustion,
    inspiration, active status effects); the **campaign pool is the source of truth** (encounters seed
    combatant snapshots from it; on encounter End/Archive the combatant's HP + remaining write back).
    New `campaignCharacterState` endpoint group — 9 ops under `…/campaigns/{id}/characters/{cid}`
    (`state` / `hp` / `spell-slots` / `status-effects` ×2 / `long-rest` / `short-rest` /
    `inspiration/grant` + `/spend`); **every op returns the full `CampaignCharacterSheetResponse`**
    (state-replace). Surfaced as `components/CampaignCharacterPanel.tsx` (modal off the CampaignDetail
    Characters list). Auth: DM **or** character owner (404 otherwise); `inspiration/grant` is **DM-only**.
    **No campaign SignalR — plain REST refetch.**
  - **#32 campaign resource + exhaustion setters** (no migration — #074 columns reused) — the two #31
    fields that first shipped read-only are now interactive: `campaignCharacterState.updateResource`
    (`PATCH resources/{key}`, key URL-encoded for the colon slug; ±1 pip/numeric like the #19 combatant
    tracker) and `.updateExhaustion` (`PATCH exhaustion`, 0–6 stepper). Both DM-or-owner, both return the
    full sheet (`applySheet`). **(Exhaustion was store-only here — SUPERSEDED by INCOMING #36: the campaign
    sheet's derived `character` now reflects the penalty ladder. Drop the "render level only" caveat when #36 is consumed.)**
  - **#33 hit-dice tracking** (mig 075) — `CampaignCharacterSheetResponse.hitDice[]`
    (`{dieType,remaining,max}`; `dieType` = HitDie 4/6/8/10/12, pooled by die type per multiclass,
    sorted desc); `POST …/spend-hit-dice` (`{dieType,count,rolledTotal?}` — heals
    `(rolledTotal ?? count*avg) + conMod*count`, clamped) + `PATCH …/hit-dice/{dieType}` (`{remaining}`
    DM override); **long-rest now ALSO recovers `max(1,floor(totalLevel/2))` dice largest-first** (short
    rest still HP-neutral). Surface in `CampaignCharacterPanel`. **CONSUMED 2026-06-16** —
    `CampaignCharacterPanel` renders the per-die hit-dice pools + a spend control
    (`campaignCharacterState.spendHitDice` / `setHitDice`); live `POST spend-hit-dice` → 200,
    pool `10/10 → 9/10`.
  - **#34 Half-Elf "+1 to two abilities"** (mig 076) — `SelectionType.AbilityScoreIncrease=10` +
    `SelectionSourceType.Race=5`; `RaceResponse.selections[]` (Half-Elf carries
    `{type:10,choose:2,level:1,options: the 5 abilities ex-CHA}`, other SRD races empty);
    `CharacterRequest.abilityIncreaseChoices?: string[]` (stat ids, +1 each, SelectionValidator-gated —
    400 on wrong count / out-of-pool / picking CHA); `AbilityScoreResponse.racialChoiceModifier` is a new
    breakdown component (`effective = base + racial + subrace + feat + improvement + racialChoice`). Builder
    Race step gets a choose-2 ability picker + tooltip itemizes it. **CONSUMED 2026-06-16** —
    `RaceAbilitySelection` picker in the Race step (chips, `choose`-capped), `abilityIncreaseChoices`
    sent on create + recovered on edit from `racialChoiceModifier`; live `/api/races` confirms
    Half-Elf carries `{type:10,choose:2}` with the 5 ex-CHA options, other SRD races empty.
  - **#35 weapon properties** (mig 077) — `WeaponResponse.properties: WeaponProperty[]` (numeric:
    Ammunition1/Finesse2/Heavy3/Light4/Loading5/Range6/Reach7/Special8/Thrown9/TwoHanded10/Versatile11) +
    `versatileDamage: string|null` (2H die, e.g. "1d10"). Display-only — attack/damage math unchanged. To
    badge the sheet Attacks block, **join the attack back to `/api/weapons`** (no attack-line echo was added).
    **CONSUMED 2026-06-16** — `CharacterSheetView` joins `weaponAttacks` → `/api/weapons` (`weaponsById`),
    maps numeric `properties` through `WEAPON_PROPERTY_LABELS`, and renders `versatileDamage` as "(2H …)";
    **live-screenshot verified** (E2E Paladin Ten sheet — Longsword `[11]` Versatile + `1d10`, Greataxe `[3,10]`).
  - **#36 exhaustion penalties DERIVED** (no migration) — **SUPERSEDES #32's store-only note.** The campaign
    sheet's derived `character` now folds the cumulative 2014 SRD ladder from `exhaustionLevel` via channels
    we ALREADY render: `rollAdvantages` (Disadvantage on AbilityCheck ≥1, Attack+Save ≥3), halved speeds ≥2 /
    speed 0 ≥5, halved `maxHitPoints` ≥4; death is the client's own `exhaustionLevel === 6` check. **No new
    wire fields.** Drop the `CampaignCharacterPanel` "render level only" caveat; in campaign context do NOT
    also apply the catalog Exhaustion status-effect (double-counts). **CONSUMED 2026-06-16** — the panel's
    "render level only" caveat is gone; it now shows a "Penalties applied — the sheet's rolls, speed, and
    max HP below reflect exhaustion" hint and reads the derived `character`; live `PATCH exhaustion` L0→L3
    confirmed `walkingSpeed 30→15` + three Disadvantage `rollAdvantages` (targets 0/1/2).
  - **The buffs-system rule still holds:** **flat** roll modifiers are pre-folded into the
    derived numbers — render-only, NEVER re-apply; only **dice** + **advantage/disadvantage**
    surface via `CharacterResponse.rollModifiers`/`rollAdvantages` (the no-double-counting
    invariant). Badges carry `remainingRounds`/`sourceCombatantId`/`consumedOnUse`.
- **No outstanding backend→ requests — the queue is empty; #33–#36 are now consumed + committed
  (2026-06-16), pending push.** Three requests were filed 2026-06-15
  (`FRONTEND-REQUEST-exhaustion-penalty-derivation.md` / `-halfelf-choose-ability-increase.md` /
  `-weapon-properties.md`) and the backend closed all three the **same cycle** as INCOMING #34/#35/#36,
  plus an unprompted **#33 hit-dice** delivery. Nothing is waiting on the backend.

- **The backend has a real xUnit suite now** (`DMTool.Tests`, run with
  `dotnet test DMTool.slnx` in the backend repo) covering the domain rules in
  `DMTool.Entities/Calculations/` (LevelUpPlanner, multiclass prereqs,
  proficiency aggregation, selection validation, encumbrance, status effects,
  unarmed/unarmored). When you file a `FRONTEND-REQUEST-*.md` for rule
  enforcement, the rule + tests land there — asking is cheap; don't work around
  missing rules client-side.
- **DB baseline fold is at migration 057** (2026-06-11); migrations 058–077 sit on top of it
  (buffs 061–063, resource pools 064, hide-turn-order 065, session-enforce 066, spell source-class
  067, wizard spellbook 068, subrace selections 069, High Elf cantrip DC 071, Extra Attack 072,
  advantage buffs 073, per-campaign state 074, hit-dice 075, Half-Elf ability choice 076, weapon
  properties 077). Backend pushed through 077 to `origin/master`.
  **Production note (SPLIT-BRAIN — action required on next deploy):** the frontend is now pushed to
  `origin/main` (`347c167`, this session = a live GitHub Pages prod deploy), but the Azure App Service
  backend + its DB are **still behind**. Everything from #25/#29/#30 onward (migrations **071–077**)
  works **locally only** until the backend is deployed and migrations 071/072/073/074/075/076/077 are
  run in prod. So **prod currently runs a frontend whose backend lacks those endpoints/columns** for the
  affected features — deploy the backend and run the migrations to close the gap. (The #33–#36 client
  work being unbuilt means those specific contracts aren't called from prod yet anyway.)
- **Hub auth is enforced server-side** (backend commit 2026-06-11):
  `JoinEncounter` verifies encounter access before the group join, and DM-only
  pushes go to a separate `encounter-{id}-dm` group. If live updates stop for a
  user, check their campaign membership/access before debugging the client.
- **A production pairing exists:** the backend also runs on Azure App Service
  (`dmtool20260607231301-…southeastasia-01.azurewebsites.net`); this repo's
  GitHub Pages deploy builds against it (`VITE_API_BASE` in
  `.github/workflows/deploy.yml`). When `VITE_API_BASE` is set there is no Vite
  proxy — the backend's production CORS origins (`CorsOptions`) must allow the
  Pages origin. The Azure DevOps `azure-pipelines.yml` is a second,
  **manual-trigger** deploy to Azure Static Web Apps; neither pipeline runs
  `npm run lint` — local lint is the only lint gate.
- **Handoff protocol:** `FRONTEND-REQUEST-*.md` files go in the **backend repo
  root** (the backend session doesn't read this repo; copies here are reference
  only). The backend replies in `INCOMING-FROM-BACKEND.md` (here) and drops
  `HANDOFF-TO-FRONTEND-*.md` in its own root. Trust the newest file end-to-end —
  status snapshots go stale fast.
