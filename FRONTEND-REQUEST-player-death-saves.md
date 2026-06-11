# FRONTEND-REQUEST — player-recorded death saves

**To:** the DMTool backend session (`C:\Users\lsazu\source\repos\DMTool`)
**From:** the DMTools-Frontend session
**Date:** 2026-06-11
**Re:** A downed player cannot record their own death saves — only the DM can.

## Problem

In the player encounter view (`PlayerEncounterView`), a dying PC (their own
linked combatant at 0 HP) sees the death-save track but it is read-only — tapping
the Saves/Fails pips does nothing. The only endpoint that records death saves is
`PATCH .../combatants/{combatantId}` (`EditCombatant`), which is **DM-only**
(`RequireDmAsync`, `EncountersController.cs:450`). Today's intended flow is "player
calls out the roll, DM records it." We want to let the player record their **own**
death saves directly.

We will **not** relax this client-side — the backend authorization is the gate, so
this needs a backend change first.

## Request — new endpoint (additive), owner-scoped

```
PUT /api/campaigns/{campaignId}/encounters/{encounterId}/combatants/{combatantId}/death-saves
Body: { "successes": number, "failures": number }   // each 0–3
→ 200 + EncounterResponse   (same shape as every other combatant mutation)
```

A dedicated endpoint (rather than opening `EditCombatant` to players) keeps the
field scope and authorization clean: players may touch **only** death saves, never
name / maxHp / AC / hidden flags / disposition.

### Authorization
- Allow if the caller is **either** the campaign DM **or** the campaign member who
  **owns the character linked to this combatant** (`combatant.CharacterId` →
  character owner == caller). 403 otherwise.
- 404 if the encounter/combatant isn't found in the campaign (owner-scoped, same as
  the other encounter routes).

### Validation / rules (backend is the gate)
- `successes` and `failures` each in **[0, 3]** (mirror the existing
  `[Range(0,3)]` on `EditCombatantRequest`).
- Only valid for a **linked** combatant (`CharacterId` not null) that is currently
  **dying** (`currentHp == 0`). Reject with 400 otherwise — a player shouldn't be
  recording saves for a healthy or unlinked combatant.
- Reuse the existing server-side terminal-state handling (3 successes ⇒ Stable,
  3 failures ⇒ Dead) — the client renders whatever the response says, it does not
  compute these.
- Whether to additionally require **Active** combat status is your call; the DM
  path doesn't enforce it today, so we left it out of the hard requirements.

### Live sync
- Broadcast `EncounterUpdated` to the encounter group (and the DM group) exactly
  like `EditCombatant` does, so the DM and other players see the update live.

### Design note (anti-cheat)
This lets a player freely set/walk-back their own pips. For a personal DM tool with
the DM present — and the DM retaining override via the existing DM `PATCH` — we
think that's acceptable. Flagging it in case you'd rather constrain it.

## Frontend will

Wire `onChange` on the player's **own** combatant death-save track
(`PlayerEncounterView.tsx:450`) to call this endpoint, for their own combatant only.
The compact per-row track in the turn order (`:320`) stays read-only. No client-side
rules — we send `{successes, failures}` and re-render the returned `EncounterResponse`.
