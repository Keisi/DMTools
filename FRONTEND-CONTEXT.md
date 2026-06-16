# DMTool-FrontEnd — Context & Handover

Scaffold created 2026-06-06. This is the **separate frontend** for the headless
**DMTool** JSON Web API (ASP.NET Core 10, JWT bearer, Dapper/SQL Server). The
backend lives at `C:\Users\keisi\source\repos\DMTool` — read its `CLAUDE.md`,
`docs/ROADMAP.md`, and `docs/HANDOVER.md` for domain rules.

## SESSION STATE (2026-06-10) — resume here
- **Scope B COMPLETE** (multi-user campaigns + live combat). All six planned tiers
  shipped — see `SCOPE-B-PLAN.md` for the tier breakdown and `<backend>/docs/
  SCOPE-B-FRONTEND-HANDOVER.md` for the API contract. Summary:
  - **Tier 0** — character `isRetired` flag + Vault "show retired" filter.
  - **Tier 1** — contract layer: campaign/encounter/copy/retire DTOs in `types.ts`,
    routes in `endpoints.ts` (`campaigns` group).
  - **Tier 2** — campaign UI: list, create, detail (membership invite/join/accept/
    reject/remove, DM transfer, register characters, sessions + rosters).
  - **Tier 3** — encounter REST combat tracker: create/start/next-turn/end, combatant
    add/remove, initiative, HP (delta / setCurrent / setTemp), ally/enemy split.
  - **Tier 4** — SignalR live sync: `src/hooks/useEncounterHub.ts`, live status
    indicator, archived-takeover screen. New dep `@microsoft/signalr`. Backend IIS
    has no WS upgrade, so it negotiates down to **Server-Sent Events** (still
    server→client push); `/hubs` proxied in `vite.config.ts` (`ws:true`).
  - **Tier 5** — character copy UI (owner path on sheet; DM path on campaign detail).
