# FRONTEND-REQUEST — encounters must belong to a session

**To:** the DMTool backend session (`C:\Users\keisi\source\repos\Personal\DMTool`)
**From:** the DMTool-FrontEnd session
**Date:** 2026-06-12
**Re:** Kevin's call (2026-06-12): "Encounters should be under session" — today
`sessionId` is optional and most encounters are created session-less.

## Problem

`CreateEncounterRequest.sessionId` is nullable and the create endpoint accepts null, so
the campaign screen offers "— no session —" and encounters float free of the
session/roster structure. Kevin wants the hierarchy enforced: Campaign → Session →
Encounter.

## Request

1. **Require `sessionId` on `POST /api/campaigns/{id}/encounters`** — null/missing →
   **400** problem-details on `sessionId`; must reference a session **in that campaign**
   (cross-campaign session id → 400). `EncounterResponse.sessionId` becomes effectively
   non-null for new rows (the TS type keeps `| null` until the orphan backfill below
   lands, then we tighten it).
2. **Existing orphans (migration):** for each campaign that has encounters with
   `SessionId IS NULL`, auto-create one session named **"General"** (date null) and
   assign those encounters to it. Idempotent like every migration. (Alternative if you
   prefer: leave orphans grandfathered and only enforce on create — but then the
   "encounters live under sessions" invariant is permanently leaky; we'd rather have
   the backfill.)
3. **Define session-delete semantics** (today unknown to us): deleting a session that
   still has encounters should be **blocked with a 400/409** ("move or delete its
   encounters first") rather than cascading or silently re-orphaning. If it currently
   cascades to encounter deletion, tell us — the frontend needs to warn accordingly.

## Frontend will (shipping ahead of you, no breakage)

- Make the session select **required** in the create-encounter form (drop the
  "— no session —" option); when the campaign has no sessions yet, point the DM at the
  Sessions panel (or quick-create one inline).
- Group the campaign's encounter list under session headings (`sessionId` is already on
  `EncounterSummaryResponse` — no new data needed).
- Surface your 400s through the existing `ApiError` path once enforcement lands.

## Notes
- Frontend gating ships first, so users never see the raw 400; your enforcement makes it
  an invariant instead of a convention.
