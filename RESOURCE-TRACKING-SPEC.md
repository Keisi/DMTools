# RESOURCE-TRACKING-SPEC — consume INCOMING #19 (written 2026-06-12, for the implementing agent)

**What this is:** the backend shipped per-combatant **resource pools, spell slots, and pact
slots** on the encounter aggregate (migration 064, live on `:3501`). This spec wires them
into the combat UI: pips + spend/restore controls on the DM's combatant cards and on the
player's own combat card, plus rest buttons and combat-log glyphs.

**Read these, in order, before writing any code:**
1. Repo `CLAUDE.md` — end-to-end (gates, TS constraints, spectral recipe incl. the
   Chrome-orphan gotcha, seeded data ids).
2. `INCOMING-FROM-BACKEND.md` → the **"INCOMING #19"** entry (bottom of file) — the FULL
   wire contract. This spec summarizes it but #19 is authoritative; on any conflict, #19 wins.
3. `src/components/DeathSaveTrack.tsx` (+ its styles) — the closest existing sibling: a
   pip-track with click handlers on a combatant card. Mimic its component/CSS conventions.
4. `src/routes/EncounterView.tsx` → `handleSetHp` / `handleApplyDelta` / `applyUpdate` —
   the mutation-handler pattern you will copy (busyCombatant guard, ApiError → setError,
   full-response state replace).

---

## Contract summary (from INCOMING #19 — verify against the entry itself)

New on `CombatantResponse` (all **additive**; character-linked combatants only; freeform
NPCs get `[] / [] / null`):

```jsonc
"resources": [ { "resourceKey": "barbarian:rage", "name": "Rage", "max": 3,
                 "remaining": 2, "recharge": 2, "source": "Barbarian" } ],
"spellSlots": [ { "level": 1, "max": 4, "remaining": 3 } ],   // standard pool (multiclass = ONE combined table)
"pactSlot":   { "level": 3, "max": 2, "remaining": 2 } | null // Warlock only; single object, NOT an array
```

- `resourceKey` is an opaque stable slug — address pools by it, never reconstruct it.
- Pools snapshot at combatant-add (and at `start` for linked combatants that have none);
  `max` is frozen like `maxHp`. **Combatants added before migration 064 in already-started
  encounters have NO pools** — verification needs freshly added combatants.

Endpoints (all return the full `EncounterResponse` + broadcast `EncounterUpdated`; authz =
DM **or** owner of the linked character; found-but-unauthorized ⇒ 400, missing ⇒ 404;
unknown key/pool ⇒ 400):

```
PUT  .../combatants/{cid}/resources/{resourceKey}   { "remaining": n }          // SET, clamped 0..max server-side
PUT  .../combatants/{cid}/spell-slots/{level}        { "remaining": n, "isPact": false }  // isPact optional
POST .../combatants/{cid}/rest                       { "kind": 2 }              // RestKind NUMERIC: 1=Short, 2=Long
```

Rest semantics: Short restores ShortRest-recharge resources **plus pact slots**; Long
restores **everything**. New combat-log event types (additive, server-rendered text):
`40 = ResourceChanged`, `41 = SpellSlotChanged`, `42 = Rested`.

---

## Step 1 — `src/api/types.ts` (exact additions)

**No TS `enum`s — const-object + union pattern, matching the file's existing style.**

```ts
// Next to ResourceRecharge:
export const RestKind = { Short: 1, Long: 2 } as const;
export type RestKind = (typeof RestKind)[keyof typeof RestKind];
```

New interfaces (place near `CombatantResponse`):

```ts
// A snapshotted consumable pool on a combatant (INCOMING #19). `max` is frozen at
// snapshot like maxHp; `remaining` is the mutable part (set-semantics endpoint).
export interface CombatantResourceResponse {
  resourceKey: string; // opaque stable slug — the PUT path segment
  name: string;
  max: number;
  remaining: number;
  recharge: ResourceRecharge; // 0 None / 1 ShortRest / 2 LongRest
  source: string; // class name, for the tooltip
}
export interface CombatantSpellSlotResponse {
  level: number;
  max: number;
  remaining: number;
}
```

On `CombatantResponse` (optional — additive contract, degrade cleanly when absent):

```ts
  // Consumable pools (backend mig. 064). Empty/null for freeform NPCs and for
  // combatants snapshotted before the migration.
  resources?: CombatantResourceResponse[];
  spellSlots?: CombatantSpellSlotResponse[]; // standard pool (multiclass-combined)
  pactSlot?: CombatantSpellSlotResponse | null; // Warlock pact pool — single object
```

Request shapes:

