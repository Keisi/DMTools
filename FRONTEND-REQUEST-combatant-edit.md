# FRONTEND-REQUEST — `PATCH /api/campaigns/{id}/encounters/{eid}/combatants/{cid}`

**To:** the DMTool backend session (`C:\Users\keisi\source\repos\DMTool`)
**From:** the DMTool-FrontEnd session
**Date:** 2026-06-10
**Re:** DM cannot correct a combatant's name, AC, or max HP after adding them.

## Problem

Combatants are created via `POST .../combatants` with `name`, `maxHp`, and
`armorClass`. There is currently no way to edit these fields after the fact — only
HP deltas/sets are available via `PUT .../combatants/{id}/hp`. A DM who miskeys a
goblin's AC or wants to adjust max HP mid-fight (e.g. legendary resistance, boss
with dynamic HP) has no recourse short of Remove + re-Add, which loses initiative
and current HP state.

## Request — new endpoint (additive)

```
PATCH /api/campaigns/{campaignId}/encounters/{encounterId}/combatants/{combatantId}
Body: { "name"?: string, "maxHp"?: number, "armorClass"?: number }
→ 200 + EncounterResponse   (same shape as all other combatant mutations)
```

- All three fields optional — send only what changed.
- `name`: trimmed, non-empty string.
- `maxHp`: integer ≥ 1. When maxHp decreases below `currentHp`, clamp
  `currentHp` down to the new `maxHp` (same as the existing HP-set logic).
- `armorClass`: integer ≥ 0.
- DM-only (403 for non-DM). Owner-scoped campaign + encounter check (404 if not
  found or not owned). Encounter status irrelevant — allow edits in Pending,
  Active, and Ended states.
- Returns the full `EncounterResponse` so the frontend can replace state in one
  round-trip (consistent with `addCombatant`, `removeCombatant`, `updateHp`).

## Frontend will

Add inline edit inputs for `name`, `maxHp`, and `armorClass` on enemy rows
(enemies only — allied characters pull these from their `CharacterResponse`).
The UI is already prepared; it just needs the endpoint to call.
