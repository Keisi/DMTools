# FRONTEND-REQUEST — per-combatant resource & spell-slot tracking in encounters

**To:** the DMTool backend session (`C:\Users\keisi\source\repos\Personal\DMTool`)
**From:** the DMTool-FrontEnd session
**Date:** 2026-06-12
**Re:** the only unbuilt Mode B / Scope B MVP bullet — consumable pools during combat.

## Problem

A `CharacterResponse` already exposes the **maxima** of its consumable pools:
- `resources[]` — `CharacterResourceResponse { name, recharge, max, source }`
  (Rage, Ki, Sorcery Points, Channel Divinity, Bardic Inspiration, …).
- `spellcasting[].spellSlots[]` — `{ level, count }` (and Warlock pact slots).

But there is **no spent/remaining** anywhere — the roadmap's own step 2 notes
"Remaining resource work: spent/remaining (gameplay) tracking." A `CombatantResponse`
snapshots HP/AC/initiative/death-saves but carries **no resource or slot pools at
all**. So during a fight the DM has no way to track "Bjorn has 1 Rage and a 2nd-level
slot left" — the single biggest gap in the live combat tracker.

This is the Mode B "snapshot derived baselines at encounter start, then track the
mutable runtime state" pattern (ROADMAP "two-mode split"), applied to consumables —
the same shape you already used for HP (snapshot `maxHp`, track `currentHp`/`tempHp`).

## Request — additive on the Combatant aggregate

### 1. Snapshot pools onto the combatant at encounter start

When a **character-linked** combatant is added (or at `start`), snapshot its current
resource maxima + spell-slot table onto the combatant, and track remaining:

```jsonc
// new on CombatantResponse (additive; empty arrays for freeform NPCs)
"resources": [
  { "resourceKey": "rage", "name": "Rage", "max": 3, "remaining": 2,
    "recharge": 2 /* ResourceRecharge: 1=ShortRest 2=LongRest */, "source": "Barbarian" }
],
"spellSlots": [
  { "level": 1, "max": 4, "remaining": 3 },
  { "level": 2, "max": 3, "remaining": 1 }
],
"pactSlots": { "level": 3, "max": 2, "remaining": 0 } | null   // Warlock only; null otherwise
```

- `resourceKey` (or a stable id) lets the client address a specific pool in the
  mutation below without name-matching. If a stable key is awkward, an index or a
  generated id is fine — we just need *something* stable per pool per combatant.
- Snapshot semantics match HP: a mid-fight character edit must **not** retroactively
  rewrite an in-progress encounter's pools (snapshot at add/start, like `maxHp`).
- Freeform NPCs (characterId null) have no pools → empty arrays / null. (If you later
  want NPC/monster resources e.g. Legendary/Recharge, that's a separate ask.)

### 2. Mutation endpoint(s) to spend / restore

```
PUT .../combatants/{id}/resources/{resourceKey}   { "remaining": 1 }     // set, clamped 0..max
PUT .../combatants/{id}/spell-slots/{level}        { "remaining": 2 }     // set, clamped 0..max
```
or a single `PATCH .../combatants/{id}/pools { resources?: [...], spellSlots?: [...] }`
— whichever fits your controller better. Either way:
- DM **or** the owner of the linked character may mutate (same authz as the HP/death-save
  endpoints — owner-or-DM, 404 otherwise).
- Returns the **full `EncounterResponse`** + broadcasts `EncounterUpdated`, exactly
  like every other combatant mutation (so it flows through our single `applyUpdate`).
- Clamp to `0..max`; reject unknown key/level with 400.

### 3. (Optional, nice-to-have) rest reset

A `POST .../combatants/{id}/rest { "kind": "short" | "long" }` that restores pools by
their `recharge` (short restores ShortRest pools + Warlock pact slots; long restores
everything + spell slots). If this is more than a small add, skip it — the DM can set
values manually via #2 and we'll add a "rest" button later.

## Frontend will

Render a compact resource/slot tracker on each combatant card in `EncounterView`
(pips or `remaining/max`), with +/− to spend/restore, flowing through `applyUpdate`
like HP. This pairs naturally with the buffs/duration work shipping now. No frontend
work starts until this lands — filing so you can build in parallel.

## Notes
- Enums numeric over the wire (consistent with the rest of the API).
- Purely additive — no existing shape changes; unknown fields are ignored until consumed.