- **Builds GREEN** (`npm run build`: tsc + vite, 0 errors; `npm run lint` clean).
  `oby verify` build step is a false negative (can't spawn npm, `os error 193`) —
  trust `npm run build`/`lint`, not oby's build step. The signal that matters is
  `oby verify` **delta: 0**.
- **This repo IS a git repo** (Azure DevOps, `origin/main`; CLAUDE.md's "not a git
  repo" note is stale). Work is committed directly to `main`, each change gated
  (build + lint + delta 0) and a critical-review push-gate marker stamped at
  `.claude/.critical-review-done-main-<sha7>` (a PreToolUse hook blocks `git push`
  without a marker for HEAD). Those marker files are **untracked/local** — don't
  commit them.
- **Test login**: `dungeonmaster` / `Passw0rd!23` (owns nothing by default —
  create test chars under it; character access is owner-scoped, non-owner → 404).
- Backend (`C:\Users\keisi\source\repos\Personal\DMTool`) IS its own git repo
  (Azure DevOps, branch `master`); it's on IIS `:3501` (pool `DMTool`). The
  backend↔frontend contract is exchanged via `INCOMING-FROM-BACKEND.md`
  (backend→us, in THIS repo) and `FRONTEND-REQUEST-*.md` files (us→backend, in
  the BACKEND repo). DB through **migration 077** as of 2026-06-16. INCOMING
  #19–#32 are all shipped + consumed (#31/#32 pushed this session, `347c167`).
  **INCOMING #33–#36 are SHIPPED by the backend but NOT yet consumed by the client**
  — #33 hit-dice, #34 Half-Elf ability choice, #35 weapon properties, #36 exhaustion
  penalties DERIVED (supersedes #32's store-only note). Trust the newest INCOMING entry
  + `CLAUDE.md` over this line. **Split-brain:** prod Azure backend is still behind
  (mig 069-ish) → everything from #25/#29/#30 onward (migs 071–077) is local-only until
  the backend is deployed + those migrations run in prod.

### Backend requests outstanding (filed in the backend repo)
> The live, authoritative outstanding list is in `CLAUDE.md` ("Backend context")
> — this section lags. As of 2026-06-16 the **backend→ queue is EMPTY**: the three
> requests filed 2026-06-15 (exhaustion-penalty-derivation / halfelf-choose-ability-increase /
> weapon-properties) were all closed same-cycle as INCOMING #34/#35/#36 (+ bonus #33 hit-dice).
> The open work is now **frontend-side** — consume #33–#36 (none wired yet). The entries below
> are older and may already be partly addressed; defer to `CLAUDE.md`.
- **`FRONTEND-REQUEST-scope-b-invitation-discovery.md`** (2026-06-10, NEW) — **invited
  players can't discover their invitations.** `GET /api/campaigns` excludes Invited
  (status 1) members (returns `[]`) and `GET /{id}` 404s for them, so the only path is
  a hand-shared URL → `POST /join` auto-accept. Asked for either a
  `GET /api/campaigns/invitations` list endpoint OR including invited campaigns in the
  list + a `myStatus` field + read-only `GET /{id}` for invitees. The DM side is fixed
  (invited members now show in an "awaiting response" list with Cancel). Also a
  non-blocking note: the hub negotiates SSE-only (no WS upgrade from IIS) — optional
  backend `UseWebSockets()` enhancement.
- **`FRONTEND-REQUEST-spell-scaling-tier2.md`** — structured per-slot/per-level
  scaling dice (`scaling.diceByLevel`) so we can render a **computed** upcast
  table. Tier 1 (free-text `scalingDice`) is shipped and only *displayed*; the
  computed view drops into the existing `spellCombat()` resolver in
  `CharacterSheet.tsx` when this lands. (See "spell display" under Screens.)

Delivered + consumed this session: spell-cantrip-management (PUT /spells +
prepared-caster cantrips), hp-override (PUT /{id}/hp), spell-damage-fields Tier 1
(structured combat fields), multiclass choice-grants, unarmed/unarmored.

## Stack
- **Vite 8 + React 19.2 + TypeScript** (SPA, no SSR — it's a JWT client of the API).
- **react-router-dom** for routing.
- **Plain CSS + design tokens** — chosen so visuals/animations are easy to retune.
  No CSS framework, no CSS-in-JS.
- tsconfig has `erasableSyntaxOnly` + `verbatimModuleSyntax`: **no TS `enum`s**
  (use the const-object + union pattern, see `src/api/types.ts`), **no parameter
  properties**, and type-only imports must use `import type`.

## Run it
```powershell
npm install        # already done
npm run dev        # http://localhost:5173  (proxies /api -> backend)
npm run build      # tsc -b && vite build  (currently GREEN)
npm run lint
```
The backend must be running for live data. It's hosted on **IIS at
`http://localhost:3501`** (or Kestrel: `dotnet run --project DMTool
--launch-profile http` → `:5157`). `npm run dev` proxies `/api` → `:3501`
(see `vite.config.ts` + `.env`), so there's **no CORS setup needed** in dev.

## Visual system — where to tweak the look (the whole point of the structure)
All under `src/styles/`:
- **`tokens.css`** — THE control panel. Every color, font, spacing, radius,
  shadow, duration, easing is a CSS custom property in `:root`. Change a value
  here → it cascades everywhere. A commented `[data-theme]` block shows how to
  add an alternate skin.
- **`theme.css`** — base element styling + shared primitives (`.btn`, `.panel`,
  `.input`, `.badge`, `.rule`, layout helpers) built from the tokens.
- **`animations.css`** — all `@keyframes` + utility classes (`.anim-rise-in`,
  `.anim-pop-in`, `.anim-dice`, `.anim-glow`, `.skeleton`, `.stagger`). Motion
  feel is tuned via `--dur-*` / `--ease-*` tokens. Respects `prefers-reduced-motion`.
- Per-screen CSS is co-located (`routes/Vault.css`, etc.) and references tokens only.
- Fonts: Cinzel (display) + Inter (body), loaded in `index.html`; swap there +
  in `--font-*`.

Theme aesthetic: Fight Club 5e inspired — ink/leather background, parchment
text, D&D crimson actions, gold accents.

## Screens (modeled on Fight Club 5e)
- `/login` — `routes/Login.tsx` — login/register → JWT (wired, working).
- `/vault` — `routes/Vault.tsx` — character list grid (wired to `GET /api/character`).
  Scope B: per-card **retire** toggle (`PUT /api/character/{id}/retire`); retired
  cards hidden behind a "Show retired (N)" header toggle.
- `/character/:id` — `routes/CharacterSheet.tsx` — the full sheet. Header actions:
  **Level Up** / **Multiclass** (both → `routes/LevelUpDialog.tsx`; disabled at the
  level cap, `MAX_TOTAL_LEVEL`), **Edit** (→ builder), **Manage Spells**
  (caster-only → `routes/ManageSpellsDialog.tsx`), **Edit HP**
  (→ `routes/EditHpDialog.tsx`), **Copy to User** (inline username form →
  `POST /api/character/{id}/copy`; Scope B).
  - **Spellcasting block**: per-caster line (ability · save DC · spell atk), then
    known spells **grouped by spell level** (Cantrips / Level N · slot count), each
    showing `dmg/heal <dice> <type> · spell attack|<ABIL> save · ↑ upcasts/scales`
    via the **`spellCombat()` resolver** (the single Tier-2 swap point — see below).
    Unlocked-but-empty levels show "No spells prepared"; utility spells show their
    description on hover. Catalog is fetched once and joined to the character's
    thin spell refs by id.
  - **Manage Spells dialog** (`PUT /api/character/{id}/spells`): full-replacement
    spell editor, pool = caster-class spells up to max castable level (+ owned),
    grouped by level, count guidance (cantrips known / prepared = mod+level), soft
    over-select warning. Uncapped (DM tool).
  - **Edit HP dialog** (`PUT /api/character/{id}/hp`): set/clear `hitPointsOverride`
    (1–9999 / null=derived) with an override warning.
- `/character/new` (and `/character/:id/edit`) — `routes/CharacterBuilder.tsx` +
  `CharacterBuilder.steps.tsx` — create/edit wizard: Race → Class → Abilities →
  Skills → Choices → Spells → Background → Feats → Equipment → Review. Point-buy
  (default; edit re-opens in point-buy when scores fit) or Manual; multiclass with
  ability prereq gating + DM override; above-L1 ASIs (split into 1–2 legs);
  fighting-style/expertise/metamagic/eldritch-invocation choices; prepared casters
  now pick cantrips. Subclass-at-creation, background-skill-swap UI, inventory
  items still not built.
- `/compendium` — `routes/Compendium.tsx` — reference-data browser
  (spells/items/races/classes), open routes, no auth.
- `/campaigns` — `routes/CampaignList.tsx` (Scope B) — campaign grid with DM/Member
  badge (DM = `campaign.dmUserId === userId`); inline create form. New "Campaigns"
  entry in `AppShell` nav.
- `/campaigns/:id` — `routes/CampaignDetail.tsx` (Scope B) — single component, DM-vs-
  member controls conditional. Sections: **Members** (active roster, pending requests
  with DM accept/reject, own invite notice, invite-by-username + DM-transfer forms),
  **Characters** (registered list, register own char, unregister, DM "Copy" to another
  user), **Sessions** (list + date + roster count, DM create/delete + roster expando),
  **Encounters** (list with status badge + round, DM create form). Non-Active users get
  a 404 from `GET /{id}` → a **Join Campaign** CTA (`POST /join`, auto-accepts an
  invite). Re-fetch uses a `refreshKey` counter (avoids synchronous setState in effects,
  which the `react-hooks/set-state-in-effect` rule forbids).
- `/campaigns/:id/encounters/:encounterId` — `routes/EncounterView.tsx` (Scope B) — the
  live combat tracker. Status-driven (Pending → Active → Ended); header actions Start /
  Next-Turn / End / Archive (DM-only). Combatants split into **Players & Allies** /
  **Enemies & Monsters** (side stored per-encounter in localStorage, `dmtool-enc-sides-*`;
  defaults by `characterId` presence). Per-row controls: initiative set, Dmg/Heal delta,
  direct Set-HP, remove. Add-combatant form per side (ally form can link a campaign
  character → auto-fills Max HP/AC from the sheet if the DM owns it). Every mutation
  returns the full `EncounterResponse` → single `applyUpdate` state-replace path.
  **Live**: `useEncounterHub` pushes flow through the *same* `applyUpdate`; a header
  indicator shows Live/Reconnecting/Offline; an `EncounterArchived` push swaps in an
  "encounter ended" takeover for observers.

## Code map
- `src/api/client.ts` — fetch wrapper: base URL (`VITE_API_BASE`, empty=proxy),
  JWT bearer injection from `localStorage` (`dmtool.jwt`), `ApiError`.
- `src/api/endpoints.ts` — one function per route, grouped `auth` / `characters`
  / `reference` / `health` / `campaigns` (Scope B: campaign CRUD, membership,
  characters, sessions/rosters, encounters + combatant ops — every encounter
  mutation typed to return the full `EncounterResponse`).
- `src/api/types.ts` — TS types mirroring backend DTOs, reconciled to the live
  contract (see the source-of-truth header in the file). Scope B added campaign/
  encounter response+request DTOs, the `CampaignMemberStatus`/`EncounterStatus`
  numeric-union enums, `isRetired` on `CharacterResponse`, and retire/copy requests.
  Homebrew `*CreateRequest` DTOs not modeled yet.
- `src/hooks/useEncounterHub.ts` (Scope B) — SignalR client. Connects to
  `/hubs/encounter` (URL resolved against `API_BASE`; JWT via `?access_token=` since
  WS can't carry an auth header), `withAutomaticReconnect()` + `onreconnected`
  re-`JoinEncounter`, `EncounterUpdated`/`EncounterArchived` handlers, `LeaveEncounter`+
  `stop()` on unmount. Callbacks kept in refs (synced in an effect, not during render,
  per `react-hooks/refs`) so re-renders don't rebuild the connection.
- `src/auth/AuthContext.tsx` — `useAuth()`; token in localStorage. Scope B: also
  exposes `userId` (decoded from the JWT `sub` claim) + `username` (stored at login)
  so screens can compute DM/owner identity client-side.
- `src/components/` — `AppShell` (nav + outlet), `RequireAuth` (route guard).

## Backend API surface (from DMTool/CLAUDE.md)
- `POST /api/auth/register`, `POST /api/auth/login` → `{ token }` (JWT, `sub` claim).
- `/api/character` — GET list, POST create, `GET/PUT/DELETE {id}` (all `[Authorize]`).
  - `POST {id}/levelup/plan`, `POST {id}/levelup/apply`
  - `PUT {id}/spells` (full spell-list replace), `PUT {id}/hp` (hitPointsOverride)
  - `POST {id}/inventory/add`, `POST {id}/inventory/consume`,
    `PUT {id}/inventory/{itemId}/attunement`
  - **Scope B**: `PUT {id}/retire` (`{isRetired}`), `POST {id}/copy`
    (`{targetUsername}` → new char owned by target; caller must own it OR be DM of a
    campaign containing it — first use of the DM-as-secondary-owner access path).
- **Campaigns** (Scope B, `/api/campaigns`, all `[Authorize]`): GET list / POST create /
  `GET/DELETE {id}` · `PUT {id}/dm` (transfer) · `{id}/members` (GET, `invite`, `join`,
  `members/{uid}/accept|reject`, `DELETE members/{uid}`) · `{id}/characters`
  (GET/POST/`DELETE {cid}`) · `{id}/sessions` (GET/POST/`DELETE {sid}`,
  `sessions/{sid}/roster/{cid}` POST+DELETE).
- **Encounters** (Scope B, `/api/campaigns/{cid}/encounters`): GET list (summary) /
  `GET {eid}` (full) / POST create / `DELETE {eid}` · `PUT {eid}/start|next-turn|end` ·
  `{eid}/combatants` (POST, `DELETE {combId}`, `PUT {combId}/initiative`,
  `PUT {combId}/hp` with independent `delta`/`setCurrentHp`/`setTempHp`). Every
  mutation returns the full `EncounterResponse`.
- **Hub** (Scope B): `/hubs/encounter` (JWT via `?access_token=`); client
  `JoinEncounter`/`LeaveEncounter(encounterId)`; server→client `EncounterUpdated
  (EncounterResponse)` + `EncounterArchived(id)`.
- Reference (GET list + POST homebrew): `/api/races` `/api/classes` `/api/stats`
  `/api/weaponcategories` `/api/weapons` `/api/armorcategories` `/api/armors`
  `/api/languages` `/api/skills` `/api/spells` `/api/items` `/api/feats`
  `/api/backgrounds` `/api/editions` `/api/statuseffects`
- `/api/health`.

## Gotchas (carried from the backend)
- **Enums serialize as NUMBERS** over the wire (System.Text.Json default, no
  string converter). Send/expect integers (e.g. `type: 2`, not `"Subclass"`).
  `src/api/types.ts` models them as numeric unions.
- **Record DTO validation** on the backend is on constructor params; cross-field
  rules run server-side — expect `400` with a problem-details body
  (`ApiError.body`).
- **Derived-not-stored**: level, HP, AC, saves, skills, proficiency bonus, etc.
  are computed server-side and returned read-only. The client only ever submits
  *base/stored* inputs (base ability scores, chosen race/classes/skills/spells,
  overrides). Don't try to compute these client-side — render what the API returns.
  **Exception:** the ability-score *modifier* is NOT in `AbilityScoreResponse`
  (only `effective` is), so the client derives it via `floor((effective-10)/2)`.

## Suggested next steps
1. **Spell scaling Tier 2** (waiting on backend `FRONTEND-REQUEST-spell-scaling-tier2.md`):
   when `scaling.diceByLevel` ships, change ONLY `spellCombat()` in
   `CharacterSheet.tsx` to render a computed per-slot/level upcast table
   (`3rd 8d6 · 4th 9d6 …`). The render/grouping already supports it.
2. Subclass-at-creation in the builder; background-skill-swap UI (5e duplicate
   rule — backend allows it, we just exclude bg grants from class picks today).
3. Homebrew authoring: spell create form (incl. the Tier-1 combat fields +
   `damageTypeId`/`saveStatId`), and model the other `*CreateRequest` DTOs when
   the Compendium gains "add homebrew" actions.
4. Inventory items in the builder; richer inventory management on the sheet.
5. Level-up: feat-based ASI picker; inline spell *swap* (currently swaps route
   through `PUT /spells` — backend confirmed apply stays add-only).

Done (recent): **Scope B — multi-user campaigns + live combat** (all six tiers; see
SESSION STATE above and `SCOPE-B-PLAN.md`). Earlier: full `CharacterSheet` with
quick-actions (Manage Spells, Edit HP), spellcasting grouped-by-level with
dice/save/upcast display via the Tier-2-ready `spellCombat()` resolver; multiclass
choice-grants + ability-prereq gate; edition-driven multiclass threshold;
prepared-caster cantrip selection; unarmed strike + unarmored defense rendered from
the API. `types.ts` tracks the live contract through INCOMING #11 + Scope B. Backend
IDOR/BOLA fixed (non-owner → 404).
