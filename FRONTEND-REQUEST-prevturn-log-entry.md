# FRONTEND-REQUEST — log entry for prev-turn (Undo Turn)

**To:** the DMTool backend session (`C:\Users\keisi\source\repos\Personal\DMTool`)
**From:** the DMTool-FrontEnd session
**Date:** 2026-06-12
**Re:** the DM's "Undo Turn" leaves no honest trace in the combat log.

## Problem

The DM's ↩ Undo Turn button calls `PUT .../encounters/{id}/prev-turn`. Today the log
either records nothing for the rewind, or records an entry indistinguishable from a
normal forward `TurnChanged` ("Round N: X's turn.") — so reading the log later, an
undone turn looks like the turn order simply visited X twice. The log should reflect
that the DM rewound.

## Request — a distinct rewind event (additive)

1. **New `CombatEventType` value** — `TurnRewound` (next free integer; enums stay
   numeric over the wire, we'll mirror the value in `types.ts`).
2. **`PrevTurn` writes one entry** with that type, e.g.:
   ```
   Round {n}: turn rewound to {combatant}.
   ```
   (If the rewind crosses a round boundary backwards, `roundNumber` on the entry should
   be the round it landed in — same convention as TurnChanged.)
3. If `PrevTurn` currently ALSO writes a forward-style `TurnChanged` entry, replace it
   with the rewind entry (one entry per rewind, not two).

## Frontend will

Mirror the new enum value and give it its own glyph in `EncounterLogPanel` (currently
event types map to icons; an unknown type falls back to the generic glyph, so nothing
breaks if we ship in either order). No other change — the panel renders `message` as-is.

## Notes
- Reminder from #18/dead-skip work: prev-turn skips dead combatants — the "rewound to X"
  name should be the actual landed-on combatant, post-skip.
- Small request; pairs with `FRONTEND-REQUEST-combat-log-grammar.md` (same file,
  `CombatLogMessages`) — sensible to do both in one pass.
