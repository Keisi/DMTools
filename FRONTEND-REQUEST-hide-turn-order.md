# FRONTEND-REQUEST — encounter-level "hide turn order from players" flag

**To:** the DMTool backend session (`C:\Users\keisi\source\repos\Personal\DMTool`)
**From:** the DMTool-FrontEnd session
**Date:** 2026-06-12
**Re:** the DM can hide individual combatants, but not the turn order itself.

## Problem

Per-combatant visibility exists (`isHiddenFromPlayers` / `hpHiddenFromPlayers` /
`acHiddenFromPlayers`), but there is no way for the DM to hide the **turn order as a
whole** from the player view — some DMs run theater-of-the-mind and don't want players
metagaming off the initiative list. `EncounterResponse` has no encounter-level
visibility field today.

## Request — one stored flag + a DM mutation (additive)

1. **`EncounterResponse.turnOrderHiddenFromPlayers: boolean`** (default `false`).
   Needs a column on `Encounters` (migration) — it's DM-managed stored state, same
   family as the per-combatant flags.
2. **Mutation** — your shape call; two options, slight preference for (a):
   - (a) a new generic `PATCH /api/campaigns/{cid}/encounters/{eid}`
     `{ turnOrderHiddenFromPlayers?: bool }` — extensible later to name/description
     edits, mirroring the combatant PATCH you built in #17;
   - (b) a dedicated `PUT .../encounters/{eid}/turn-order-visibility { hidden: bool }`.
   Either way: DM-only, any encounter status, returns the **full `EncounterResponse`**
   + broadcasts `EncounterUpdated` (the standard single-update path).
3. No server-side filtering needed — the player client already receives the full
   combatant list (with the per-combatant masks) and will simply not render the order.
   (If you'd rather also enforce it in a future player-scoped projection — your standing
   offer from the CAMP-08 reply — the flag is the input it would read.)

## Frontend will

- DM: a "Hide turn order" toggle in the encounter header (next to Edit/End Combat).
- Player: when the flag is set, the Turn Order tracker panel is not rendered.
  **Deliberate choice:** the "now acting / it's your turn" banner stays visible — the
  DM is hiding the *order*, not whose turn it is (players must still know when to act).
  Tell us if you think the flag should mean "hide everything turn-related" instead.

## Notes
- Blocked-on-you for the frontend toggle work; filed so it can land in the same batch as
  the two log requests.
