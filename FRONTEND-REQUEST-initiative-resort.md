# FRONTEND-REQUEST — Re-sort turn order when initiative changes during Active combat

**To:** the DMTool backend session (`C:\Users\keisi\source\repos\DMTool`)
**From:** the DMTool-FrontEnd session
**Date:** 2026-06-11
**Re:** Changing a combatant's initiative mid-combat does not affect the current turn sequence.

## Problem

`PUT .../combatants/{id}/initiative` updates the stored `initiative` value, but
`sortOrder` (which `nextTurn` uses to advance the active combatant) is set at
combat start and never updated afterwards. A DM who changes Goblin's initiative
from 11 → 14 during Keisi's turn (init 15) expects the next turn to go to Goblin
(14), but it goes to Test (13) because `sortOrder` is unchanged.

The frontend has no way to work around this — `sortOrder` and `activeCombatantId`
are entirely server-managed state.

## Request — update `sortOrder` on initiative change during Active encounter

When `setInitiative` (or any initiative-setting path) is called while encounter
status is `Active`:

1. Re-sort all combatants by `initiative DESC` (same tiebreak rules as
   `startEncounter`).
2. Assign new `sortOrder` values based on the sorted position.
3. Keep `activeCombatantId` pointing to the same combatant (i.e. it gets its
   new `sortOrder`, not a new turn pointer). The re-sort only affects **future**
   `nextTurn` calls — it does not skip or repeat the current turn.
4. Return the updated `EncounterResponse` as usual (all combatant mutations do).

## Scope

- Only during `Active` encounters. `Pending` initiative changes already determine
  the start order; `Ended` encounters are read-only.
- The DM's change is intentional — no confirmation needed on the frontend side.
- This aligns with the existing `Roll Initiatives` button behaviour, which already
  calls `setInitiative` for all combatants and expects the resulting order to be
  respected on `startEncounter`.
