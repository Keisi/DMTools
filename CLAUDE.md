# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

SPA frontend for **DMTool**, a D&D 5e Dungeon Master toolkit. It is a pure JWT
client of the headless DMTool JSON Web API (ASP.NET Core 10, Dapper/SQL Server)
that lives at `C:\Users\keisi\source\repos\DMTool` (solution: `DMTool.slnx`).

**The backend repo is the source of truth for the API contract.** Read, in order
of relevance to frontend work:
- `DMTool\DMTool\Models\Characters\CharacterContracts.cs` — the authoritative
  `CharacterRequest` / `CharacterResponse` / level-up DTOs. **Read this before
  touching `src/api/types.ts` or building character UI** (see the divergence note
  under "Architecture").
- `DMTool\DMTool\Models\{Auth,Reference}\` — the other DTOs.
- `DMTool\CLAUDE.md`, `DMTool\docs\ROADMAP.md`, `DMTool\docs\LEVELUP-ENGINE.md` —
  domain rules and the level-up engine design.

`FRONTEND-CONTEXT.md` is the fuller frontend handover (route map, screen status,
gotchas). Keep it in sync when architecture changes.

The backend is **not a git repo** and is hosted in-process on IIS (`:3501`); its
DLL is locked while the pool runs, so a backend rebuild is **stop pool → `dotnet
build DMTool.slnx` → start pool** (`Stop-WebAppPool DMTool` / `Start-WebAppPool
DMTool`). Kestrel dev (`dotnet run`) avoids the lock.

## Commands

```bash
npm run dev      # Vite dev server :5173, HMR, proxies /api -> backend :3501
npm run build    # tsc -b (typecheck, must stay green) && vite build
npm run preview  # serve the production build
npm run lint     # eslint .
```

There is **no test runner configured** — do not invent `npm test`. The build's
`tsc -b` typecheck is the correctness gate.

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
**work** repos): this is a **personal project and not a git repo** — no
worktrees, branches, PRs, parent-branch selection, JIRA/`tjira`/ticket triage,
tenant/BondFrontEnd machinery, or session-naming. Ignore all of that here.

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
  `Passw0rd!23` is a working login (owns nothing by default — create test chars under it).

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
  / `reference` / `health`. Add new calls here, not ad-hoc `fetch` in components.
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

**Auth:** `src/auth/AuthContext.tsx` exposes `useAuth()`; token stored in
localStorage. `components/RequireAuth.tsx` guards routes; `components/AppShell.tsx`
is the nav + `<Outlet/>` layout. Routes are wired in `src/App.tsx` — `/compendium`
is intentionally public (no `RequireAuth`); everything else is guarded.

**Backend rules that shape the client (don't fight them):**
- **Enums serialize as NUMBERS** over the wire (no `JsonStringEnumConverter`).
  Send/expect integers (`type: 2`, not `"Subclass"`); `types.ts` models numeric unions.
- **Derived-not-stored:** level, ability modifiers, HP, AC, saves, skills,
  proficiency bonus, etc. are computed server-side and returned read-only. The
  client submits only base/stored inputs — **render what the API returns, never
  recompute these client-side.**
- Record-DTO validation is server-side; expect `400` with a problem-details body
  in `ApiError.body`.

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

`CharacterBuilder` (`/character/new`) is **implemented**: a 6-step wizard (Race →
Class → Abilities → Skills → Equipment → Review) that assembles a `CharacterRequest`
and `POST`s via `characters.create()`, then navigates to the new sheet. Supports
**multiclass** (add multiple classes with levels summing to ≤20, designate the
starting class), ability scores via **point-buy** (27-pt budget, 8–15, live
counter) or a **Manual** mode (1–30, for homebrew/rolled stats), starting-class
skill picks, and equipping armor/shield/weapons (with category/AC/damage metadata
shown; drives derived AC + attacks). Create errors surface server-side
problem-details field messages. Decomposed into
presentational sub-components around a single stateful orchestrator. Live-verified
(single + multiclass + equipment). Not yet built: feats, background, subclass at
creation, and inventory items (level-up handles subclass post-creation).

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
the sheet. Verified live (HP, subclass, and null-count caster spell pools). Not yet
handled: **feat-based ASI** (ability-score improvements only — feats need a feats
endpoint + picker), and multi-pick spell counts beyond toggling.

Backend features that are **not modeled** — don't build UI for them: Half-Elf
"choose +1 to two", subrace modifiers, weapon properties (finesse/heavy/…), and
spell slots as anything but a single int.
