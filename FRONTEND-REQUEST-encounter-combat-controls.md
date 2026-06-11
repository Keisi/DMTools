# FRONTEND-REQUEST — Encounter combat controls (4 items: undo turn · per-combatant visibility · disposition · death saves)

**To:** the DMTool backend session (`<repos root>\DMTool`)
**From:** the DMTools-Frontend session
**Date:** 2026-06-11
**Re:** Three small, independent encounter additions, all needed for the new
**DM-vs-player split** of the encounter screen. The DM keeps the sides/initiative
tracker; players get their own combat view (their character card + a turn-order
tracker). Two of the three need state that must reach **other users' browsers**, so
they can't be frontend-only — they ride the combatant model + the existing
`EncounterUpdated` SignalR broadcast.

All three are **additive / non-breaking**. The frontend is already built against
them (optional fields, derived fallbacks) and will light up automatically as each
lands — so you can ship them in any order or separately.

> **✅ RESOLVED (2026-06-11) — all 4 items shipped & live on `:3501`.** Backend
> commits `c91411c` (items 1+2, migration 056) and `5983056` (items 3+4, migration
> 057); IIS pool recycled. Contracts match this request exactly; the already-built
> frontend consumes them with no code change. See the backend handoffs
> `HANDOFF-TO-FRONTEND-prevturn-combatant-visibility.md` and
> `HANDOFF-TO-FRONTEND-disposition-deathsaves.md`. **Open opt-in:** backend left
> `isActive` untouched on 3-failure death (combatant stays in turn order) — request
> the on-death drop if wanted.

---

## Item 1 — "Undo turn": `PUT .../encounters/{encounterId}/prev-turn`

### Problem
`PUT .../next-turn` advances `activeCombatantId` (and rolls the round when it wraps)
but has no inverse. A DM who clicks Next Turn by mistake can only recover by cycling
all the way around the order, which also increments `roundNumber` and re-fires
per-turn side effects. `activeCombatantId` / `sortOrder` / `roundNumber` are all
server-managed — no frontend workaround exists.

### Request
Add `PUT .../encounters/{encounterId}/prev-turn`, mirroring `next-turn` backwards:

1. Valid only while status is `Active` (else `409`/`400`, same as `next-turn`).
2. Move `activeCombatantId` to the **previous** combatant by `sortOrder`, skipping
   `isActive == false` / removed combatants (same skip rule as `next-turn`).
3. If the active combatant is already **first** in the order:
   - `roundNumber > 1`: decrement `roundNumber` by 1 and wrap to the **last**
     combatant in the order.
   - `roundNumber <= 1`: no-op or `400` (nothing precedes the first turn of round 1).
     The frontend already disables the button in this state — please guard server-side too.
4. Return the full `EncounterResponse` like every other encounter mutation.

### Notes
- Pointer move only — does **not** restore HP/temp-HP/condition changes made during
  the undone turn (those are independent mutations). Full per-turn undo would be a
  separate, larger request.
- No frontend confirmation — the DM's click is intentional.

### Frontend status (shipped, waiting)
`endpoints.ts` → `campaigns.prevTurn(...)`; `EncounterView.tsx` → `handleUndoTurn()`
+ an **↩ Undo Turn** button beside **Next Turn**, disabled at the first turn of round 1.

---

## Item 2 — Per-combatant, per-item player visibility

### Problem
In the player view the DM wants per-enemy, per-item control over what players see:
- **Hide combatant** — absent from the player view entirely (and the "now acting"
  banner anonymizes to "A hidden enemy is acting…").
- **Hide HP** — combatant shows, but its HP reads "HP ?".
- **Hide AC** — combatant shows, but its AC reads "AC ?".

These must reach other users' browsers, so they live on the combatant + broadcast.

### Request
1. Add three booleans to **`CombatantResponse`** (default `false`, camelCase):
   `isHiddenFromPlayers`, `hpHiddenFromPlayers`, `acHiddenFromPlayers`.
2. Accept them (each optional, independent) on the existing
   `PATCH .../encounters/{encounterId}/combatants/{combatantId}` — the same route
   that already does `name` / `maxHp` / `armorClass` — returning the full
   `EncounterResponse`.
3. Broadcast via the existing `EncounterUpdated` push.

### Notes
- Independent flags; `isHidden` supersedes the other two (a hidden combatant is just
  absent). Intended for enemy/NPC combatants but no need to enforce link-state.
- Persist on the combatant (survives reloads / late joiners).

### Frontend status (shipped, defaults to "visible")
`types.ts` → the three optional flags on `CombatantResponse` + `UpdateCombatantRequest`.
`EncounterView.tsx` → per-enemy **Hide from players** group (👁 / HP / AC toggles)
wired to `campaigns.updateCombatant(...)`. `PlayerEncounterView.tsx` respects all three.

---

