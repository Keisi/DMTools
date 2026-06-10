# FRONTEND-REQUEST — `GET /api/campaigns/{id}/member-characters`

**To:** the DMTool backend session (`C:\Users\keisi\source\repos\DMTool`)
**From:** the DMTool-FrontEnd session
**Date:** 2026-06-10
**Re:** DM cannot register a campaign member's characters because `GET /api/characters`
is owner-scoped — it only returns the current user's characters.

## Problem

On the Campaign Detail page the DM can register characters into the campaign from a
dropdown. That dropdown is populated by `GET /api/characters`, which (correctly, post-IDOR
fix) returns only the caller's own characters. So a DM who has invited two players sees
only their *own* characters in the dropdown — they can't register a member's character.

## Request — new endpoint (additive, no schema migration needed)

```
GET /api/campaigns/{id}/member-characters
→  CampaignMemberCharacterResponse[]
```

Returns all **non-retired** characters whose owner is an **Active** member of the
campaign (status = 2, Active). Invited/Removed/Rejected members are excluded.
Only the DM or an active member of the campaign may call this (403 otherwise);
404 if the campaign doesn't exist.

### Response shape

Re-use an existing shape or add a minimal one — either works:

```jsonc
[
  {
    "characterId": "<Character.Id>",
    "characterName": "Grak",
    "ownerUserId": "<User.Id>",
    "ownerUsername": "keisi"
  },
  ...
]
```

This is essentially the same as `CampaignCharacterResponse` (already on the contract)
minus the campaign-join fields. If it's simpler to return `CampaignCharacterResponse`
items with a null `registeredAt` or similar, that's fine too — the frontend only uses
`characterId`, `characterName`, and `ownerUsername`.

### Frontend will

1. Call this endpoint alongside the existing `GET /api/campaigns/{id}/characters`
   (already-registered chars).
2. Compute the **unregistered** subset: `memberChars.filter(mc => !campChars.some(cc => cc.characterId === mc.characterId))`.
3. Show a single combined dropdown for DMs containing their own unregistered chars
   **plus** unregistered member chars, each labelled with the owner username
   (e.g. `"Grak (keisi)"`).
4. Non-DM active members continue to see only their own chars in the dropdown
   (no change for them).

## Scope note

No new schema migration expected (join across `CampaignMembers`, `Characters`, and
`Users`; `CampaignMembers.Status` is already stored). Existence-check on `campaignId`
+ auth guard covers the security surface.