```ts
export interface UpdateCombatantResourceRequest { remaining: number; }
export interface UpdateCombatantSpellSlotRequest { remaining: number; isPact?: boolean; }
export interface RestRequest { kind: RestKind; }
```

`CombatEventType` const-object gains `ResourceChanged: 40, SpellSlotChanged: 41, Rested: 42`.

## Step 2 — `src/api/endpoints.ts` (campaigns group, next to `updateCombatantHp`)

```ts
  updateCombatantResource: (campaignId, encounterId, combatantId, resourceKey, body) =>
    api.put<EncounterResponse>(`/api/campaigns/${campaignId}/encounters/${encounterId}/combatants/${combatantId}/resources/${encodeURIComponent(resourceKey)}`, body),
  updateCombatantSpellSlot: (campaignId, encounterId, combatantId, level, body) =>
    api.put<EncounterResponse>(`...same prefix.../spell-slots/${level}`, body),
  restCombatant: (campaignId, encounterId, combatantId, body) =>
    api.post<EncounterResponse>(`...same prefix.../rest`, body),
```

(Write real types on the params, full template literals — the snippet above abbreviates
the shared prefix only for readability here.)

## Step 3 — shared pools component: `src/components/CombatantPools.tsx`

One component used by BOTH the DM card and the player card.

```ts
interface CombatantPoolsProps {
  combatant: CombatantResponse;
  disabled: boolean;            // busy flag from the parent
  interactive: boolean;         // false = display-only (ended encounters)
  onSetResource: (resourceKey: string, remaining: number) => void;
  onSetSlot: (level: number, isPact: boolean, remaining: number) => void;
  onRest: (kind: RestKind) => void;
}
```

Renders nothing (`return null`) when the combatant has no pools
(`!resources?.length && !spellSlots?.length && !pactSlot`). Otherwise a compact block:

- **One row per resource:** small name label, then a pip track (● filled × `remaining`,
  ○ empty × `max − remaining`), then ghost − / + buttons that call
  `onSetResource(key, remaining ∓ 1)` (− disabled at 0, + disabled at max). Row carries a
  design-system tooltip (`tip` + `data-tooltip`): `"{remaining}/{max} · {name} · {source} ·
  recharges on {short|long} rest"` (recharge 0 = omit the recharge clause).
- **One row per standard slot level:** label `L{level}`, same pips + −/+ →
  `onSetSlot(level, false, …)`.
- **Pact row** when `pactSlot` is non-null: label `Pact L{level}`, visually distinct
  (accent-bordered label chip), `onSetSlot(level, true, …)`.
- **Guard:** if a pool's `max > 8`, render `remaining/max` text instead of pips (defensive
  against homebrew; SRD maxima are small).
- **Rest buttons** at the row end: ghost `Short Rest` / `Long Rest` with tooltips stating
  exactly what each restores (see contract). Call `onRest(RestKind.Short|Long)`.
- When `interactive` is false: render pips/labels only — no buttons.

CSS: follow `DeathSaveTrack`'s convention for where its styles live and mirror it
(`cpools__*` class prefix). **Design tokens only** — no hardcoded colors/sizes; pips reuse
the visual language of the death-save track; keep the whole block one text-size down
(`--fs-xs`/`--fs-sm`) so it reads as secondary to HP.

## Step 4 — DM view: `src/routes/EncounterView.tsx`

- Three handlers next to `handleSetHp`, copying its exact shape (set `busyCombatant`,
  await the endpoint, `applyUpdate(result)`, `ApiError → setError`, finally clear busy):
  `handleSetResource(c, key, remaining)`, `handleSetSlot(c, level, isPact, remaining)`,
  `handleRest(c, kind)`.
- In `renderCombatant`, render `<CombatantPools>` as a **full-width sub-row between the
  identity row and the controls toolbar** (i.e. right after the badges `<ul>` / identity
  block, before `enc__comb-controls`), for any combatant that has pools. `interactive` =
  `isDm && !isEnded`; `disabled` = `busyCombatant === c.id`. Add a thin CSS wrapper class
  in `EncounterView.css` if needed for spacing (`enc__pools-row`, full-width like the
  controls row: `flex: 1 1 100%`).

## Step 5 — player view: `src/routes/PlayerEncounterView.tsx`

The player's own `CombatCard` already receives its combatant. Wire the same component:

- **Resources box** (the existing draggable "Resources" block): when the combatant has
  pools, render `<CombatantPools>` (resources only matter here — but the component is
  all-in-one; acceptable and simpler: render the full pools block inside the Resources
  box and DROP the slot rows from the Spellcasting box idea — see next bullet).
