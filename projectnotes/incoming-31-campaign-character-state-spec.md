# Implementation spec — INCOMING #31: Per-campaign character state + DM inspiration

**Author:** Kevin's session (planning). **Implementer:** delegated Sonnet agent.
**Source of truth:** `INCOMING-FROM-BACKEND.md` §"INCOMING #31" (lines ~2279–2398) and
the backend repo's `HANDOFF-TO-FRONTEND-2026-06-14.md` §C/§D. Trust those two files
over this doc if they ever disagree — but they were both read end-to-end to write this.

> Backend C (per-campaign character state) and D (DM inspiration) ship together as
> features #31. Features A/B/E (#30: race default language, Extra Attack, DM situational
> advantage) from the same handoff are **already consumed** — do **not** touch them.

---

## 0. Context the implementer must internalize first

This is a pure JWT client of the DMTool JSON Web API. Read `CLAUDE.md` (repo root) once.
Non-negotiable conventions you will violate by accident if you don't:

- **TypeScript build constraints** (`tsconfig.app.json`: `erasableSyntaxOnly` +
  `verbatimModuleSyntax`): **no TS `enum`s** (use the const-object + numeric-union
  pattern already in `types.ts`); **type-only imports must use `import type`**;
  `noUnusedLocals`/`noUnusedParameters` are on. `tsc -b` must stay green.
- **Enums serialize as NUMBERS** over the wire. `ResourceRecharge` is already modeled
  in `types.ts` (0=None, 1=ShortRest, 2=LongRest) — reuse it.
- **Derived-not-stored:** the API computes HP max, AC, modifiers, etc. The campaign
  sheet's `maxHp`, and everything under `character` (the embedded `CharacterResponse`),
  is **read-only — render it, never recompute.** `character.armorClass` already
  reflects the per-campaign status effects; do **not** re-apply `statusEffects[]` on top.
- **State-replace pattern:** every mutation endpoint returns the **full**
  `CampaignCharacterSheetResponse`. There is exactly one place that writes panel state
  (`setSheet`). Mirror `EncounterView`'s `applyUpdate` discipline — never patch a single
  field locally; always replace with the server response.
- **No campaign-level SignalR.** These are plain REST calls. Do not open any persistent
  connection. (Windows-Home has a 3-concurrent-request cap; the encounter hub already
  uses one.) No live multi-client sync for this panel — that's accepted for v1.
- CSS: **tokens only** (`src/styles/tokens.css`). No hardcoded colors/sizes. Co-locate a
  `.css` next to the component; reference `var(--…)` exclusively. Aesthetic = ink/leather
  bg, parchment text, crimson actions, gold accents.
- **Don't hardcode rules.** Counts/caps come from the response (`max`, `inspiration`
  cap behavior, recharge). The client is advisory UX; the backend `400` is the gate.

### Verification gates (authoritative, in this order)
1. `npm run build` — `tsc -b` typecheck **must be green** (this is the correctness gate;
   there is no unit-test runner — do not invent `npm test`).
2. `npm run lint` — eslint must be green.
3. `oby verify --files "<changed files, comma-separated>"` — aim for **`delta: 0`**
   (new issues vs. baseline). Ignore oby's build step (it can't spawn npm here — false
   negative); steps 1–2 are the real build/lint gates.
4. Live screenshot of the panel (see §6). Local backend has migration 074 applied, so
   #31 works locally.

Do **not** commit or push. Hand back to Kevin's session for re-verify; push is his call
(push to `main` = production deploy, and prod is not yet migrated past 069, so #31 is
local-only until that deploy).

---

## 1. New API types — `src/api/types.ts`

Add at the end of the file (after the combat-log section), in a clearly-commented
"Scope B: Per-campaign character state (INCOMING #31)" block. Reuse the existing
`ResourceRecharge` union — do not redefine it.

