# Handover — what to do next (DMTool-FrontEnd)

> **✅ FULLY COMPLETED 2026-06-06 by the frontend session — do NOT re-run STEP 1/2.**
> - STEP 1 (CharacterSheet renames): done — build is GREEN (`tsc -b && vite build` ✓), lint clean.
> - STEP 2 (CharacterBuilder create flow): done — working single-class wizard → `POST /api/character`, live-verified.
> - Bonus: level-up UI (`routes/LevelUpDialog.tsx`) added + live-verified; `types.ts` reconciled.
> The living status doc is now `FRONTEND-CONTEXT.md` ("Suggested next steps"). The notes below
> are kept only as a record of the original ask. **Test login `dungeonmaster` was purged by the
> backend's DB cleanup — register a fresh account via the Login screen.**

Written 2026-06-06 by the backend-dir session for the **frontend session**.
Companion to `FRONTEND-CONTEXT.md` (stack, styling system, API map, gotchas).
Source of truth for contracts: `..\DMTool\DMTool\Models\*` + `..\DMTool\DMTool.Entities\Enums\*`.

## Status snapshot
- **Done this session:** `src/api/types.ts` is now a full, faithful mirror of the
  backend DTOs (reference + `CharacterRequest`/`CharacterResponse` + level-up);
  `src/api/endpoints.ts` is fully typed; `Vault.tsx` + `CharacterBuilder.tsx`
  reconciled to the new types. Auth/proxy verified live (9 races / 12 classes /
  319 spells / 478 items / 0 characters through `:5173` → backend `:3501`).
- **Build is RED.** `CharacterSheet.tsx` was NOT reconciled to the upgraded
  `types.ts` — 8 TS errors, all in that one file. Fix it first (below), then the
  build goes green again.

## STEP 1 (do first): make `CharacterSheet.tsx` compile
The DTO field names changed when `types.ts` was upgraded. An `abilityMod()` helper
was already added at the top of the file (currently unused — that's error #1).
Apply these renames in the JSX:

| Current (broken) | Replace with | Why |
|---|---|---|
| `c.raceName` | `c.race?.name` | `CharacterResponse.race` is a `RaceRef`, not a flat string |
| `a.statCode` | `a.name` | `AbilityScoreResponse` has `name`, no `statCode` |
| `a.modifier` | `abilityMod(a.effective)` | API does **not** return the modifier — derive `floor((effective-10)/2)` (helper already present) |
| `s.proficient` (saves) | `s.isProficient` | renamed |
| `s.statCode` (saves) | `s.name` | `SavingThrowResponse` has `name` |
| `s.bonus` (saves) | `s.modifier` | `SavingThrowResponse.modifier` |
| `s.proficient` (skills) | `s.isProficient` | `SkillBonusResponse.isProficient` |
| `s.bonus` (skills) | `s.bonus` | unchanged (skills DO have `bonus`) |

`npx tsc -b` should then be clean. (`Vault.tsx`/`CharacterBuilder.tsx` are
already on the new shapes — use them as the pattern.)

## STEP 2 (the actual feature): finish the CharacterBuilder create flow
`routes/CharacterBuilder.tsx` is still a stub: only Race + Class steps load data;
Abilities/Skills/Review show placeholder text. **This is NOT backend level-up
Phase 3** — that's an unrelated *level-up* task. The create endpoint already
exists: `POST /api/character` → `characters.create(payload: CharacterRequest)`.

Wire the wizard to assemble and submit a `CharacterRequest` (type already defined):
1. **Race** — capture the picked `raceId` in builder state (list loads; `PickList`
   buttons need an `onClick`/selection state).
2. **Class** — pick class(es) + level → `classes: [{ classId, level }]`
   (`CharacterClassRequest`). Single-class is fine for v1.
3. **Abilities** — `reference.stats()` → render the stats; enter base scores →
   `abilityScores: [{ statId, value }]` (`AbilityScoreRequest`, value = BASE 1–30).
   **Every `StatResponse.isDefault === true` stat MUST be present** or the
   controller 400s. Proposed UX: manual numeric entry (point-buy/std-array later).
4. **Skills** — optional: `reference.skills()` → `skillProficiencies:
   [{ skillId, level? }]` (`SkillProficiencyRequest`; level defaults to Proficient).
5. **Review** — `name`, `alignment` (enum int, e.g. `Alignment.TrueNeutral`),
   `experience`/`age`/`spellSlots` (default 0), `hasJackOfAllTrades: false`, then
   `await characters.create(payload)` → `navigate(\`/character/${res.id}\`)`.

Minimum required payload: `name` (≤200), `raceId`, `classes` (≥1, level sum ≤20),
`abilityScores` (all default stats). Everything else optional. On `ApiError`
(400) show `err.body` — cross-field rules (classes exist + distinct, level cap,
required stats) are validated server-side.

## Operational state (left running)
- **Frontend dev server**: `npm run dev` → http://localhost:5173 (background; HMR live).
- **Backend**: IIS pool `DMTool` running → `:3501`, `/api/health` ok. `/api` is proxied.
- **Test login**: `dungeonmaster` / `Passw0rd!23` (created in `DMTools_local`;
  the only non-SRD row vs the squash's 0-user curation — delete to restore).
- Vault is empty until you create a character (0 in DB by design).

## Gotchas (already baked into types.ts, but worth knowing)
- JSON is **camelCase**; **enums are NUMBERS** (modeled as const-object + union —
  `tsconfig` `erasableSyntaxOnly` forbids TS `enum`).
- `GET /api/character` (list) returns **full `CharacterResponse[]`** (no summary DTO).
- Ability **modifier is not returned** — derive it (`abilityMod`).
- All reference routes are `[Authorize]` (only `/api/health` + `/api/auth/*` are open).
