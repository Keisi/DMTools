# FRONTEND-REQUEST — Player decline own invitation

**To:** the DMTool backend session (`C:\Users\keisi\source\repos\DMTool`)
**From:** the DMTool-FrontEnd session
**Date:** 2026-06-11
**Re:** Invited players have no endpoint to decline a DM-sent invitation.

## Problem

When a DM invites a player, the player's membership row is set to status `Invited`.
The player needs to be able to decline (remove that row) without the DM's involvement.

Every endpoint tried by the frontend returns 404 for an invited (non-active) user:

| Endpoint | Result |
|---|---|
| `GET /campaigns/{id}` | 404 — access guard requires Active membership |
| `PUT .../members/{userId}/accept` | 404 — same access guard |
| `PUT .../members/{userId}/reject` | 404 — same access guard |
| `DELETE .../members/{userId}` | 404 — DM-only |

The only endpoint that works for a non-member is `POST /campaigns/{id}/join`
(which the frontend now uses for Accept). There is no equivalent for Decline.

## Request — player self-decline

Option A (preferred — minimal surface):
```
DELETE /api/campaigns/{id}/members/me
→ 204   // removes caller's own membership row (any status)
```
Caller-scoped (no userId in path), so no IDOR concern. Returns 404 if the caller
has no membership row for that campaign.

Option B (also acceptable):
Allow `DELETE /api/campaigns/{id}/members/{userId}` when `userId == caller's own id`,
regardless of the caller's membership status. DM-originated deletes already work;
this just relaxes the guard for self-removal.

Either shape is fine — the frontend will call whichever is implemented.