```ts
// ---- Scope B: Per-campaign character state (INCOMING #31, migration 074) ----
// A character carries SEPARATE runtime state per campaign (current/temp HP, spell-slot
// + class-resource remaining, exhaustion, inspiration, active status effects). The
// campaign pool is the source of truth: encounters seed combatant snapshots from it,
// and on encounter End/Archive the combatant's HP + remaining pools write back to it.
// All endpoints return the full sheet (state-replace). No SignalR — plain REST.

export interface CampaignSpellSlotState {
  level: number;
  isPact: boolean;
  remaining: number;
  max: number; // derived live from the character; remaining is clamped to it on read
}

export interface CampaignResourceState {
  key: string; // stable slug (same value as a combatant's resourceKey)
  name: string;
  remaining: number;
  max: number;
  recharge: ResourceRecharge; // 0 None / 1 ShortRest / 2 LongRest
}

export interface CampaignStatusEffectState {
  statusEffectId: string; // catalog id — use for DELETE
  name: string;
  isBeneficial: boolean;
  remainingRounds: number | null; // null = untimed
  source: string | null;
}

export interface CampaignCharacterSheetResponse {
  character: CharacterResponse; // full derived sheet WITH per-campaign status effects
                                // already applied (AC / roll advantages reflect them) —
                                // never re-apply statusEffects[] on top of it.
  currentHp: number;            // always concrete (stored, or derived max if unset)
  maxHp: number;                // derived (== character.maxHitPoints)
  tempHp: number;
  inspiration: number;          // token count; RAW cap 1 (backend GameRules:InspirationMax)
  exhaustionLevel: number;      // 0–6; no direct setter — only long-rest decrements it
  spellSlots: CampaignSpellSlotState[];
  resources: CampaignResourceState[];
  statusEffects: CampaignStatusEffectState[];
}

// ---- Request bodies ----

// PATCH hp — currentHp null resets to derived max; tempHp floor 0. Note this is a
// RAW SET (unlike the combatant HP endpoint's delta semantics): the client computes the
// new absolute values for heal/damage UX (see panel §4).
export interface UpdateCampaignCharacterHpRequest {
  currentHp: number | null;
  tempHp: number;
}

// PATCH spell-slots — server clamps remaining to [0, derived max].
export interface UpdateCampaignSpellSlotRequest {
  slotLevel: number; // 1–9
  isPact: boolean;
  remaining: number;
}

// POST status-effects — apply a catalog effect to the campaign sheet.
export interface AddCampaignStatusEffectRequest {
  statusEffectId: string;
  remainingRounds?: number | null;
  source?: string | null;
}
```

---

## 2. New endpoint group — `src/api/endpoints.ts`

Add a new **top-level export** after the `campaigns` object (do NOT nest inside
`campaigns` — keeps the existing `campaigns.characters(id)` list call unambiguous).
Add the new types to the `import type { … }` block at the top.