## Item 3 — Per-combatant disposition (PC / friendly NPC / enemy)

### Problem
The player turn-order tracker shows a friend/foe indicator per combatant. The DM's
ally/enemy grouping today is **frontend-only DM localStorage** (`dmtool-enc-sides-*`)
and never reaches players, so disposition has to live on the combatant + broadcast.

### Request
1. Add to **`CombatantResponse`** an enum, serialized as a **NUMBER** (API convention):
   ```
   disposition: 0 = PlayerCharacter, 1 = FriendlyNpc, 2 = Enemy
   ```
   Suggested creation default: **PlayerCharacter (0)** when created with a
   `characterId` (linked PC), **Enemy (2)** when unlinked — matches the frontend
   fallback, so behavior is identical before the DM ever sets it.
2. Accept an optional `disposition` int (validate 0–2) on the **same combatant
   PATCH** as Item 2, returning the full `EncounterResponse`.
3. Broadcast via `EncounterUpdated`.

### Notes
- The DM UI only exposes a **Friendly ⇄ Enemy** toggle on **unlinked** combatants
  (linked ones are Player Characters by definition) — no need to enforce server-side.
- Independent of the Item 2 visibility flags.

### Frontend status (shipped, derives a default)
`types.ts` → `CombatantDisposition` (0/1/2 union) + optional `disposition` on
`CombatantResponse` + `UpdateCombatantRequest`. `EncounterView.tsx` → a
**Players see: [Enemy|Ally]** toggle on unlinked rows. `PlayerEncounterView.tsx` →
a color-coded **Player / Ally / Enemy** pill; absent ⇒ linked is Player, unlinked is
Enemy, so only the explicit "friendly NPC" case waits on this field.

---

## Item 4 — Death saves (D&D 5e) on a combatant at 0 HP

### Problem
When a PC drops to 0 HP it makes a death saving throw each turn (rolled at the
table). The DM needs to record successes/failures and both the DM tracker and the
player view must show them live. This is per-combatant combat state, so it lives on
the combatant + broadcasts like items 2/3.

### Request
1. Add two ints to **`CombatantResponse`** (default 0, camelCase):
   `deathSaveSuccesses` (0–3), `deathSaveFailures` (0–3).
2. Accept them (optional, validate 0–3) on the existing combatant `PATCH`, returning
   the full `EncounterResponse`. The frontend sets the absolute count when the DM
   clicks a pip (e.g. `{ deathSaveSuccesses: 2 }`).
3. Broadcast via `EncounterUpdated`.

### Backend rules to own server-side (the frontend only displays/sets the counts)
- **Reset to 0/0 when the combatant is healed above 0 HP** (any HP mutation that
  takes `currentHp` from 0 to > 0), and ideally also when it's first reduced to 0.
- 3 successes ⇒ stable; 3 failures ⇒ dead. The frontend renders "Stable"/"Dead"
  from the counts, but if you want to also flip `isActive` to false on death (3
  failures), that's welcome — say so and we'll honor it.
- Optional niceties (not required): a `setCurrentHp` of 1+ from a nat-20 is just a
  normal heal (counts reset); these are table-rolled, so no dice logic needed
  server-side.

### Frontend status (shipped, defaults to 0/0)
- `types.ts` → optional `deathSaveSuccesses` / `deathSaveFailures` on
  `CombatantResponse` + `UpdateCombatantRequest`.
- Shared `components/DeathSaveTrack.tsx` (3 success + 3 failure pips). DM view shows
  it interactive (combat mode, linked combatant at 0 HP) wired to
  `campaigns.updateCombatant(...)`; player view shows it read-only (tracker row +
  a "Dying" banner on the combat card). Until the backend persists the counts the
  DM's clicks won't survive a reload/other clients.

---

## Summary

| # | Surface | Change | Frontend default before it lands |
|---|---|---|---|
| 1 | `PUT .../encounters/{id}/prev-turn` (new) | Step turn pointer back one | Button shows a request-pending error |
| 2 | `CombatantResponse` + combatant `PATCH` | `isHiddenFromPlayers` / `hpHiddenFromPlayers` / `acHiddenFromPlayers` | Everything visible |
| 3 | `CombatantResponse` + combatant `PATCH` | `disposition` (0 PC / 1 FriendlyNpc / 2 Enemy) | linked⇒PC, unlinked⇒Enemy |
| 4 | `CombatantResponse` + combatant `PATCH` | `deathSaveSuccesses` / `deathSaveFailures` (0–3), reset on heal | 0/0 |

Items 2, 3, and 4 all extend the **same** `PATCH .../combatants/{combatantId}` route
(last touched in INCOMING #17, combatant-edit) and the same `EncounterUpdated`
broadcast — so they're one combatant-DTO change plus the PATCH binding (item 4 also
needs the reset-on-heal rule). Item 1 is a standalone route.