- **Decision (made — don't re-litigate):** ALL pools (resources + slots + pact + rest
  buttons) render inside the **Resources** box via the one component. The Spellcasting
  box stays as-is (DC/attack/known spells). One interactive surface, no split-brain.
  When the combatant has no pools, the Resources box falls back to its current static
  list (the character's resource maxima).
- Handlers mirror the DM ones but call `props.onUpdate(result)` (the view's existing
  state-replace callback) and use its local busy-state convention — find how the HP/death
  -save mutations in this file manage busy/error state and copy that exactly.
- `interactive` = the card is the viewer's own character (`isMine`-style flag already
  used by the HP/death-save controls — reuse the same condition) and the encounter is not
  Ended. Other players' cards / tracker rows get NO pools UI.

## Step 6 — log glyphs: `src/routes/EncounterLogPanel.tsx`

Read the existing `eventGlyph` / `eventKind` switches and add cases for 40/41/42 with
monochrome text glyphs consistent with the existing set (e.g. `◉` ResourceChanged,
`◇` SpellSlotChanged, `✚` Rested — adjust if they clash with what's already used).
Unknown-type fallback already exists; this is polish, not correctness.

---

## Commits (two)

1. `feat(api): model combatant resource/slot pools + rest (INCOMING #19)` — Steps 1–2 + 6.
2. `feat(combat): resource & spell-slot trackers on combatant cards` — Steps 3–5.

Each commit: `npm run build` + `npm run lint` green; `oby verify --files "<changed>"`
delta 0 (its `build` step false-negatives with `os error 193` — ignore only that);
ai-code-commenting body format (Stack/Changes/Reason/Modified), NO Co-Authored-By,
`git commit -F <tempfile>`. **NEVER `git push`.**

## Verification (prescriptive — do all of it)

0. **Kill orphan Chromes first** (`Stop-Process -Name chrome -Force` via PowerShell tool,
   ignore errors if none) — see the CLAUDE.md gotcha; then check
   `curl http://localhost:3501/api/health` → ok (if 503: `Start-WebAppPool DMTool`).
1. **Fresh test data is REQUIRED** (old combatants have no pools — snapshot happened
   before migration 064). Via API as `dungeonmaster` (script pattern: the repo's previous
   throwaway seeders used node fetch — write one in `.claude/`, delete it after):
   - Create a session in campaign "Layout Preview" (id in CLAUDE.md), then a NEW encounter
     in that session — **`sessionId` is now REQUIRED** by the frontend and will be by the
     backend.
   - Add a combatant linked to Seraphine Dawnbringer (character id in CLAUDE.md;
     `POST .../combatants { name, maxHp, armorClass, characterId }` — as the owner-DM this
     resolves). Paladin 10 ⇒ expect resources (e.g. Channel Divinity / Lay on Hands) and
     half-caster spell slots in the snapshot. Add one freeform goblin (no pools — proves
     the component self-hides).
   - If the linked add 400s for any reason, fall back to the e2eplayer-owned character
     route documented in `E2E-REGRESSION.md`.
2. **DM view:** spectral batch (CLAUDE.md recipe — token guard, `document.title`
   diagnostics): assert pools render (`document.querySelectorAll('.cpools__res-row').length
   > 0`, slot rows > 0, goblin card has none), then click one resource `−` via eval, wait
   600ms, assert the pip count dropped (re-query the DOM). **Separate eval actions with
   waits between clicks — N clicks in one eval collapse due to stale React closures.**
   Screenshot → `.claude/shot-restrack-dm.png`.
3. **Rest:** eval-click `Long Rest`, wait, assert pips back to max. (Same screenshot run.)
4. **Player view:** as the owner of a linked character (e2eplayer path), assert the
   Resources box shows interactive pools and a `+`/`−` click round-trips. Screenshot →
   `.claude/shot-restrack-player.png`.
5. Confirm the combat log shows the new entries (the backend renders the text; assert via
   the log panel's DOM that entries appeared after your clicks).

## Hard rules (same as every batch)

- NEVER push. Commits stay local on `main` for Kevin's review.
- Don't touch the backend repo. Don't change wire shapes beyond this spec — #19 is the
  contract; enums are NUMERIC on the wire.
- TS constraints are build-breaking: no TS enums, `import type` for types,
  noUnusedLocals/noUnusedParameters.
- Locate code by symbol, not by line number.
- If a quality-cascade stop hook demands a "completion loop", do not chase it — the
  authoritative gates for this repo are the npm build/lint + oby verify delta you ran.
- Out of scope: DM-side rest buttons on the PLAYER's other cards, NPC/monster resources,
  homebrew pool editing, the Spellcasting-box slot display (explicitly decided against).
