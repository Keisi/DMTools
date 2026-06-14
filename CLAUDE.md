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

Backend features that are **not modeled** — don't build UI for them: Half-Elf
"choose +1 to two", weapon properties (finesse/heavy/…), and spell slots as
anything but a single int. (Subraces ARE modeled — picker in the builder race
step, modifiers in the ability tooltip, plus subrace choice-Selections — High Elf
cantrip + extra language — and auto-granted racial spells; see INCOMING #25.)

## Backend context you can't see from this repo (synced 2026-06-14)

- **INCOMING #19–#31 are all DONE and wired into the client (DB through migration 074).**
  #19–#30 are pushed to `origin/main`; **#31 is committed to `main` locally (`0793aae`) but NOT
  yet pushed** (push = prod deploy — Kevin's call):
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
    **No campaign SignalR — plain REST refetch.** Two #31 fields ship **read-only** pending backend
    setters (see outstanding requests below): class **resources** and **exhaustion**.
  - **The buffs-system rule still holds:** **flat** roll modifiers are pre-folded into the
    derived numbers — render-only, NEVER re-apply; only **dice** + **advantage/disadvantage**
    surface via `CharacterResponse.rollModifiers`/`rollAdvantages` (the no-double-counting
    invariant). Badges carry `remainingRounds`/`sourceCombatantId`/`consumedOnUse`.
- **Two outstanding backend requests** (filed 2026-06-14, both in the **backend repo root**,
  awaiting the backend session) — both are #31 follow-ups for fields that ship read-only:
  - `FRONTEND-REQUEST-campaign-resource-set.md` — a `PATCH …/characters/{cid}/resources/{key}`
    setter (the campaign analog of #19's combatant `resources/{resourceKey}`). The #31 sheet has
    **no per-resource mutate**, so class resources render display-only (reset only via rests). When
    it lands, flip the panel's resource pips to interactive (the −/+ wiring is already in place).
  - `FRONTEND-REQUEST-campaign-exhaustion-set.md` — a `PATCH …/characters/{cid}/exhaustion` setter.
    Exhaustion currently only drops via long-rest; DMs can't apply it. Panel renders it read-only until then.
  - Both are additive and return the full `CampaignCharacterSheetResponse`. (The prior item,
    #28's `FRONTEND-REQUEST-wizard-spellbook-prepared-cap.md`, shipped + is consumed.)

- **The backend has a real xUnit suite now** (`DMTool.Tests`, run with
  `dotnet test DMTool.slnx` in the backend repo) covering the domain rules in
  `DMTool.Entities/Calculations/` (LevelUpPlanner, multiclass prereqs,
  proficiency aggregation, selection validation, encumbrance, status effects,
  unarmed/unarmored). When you file a `FRONTEND-REQUEST-*.md` for rule
  enforcement, the rule + tests land there — asking is cheap; don't work around
  missing rules client-side.
- **DB baseline fold is at migration 057** (2026-06-11); migrations 058–074
  (buffs 061–063, resource pools 064, hide-turn-order 065, session-enforce 066,
  spell source-class 067, wizard spellbook 068, subrace selections 069, High Elf cantrip
  DC 071, Extra Attack table 072, advantage buffs seed 073, per-campaign character state 074)
  sit on top of it.
  **Production note:** the Azure App Service backend + its DB are NOT yet migrated past 069 —
  #25, #29/#30, #31 (and the #28 validation change) work locally only until that deploy +
  migrations 071/072/073/074 run in prod. The frontend `0793aae` (#31) is likewise unpushed,
  so prod is unaffected until both the push and the prod migrations happen.
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