```ts
// ---- Scope B: Per-campaign character state (INCOMING #31) ----
// All under /api/campaigns/{campaignId}/characters/{characterId}. Auth: DM (campaign
// owner) OR the character's owner — a non-owner non-DM gets 404 (no existence leak).
// inspiration/grant is DM-ONLY. Every call returns the full CampaignCharacterSheetResponse.
export const campaignCharacterState = {
  get: (campaignId: string, characterId: string) =>
    api.get<CampaignCharacterSheetResponse>(
      `/api/campaigns/${campaignId}/characters/${characterId}/state`,
    ),
  updateHp: (
    campaignId: string,
    characterId: string,
    body: UpdateCampaignCharacterHpRequest,
  ) =>
    api.patch<CampaignCharacterSheetResponse>(
      `/api/campaigns/${campaignId}/characters/${characterId}/hp`,
      body,
    ),
  updateSpellSlot: (
    campaignId: string,
    characterId: string,
    body: UpdateCampaignSpellSlotRequest,
  ) =>
    api.patch<CampaignCharacterSheetResponse>(
      `/api/campaigns/${campaignId}/characters/${characterId}/spell-slots`,
      body,
    ),
  addStatusEffect: (
    campaignId: string,
    characterId: string,
    body: AddCampaignStatusEffectRequest,
  ) =>
    api.post<CampaignCharacterSheetResponse>(
      `/api/campaigns/${campaignId}/characters/${characterId}/status-effects`,
      body,
    ),
  removeStatusEffect: (
    campaignId: string,
    characterId: string,
    statusEffectId: string,
  ) =>
    api.del<CampaignCharacterSheetResponse>(
      `/api/campaigns/${campaignId}/characters/${characterId}/status-effects/${statusEffectId}`,
    ),
  longRest: (campaignId: string, characterId: string) =>
    api.post<CampaignCharacterSheetResponse>(
      `/api/campaigns/${campaignId}/characters/${characterId}/long-rest`,
      {},
    ),
  shortRest: (campaignId: string, characterId: string) =>
    api.post<CampaignCharacterSheetResponse>(
      `/api/campaigns/${campaignId}/characters/${characterId}/short-rest`,
      {},
    ),
  grantInspiration: (campaignId: string, characterId: string) => // DM ONLY
    api.post<CampaignCharacterSheetResponse>(
      `/api/campaigns/${campaignId}/characters/${characterId}/inspiration/grant`,
      {},
    ),
  spendInspiration: (campaignId: string, characterId: string) =>
    api.post<CampaignCharacterSheetResponse>(
      `/api/campaigns/${campaignId}/characters/${characterId}/inspiration/spend`,
      {},
    ),
};
```

**There is intentionally NO per-resource setter** in #31 (the endpoint list has `hp`,
`spell-slots`, `status-effects`, the two rests, and the two inspiration ops — nothing
else). So class **resources are display-only** in this panel; their `remaining` changes
only via rests. See §4 "Resources" and §7.

---

## 3. New component — `src/components/CampaignCharacterPanel.tsx` (+ `.css`)

A self-contained modal panel showing one character's per-campaign runtime state. It is
**self-contained**: do **not** import or modify `CombatantPools.tsx`/`.css` (that powers
the verified live combat tracker — leave it untouched). Render your own small pip track
inside this component, with neutral `ccp__*` class names in `CampaignCharacterPanel.css`.

### Props
```ts
interface CampaignCharacterPanelProps {
  campaignId: string;
  characterId: string;
  characterName: string; // for the header before the fetch resolves
  isDm: boolean;         // gate inspiration/grant
  canManage: boolean;    // isDm || ownerId === userId — caller passes this; controls the whole panel
  onClose: () => void;
}
```

### Behavior
- On mount, `campaignCharacterState.get(campaignId, characterId)` → `setSheet(res)`.
  Show a skeleton/spinner while loading; surface `ApiError.message` on failure.
- Single state-write path: `function applySheet(s: CampaignCharacterSheetResponse) { setSheet(s); }`.
  Every mutation handler is `setBusy(true)` → `await campaignCharacterState.xxx(...)` →
  `applySheet(res)` → `setBusy(false)` (in `finally`); on `ApiError` set an inline error
  message. All interactive controls are `disabled={busy}` while a call is in flight.
- Wrap the whole thing in the shared `Modal` (`src/components/Modal.tsx`):
  `<Modal onClose={onClose} ariaLabel={`${characterName} — campaign state`}
   className="ccp" backdropClassName="ccp-backdrop"> … </Modal>`.

### Sections (top to bottom)

1. **Header** — character name (link to `/character/${characterId}` for the full sheet),
   plus a compact read-only derived strip from `sheet.character`: AC (`character.armorClass`),
   initiative (`character.initiative`), speed. Read-only — these already reflect campaign
   status effects. A close button.

