# DMTool-FrontEnd — Context & Handover

Scaffold created 2026-06-06. This is the **separate frontend** for the headless
**DMTool** JSON Web API (ASP.NET Core 10, JWT bearer, Dapper/SQL Server). The
backend lives at `C:\Users\keisi\source\repos\DMTool` — read its `CLAUDE.md`,
`docs/ROADMAP.md`, and `docs/HANDOVER.md` for domain rules.

## SESSION STATE (2026-06-06) — resume here
- **Scaffold complete + builds GREEN** (`npm run build`: tsc + vite, 0 errors).
- **Verified live end-to-end**: dev server (`:5173`) proxies `/api` → backend IIS
  (`:3501`, pool `DMTool`, health ok). Registered a user through the proxy and
  pulled real SRD data: **9 races, 12 classes, 319 spells, 478 items, 0 characters**.
- **Auth fix applied this session**: every reference controller is `[Authorize]`
  (only `/api/health` + `/api/auth/*` are anonymous). `src/api/endpoints.ts`
  reference calls now send the JWT; `/compendium` route is now behind `RequireAuth`.
- **Test login** (created during testing, in `DMTools_local`):
  **`dungeonmaster` / `Passw0rd!23`**. NOTE: this adds 1 user to the otherwise
  SRD-only/0-user DB from the backend's SQL squash — delete it if you want to
  restore that curation (it's a convenience login, not seed data).
- Dev server may still be running in the background (`npm run dev`). Backend IIS
  pool left **running**.

### NEXT TASK (frontend): finish the CharacterBuilder create flow
`routes/CharacterBuilder.tsx` is a STUB — only Race + Class steps load data; the
Abilities/Skills/Review steps show "to be implemented" placeholder text.
**This is NOT backend level-up Phase 3** (that's an unrelated backend task for
*level-up* sub-feature choices). The create endpoint **already exists**:
`POST /api/character` → `Create(CharacterRequest)`. To finish, wire the wizard:
1. Race step → capture selected `RaceId` (list loads; needs selection state).
2. Class step → select class(es) + level → `Classes: [{ jobId, level }]`.
3. Abilities step → load `/api/stats`, enter base scores → `AbilityScores:
   [{ statId, value }]`. **All `IsDefault` stats must be present** (controller
   validates). Proposed UX: manual numeric entry (point-buy/std-array later).
4. Skills step → optional: load `/api/skills` → `SkillProficiencies`.
5. Review → `characters.create(payload)` → navigate to `/character/:id`.

**`CharacterRequest` shape** (DMTool/Models/Characters/CharacterContracts.cs):
required = `Name` (≤200), `RaceId`, `Classes` (≥1, each `{jobId, level}`),
`AbilityScores` (≥1, each `{statId, value}`); plus `Alignment` (enum int),
`Experience`, `Age`, `SpellSlots` (default 0). All else optional
(HitPointsOverride, ArmorClassOverride, ArmorId/ShieldId, EquippedWeaponIds,
proficiency additions, StartingClassId [defaults to the single class],
SkillProficiencies, SpellIds, FeatIds). Cross-field rules (classes exist +
distinct, level sum ≤20, required default stats present) run server-side → 400.

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
- `/character/:id` — `routes/CharacterSheet.tsx` — the sheet: vitals, ability
  boxes, saves, skills, inventory (wired to `GET /api/character/{id}`). Has a
  **Level Up** button → `routes/LevelUpDialog.tsx` (plan → choose → apply).
- `/character/new` — `routes/CharacterBuilder.tsx` — **working** create wizard:
  6 steps (Race → Class → Abilities → Skills → Equipment → Review), supports
  multiclass + equipped armor/shield/weapons → `POST /api/character` → redirect to
  the new sheet. Feats, background, subclass-at-creation, and inventory not yet built.
- `/compendium` — `routes/Compendium.tsx` — reference-data browser
  (spells/items/races/classes), open routes, no auth.

## Code map
- `src/api/client.ts` — fetch wrapper: base URL (`VITE_API_BASE`, empty=proxy),
  JWT bearer injection from `localStorage` (`dmtool.jwt`), `ApiError`.
- `src/api/endpoints.ts` — one function per route, grouped `auth` / `characters`
  / `reference` / `health`.
- `src/api/types.ts` — TS types mirroring backend DTOs, reconciled to the live
  contract (see the source-of-truth header in the file). Homebrew `*CreateRequest`
  DTOs not modeled yet.
- `src/auth/AuthContext.tsx` — `useAuth()`; token in localStorage.
- `src/components/` — `AppShell` (nav + outlet), `RequireAuth` (route guard).

## Backend API surface (from DMTool/CLAUDE.md)
- `POST /api/auth/register`, `POST /api/auth/login` → `{ token }` (JWT, `sub` claim).
- `/api/character` — GET list, POST create, `GET/PUT/DELETE {id}` (all `[Authorize]`).
  - `POST {id}/levelup/plan`, `POST {id}/levelup/apply`
  - `POST {id}/inventory/add`, `POST {id}/inventory/consume`,
    `PUT {id}/inventory/{itemId}/attunement`
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
1. Builder gaps: feats, background, subclass-at-creation, and inventory items
   (the `CharacterRequest` fields exist; just no UI yet).
2. Level-up gaps: feat-based ASI (needs a feats endpoint + picker) and richer
   spell-pick UX.
3. Inventory management on the sheet (add/consume/attune) — endpoints + DTOs done.
4. Edit existing characters (`PUT /api/character/{id}`) — reuse the builder.
5. Model homebrew `*CreateRequest` DTOs + POST flows when the Compendium gains
   "add homebrew" actions.

Done: `oby init`; `types.ts` reconciled to the live contract; `CharacterBuilder`
(multiclass + equipment, live-verified); **level-up UI** (`LevelUpDialog`,
plan→choose→apply, live-verified); rich `CharacterSheet` (attacks/resources/
spellcasting/features/traits/encumbrance/status). Backend IDOR/BOLA on character
endpoints fixed by the backend session (non-owner now gets 404 — `ApiError` covers it).
