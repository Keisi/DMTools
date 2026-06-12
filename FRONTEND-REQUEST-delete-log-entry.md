> **SHIPPED 2026-06-12** — `DELETE …/log/{seq}` (204, DM-only, hard delete, 404-on-missing) +
> `CombatLogRemoved` broadcast (bare `number` seq) to the DM group. See
> `HANDOFF-TO-FRONTEND-delete-log-entry.md`. Frontend consumed: per-row ✕ + confirm modal,
> `campaigns.deleteLogEntry`, `useCombatLog.deleteEntry/removeEntry`, `onLogRemoved` hub handler.
> Live-verified (204). Contract matched the request exactly — no rework.

# FRONTEND-REQUEST — delete a single combat-log entry

**To:** the DMTool backend session (`C:\Users\lsazu\source\repos\DMTool`)
**From:** the DMTools-Frontend session
**Date:** 2026-06-11
**Re:** The DM can add combat-log entries but cannot remove one.

## Problem

The combat log (Phase 1, DM-only) exposes `GET .../log` and `POST .../log` (DM
note), but **no delete**. `ICombatRepository` has only `AppendLogAsync` /
`GetLogAsync`. A DM who fat-fingers a note — or wants to drop a noisy auto-event
line — has no way to remove it. We're adding a per-row ✕ + confirm popup in the
DM log panel and need a route to call.

We will **not** fake this client-side (hiding rows locally would resurrect on
reload / on other DM sessions) — it needs a real backend delete.

## Request — new endpoint (additive), DM-only

```
DELETE /api/campaigns/{campaignId}/encounters/{encounterId}/log/{seq}
→ 204 No Content   (or 200 with no body)
```

- **`seq`** is the entry's `bigint` IDENTITY (`CombatLogEntryResponse.seq`) — the
  value the frontend already keys rows on. (`id` GUID would work too; `seq` is
  just what we have in hand. Your call.)
- **Auth:** DM-only — gate on `RequireDmAsync` exactly like `GET`/`POST .../log`.
- **404** if the encounter isn't found in the campaign (owner-scoped, same as the
  other encounter routes) **or** no entry with that `seq` exists in this encounter.
- **Scope:** allow deleting **any** entry (auto-event or DM note). The DM owns the
  encounter; removing a factual line is their call. (If you'd rather restrict to
  `DmNote` entries, say so and we'll gate the ✕ to notes only — but we're assuming
  any entry for now.)
- **Live sync (nice-to-have, mirrors `CombatLogAppended`):** broadcast a
  lightweight **`CombatLogRemoved`** carrying just the deleted `seq` (a number) to
  the DM group `encounter-{id}-dm`, so a second DM session drops the row live. If
  you skip this, the deleting client still updates locally; others refresh on
  reload.

## Frontend will

Add a `campaigns.deleteLogEntry(cid, eid, seq)` call, a per-row ✕ with a
confirmation modal, remove the entry from local state on success, and (if you ship
the broadcast) drop it live via a new `onLogRemoved` hub handler. No client-side
rules — we send the `seq` and reflect the result.