2. **HP** — `currentHp / maxHp` and a temp-HP readout. Controls (only when `canManage`):
   - A heal/damage stepper: a small number input + "Heal" and "Damage" buttons.
     Compute the new absolute values client-side (the endpoint is a raw set, not a delta):
     - **Heal:** `currentHp = min(maxHp, currentHp + amt)`, `tempHp` unchanged.
     - **Damage:** temp absorbs first — `if (amt <= tempHp) { tempHp -= amt }
       else { const rem = amt - tempHp; tempHp = 0; currentHp = max(0, currentHp - rem) }`.
       (This mirrors the combatant HP convention; it's trivial UI math, not a hidden rule.)
     - Then `updateHp({ currentHp, tempHp })`.
   - A "Set temp HP" small input → `updateHp({ currentHp, tempHp: value })` (currentHp = current).
   - Optionally a direct "Set HP" input → `updateHp({ currentHp: value, tempHp })`.

3. **Inspiration** — show the token state (e.g. a filled/empty star for `inspiration` vs
   the RAW cap of 1; render `inspiration` count generically in case cap > 1 later).
   - `isDm` only: a **Grant** button → `grantInspiration(...)`, disabled when `inspiration >= 1`
     (advisory; backend caps).
   - `canManage`: a **Spend** button → `spendInspiration(...)`, disabled when `inspiration <= 0`
     (backend `400`s at 0 — also catch and show its message).

4. **Exhaustion** — read-only level indicator `exhaustionLevel / 6` (0 = none). **No setter
   endpoint** — note in a tooltip that it's reduced by a Long Rest. Do not build +/- controls.

5. **Spell slots** — for each `spellSlots[]` entry render a pip row (your `ccp__pip` track),
   labelled `L{level}` (or `Pact L{level}` when `isPact`, styled with the accent like the
   combat tracker's pact row). Interactive when `canManage`:
   - − → `updateSpellSlot({ slotLevel: s.level, isPact: s.isPact, remaining: s.remaining - 1 })`
   - + → `… remaining: s.remaining + 1`. Server clamps; disable − at 0 and + at max.
   - Use a pip track when `max <= 8`, else a `remaining/max` numeric fallback (same rule as
     `CombatantPools`). Hide the whole section when `spellSlots` is empty.

6. **Resources** — for each `resources[]` entry render the same pip visual but **display-only**
   (no +/− buttons — there is no resource-set endpoint in #31). Show `name`, `remaining/max`,
   and a recharge hint ("recharges on short/long rest") from `recharge`. Hide when empty.

7. **Status effects** — list `statusEffects[]`: name, a beneficial/harmful style cue,
   `remainingRounds` when not null, and `source` when present. When `canManage`:
   - A **remove** (×) button per effect → `removeStatusEffect(campaignId, characterId, e.statusEffectId)`.
   - An **add** control: load the catalog once via `reference.statusEffects()`
     (`StatusEffectResponse[]`), present a dropdown (or chip palette, sorted by name,
     split beneficial/harmful — mirror `EncounterView.renderConditionPalette` but simpler),
     with an optional "rounds" number input, → `addStatusEffect({ statusEffectId,
     remainingRounds: rounds || null })`. Apply is idempotent server-side.
   - **Caveat to surface in copy:** the campaign sheet tracks its OWN active status-effect
     set — permanent effects saved on the base character sheet do not carry in here.

8. **Rests** (when `canManage`) — "Short Rest" and "Long Rest" buttons → `shortRest` /
   `longRest`. Tooltips: Short = "pact slots + short-rest resources restored; HP unchanged";
   Long = "all slots + resources restored, HP to max, temp HP cleared, exhaustion −1".
   Recommend a `confirm()` before Long Rest (it resets a lot); Short can fire directly.

### CSS (`CampaignCharacterPanel.css`)
Tokens only. Reuse the existing pip visual language but with `ccp__*` class names (copy
the relevant rules from `CombatantPools.css` — `.cpools__pip`, `--on`, `__adj`, pact
accent — renamed to `ccp__pip` etc.). Panel shell: `.ccp` (the dialog box, ~`var(--…)`
sizing, scrollable if tall), `.ccp-backdrop` (the overlay). Match `Modal` callers already
in the repo (e.g. `LevelUpDialog.css`, `EditHpDialog.css`) for shell sizing/scroll idioms.

---

## 4. Wire the panel into `src/routes/CampaignDetail.tsx`

In the **Characters** section, on each `campChars.map((cc) => …)` row, add a **"Sheet"**
button (label it "Sheet" or "State") next to the existing Copy/Unregister buttons. Show it
only when the user can manage that character — **same condition as the existing Unregister
button**: `isDm || cc.ownerId === userId`.

Add panel open-state to the component:
```ts
const [statePanelChar, setStatePanelChar] =
  useState<{ id: string; name: string; ownerId: string } | null>(null);
```
Button `onClick={() => setStatePanelChar({ id: cc.characterId, name: cc.characterName, ownerId: cc.ownerId })}`.

Render the panel near the end of the returned JSX (after the sections):
```tsx
{statePanelChar && (
  <CampaignCharacterPanel
    campaignId={id}
    characterId={statePanelChar.id}
    characterName={statePanelChar.name}
    isDm={isDm}
    canManage={isDm || statePanelChar.ownerId === userId}
    onClose={() => setStatePanelChar(null)}
  />
)}
```
Import the component at the top. No other CampaignDetail logic changes — the panel
fetches its own state and is fully independent of the page's data loads.

---

## 5. Files touched (checklist)

- [ ] `src/api/types.ts` — 4 response + 3 request interfaces (§1).
- [ ] `src/api/endpoints.ts` — `campaignCharacterState` export group + type imports (§2).
- [ ] `src/components/CampaignCharacterPanel.tsx` — new (§3).
- [ ] `src/components/CampaignCharacterPanel.css` — new (§3, tokens only).
- [ ] `src/routes/CampaignDetail.tsx` — "Sheet" trigger button + modal mount (§4).

**Do NOT touch:** `CombatantPools.tsx/.css`, `EncounterView.tsx`, anything under #30,
or any backend file.

---

## 6. Live verification

Backend must be running with migration 074 (local IIS `:3501` or Kestrel `:5157`); the
Vite dev proxy serves `/api`. If a "missing data" screen appears, verify the proxy first:
`curl -m5 http://localhost:5173/api/classes` — if it hangs while `:3501` works, restart
`npm run dev` (known stale-proxy issue after IIS pool recycles; see CLAUDE.md).

Seeded data under `dungeonmaster` / `Passw0rd!23` (reusable): campaign **"Layout Preview"**
(`020242eb-17ce-4c4b-b072-a55fc2e47afe`) with registered characters (Seraphine Dawnbringer,
Paladin 10). Open `/campaigns/020242eb-17ce-4c4b-b072-a55fc2e47afe`, click **Sheet** on a
character, exercise: HP heal/damage/temp, grant+spend inspiration, spell-slot pips,
add/remove a status effect, short/long rest. Confirm each mutation state-replaces (values
update without a manual reload). Screenshot the open panel. Use the `spectral batch` recipe
in CLAUDE.md (inject `dmtool.jwt`, navigate, tall `--height`).

## 7. Known gaps / decisions to report back to Kevin

- **No resource-set endpoint** in #31 → class resources (Rage, Ki, Bardic, etc.) are
  display-only in the panel; they only reset via rests. If interactive spend is wanted,
  that needs a backend `PATCH .../resources/{key}` mirroring the combatant one — file a
  `FRONTEND-REQUEST-campaign-resource-set.md` in the **backend repo root** (don't implement
  backend; per repo rules write the request and wait). Flag this; don't invent a client path.
- **No exhaustion setter** → display-only, changes only via long rest. Same: a
  `PATCH exhaustion` could be requested later if DMs want manual control.
- **No live sync** (no campaign hub) — two clients viewing the same sheet won't see each
  other's changes until refetch. Accepted for v1 per the handoff.
- `PipTrack` is duplicated (small) between `CombatantPools` and this panel by deliberate
  choice (avoid regressing the verified combat tracker). A future shared extraction is a
  clean refactor if Kevin wants it.
