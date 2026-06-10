# Scope B — Frontend Implementation Plan

Multi-user / real-time combat: **Campaigns → Membership → Encounters → live SignalR**,
plus two character-organizer additions (retire flag, copy-to-user). This is the frontend
build plan for the backend's Scope B verticals.

## Backend status

**Merged to backend `master`** (merge commit `82e65b2`, 2026-06-10) — was the `scope-b`
branch (`663684e` Phase 1 campaigns · `06f5396` Phase 2 encounters · `4866a26` Phase 3
SignalR · `8f929d1` DM transfer + character copy · `d8b154f` retire flag). DB through
migration 055. All endpoints are **additive** — existing `/api/character`, `/api/auth`,
etc. are unchanged.

Authoritative contract: `DMTool/docs/SCOPE-B-FRONTEND-HANDOVER.md` (exact JSON shapes,
enum integer values, suggested UI flows). Read it before touching `types.ts`.

## Why a multi-tier build

The dependency graph is almost linear (campaigns → membership → characters/sessions/
encounters → SignalR) and the **risk is concentrated in one place**: SignalR is the only
genuinely novel piece (WebSocket through the Vite proxy, JWT-in-query-string, group
re-join on reconnect). Everything else is "more of the existing REST + `useState`
pattern." So: dependency-ordered tiers, with the unknown isolated at the end.

**Key architectural insight (makes back-loading SignalR safe):** every encounter mutation
returns the **full `EncounterResponse`**, and SignalR pushes the *same shape*. The encounter
view therefore has exactly **one** state-update path — `setEncounter(response)`. Tier 3
wires that to REST mutation responses; Tier 4 adds SignalR as a *second caller* of the
identical `setEncounter`. Nothing is rewritten. Consequence: **a solo DM has a fully
working combat tool after Tier 3, with no real-time at all** — SignalR only adds liveness
for other observers, so if the WS plumbing is painful it blocks nothing shippable.

## Tiers

| Tier | Scope | Risk | Shippable alone? |
|------|-------|------|------------------|
| **0** | Character `retire` flag — Vault filter/hide retired; `isRetired` already on every `CharacterResponse` | trivial | Yes — zero campaign deps |
| **1** | Contract layer: `types.ts` + `endpoints.ts` for campaigns, encounters, character copy/retire | low | Substrate, not user-facing |
| **2** | Campaign UI: list, create, detail page, membership (invite/join/accept/reject/remove), DM transfer, register characters, sessions + rosters; new nav entry | low–med | Yes — campaign organizer |
| **3** | Encounter REST: create, add/remove combatants, initiative, start/next-turn/end, HP control (delta/setCurrent/setTemp) | medium | **Yes — full DM combat tool** |
| **4** | SignalR: `useEncounterHub` (connect/join/leave, `onreconnected` re-join), player watch view | **high (the unknown)** | Additive — upgrades Tier 3 to live |
| **5** | Character copy UI (owner + campaign-DM access path) | low | Small; can fold into Tier 2 |

Tier 0 and Tier 5 are decoupled enough to slot in anywhere or run in parallel with the spine.

**One deviation from pure dependency order:** do a ~30-min throwaway **SignalR connectivity
spike right after Tier 1** (one file: connect → `JoinEncounter` → log an `EncounterUpdated`)
to retire the proxy/WS/auth risk *before* committing to the full encounter UI. Tells us
whether `/hubs` needs `ws: true` in the Vite proxy or the hub builder should just point at
the absolute backend URL.

## Model strategy (build agent)

Planning is done; the remainder is execution against established codebase patterns.

| Work | Model |
|------|-------|
| Tiers 0–3, contract layer, campaign/encounter CRUD | **Sonnet** |
| **Tier 4 (SignalR hook + watch view)** — the one novel piece | **Opus** (flip back for this stretch) |

Build gate (`tsc -b` + eslint) is the safety net that makes Sonnet-built boilerplate safe
to trust. If delegating to sub-agents: partition by file (never two agents in `types.ts`/
`endpoints.ts` at once); keep SignalR on the strongest model; use `isolation: "worktree"`
for anything parallel.

## New endpoints to wire (summary — full shapes in the backend handover)

**Campaigns** (`/api/campaigns`): list · create · get · delete · **`PUT /{id}/dm`** (transfer
ownership to an Active member; old DM becomes Player) · members (list/invite/join/accept/
reject/remove) · characters (list/register/unregister) · sessions (list/create/delete) ·
roster add/remove.

**Encounters** (`/api/campaigns/{cid}/encounters`): list (summary) · get (full) · create ·
delete · start · next-turn · end · combatants add/remove · initiative · **hp** (`delta` /
`setCurrentHp` / `setTempHp`, independent fields). Every mutation returns full
`EncounterResponse`.

**Character additions** (existing `/api/character`):
- `PUT /{id}/retire` `{ isRetired }` → 200 `CharacterResponse`. `isRetired: boolean` is now
  on **every** `CharacterResponse` (list + single), defaults `false`. Add to `types.ts`.
- `POST /{id}/copy` `{ targetUsername }` → 200 `CharacterResponse` (new id, owned by target).
  Caller must own the character **or** be DM of a campaign containing it (first use of the
  DM-as-secondary-owner access path).

## Enum integer values (wire as numbers, per the no-string-converter rule)

- `CampaignMemberRole`: 1 DM · 2 Player
- `CampaignMemberStatus`: 1 Invited · 2 Requested · 3 Active · 4 Rejected · 5 Removed
- `MembershipInitiatedBy`: 1 DM · 2 Player
- `EncounterStatus`: 0 Pending · 1 Active · 2 Ended

Access: DM = `campaign.dmUserId === currentUserId`; member = a `/members` row with
`status: 3` (Active). GET = DM or Active member; mutations = DM only (except the membership
join/accept and own-character register actions).

## New dependency + proxy

- **`@microsoft/signalr`** (Tier 4) — official hub client. Hub URL `/hubs/encounter`; JWT
  via `?access_token=` query param (can't use a WS header). Server→client events:
  `EncounterUpdated(EncounterResponse)` and `EncounterArchived(id)`.
- **Dev proxy gap:** WebSockets don't traverse the current Vite HTTP proxy. Either add
  `/hubs` to the proxy with `ws: true`, or have the hub builder use the absolute backend
  URL. (Resolve in the Tier-1 spike.) Note `scope-b` frontend branch already pins
  `VITE_API_BASE` to `http://localhost:3501` and drops `host: true` — reconcile with this.

## Routes to add

```
/campaigns                       → list
/campaigns/:id                   → detail (DM + player, one component, conditional controls)
/campaigns/:id/encounters/:eid   → live encounter view
```

New "Campaigns" entry in `AppShell` nav. All guarded by `RequireAuth`.
