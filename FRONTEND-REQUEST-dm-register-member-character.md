# FRONTEND REQUEST — let the DM register an active member's character (CAMP-08)

**To:** the backend session (`C:\Users\keisi\source\repos\Personal\DMTool`)
**From:** the DMTool-FrontEnd session
**Date:** 2026-06-11
**Re:** E2E regression CAMP-08 (see `E2E-REGRESSION.md`, 2nd-user run) — the only FAIL
in the catalog. The DM's register-character flow is structurally broken: your own
endpoints disagree about who registers.

---

## The contradiction (both sides are your code)

- `GET {id}/member-characters` (`CampaignsController.cs:332`) — docstring: *"All
  non-retired characters owned by Active members of the campaign. **Used by DMs to
  populate the register-character dropdown.**"*
- `POST {id}/characters` (`AddCharacter`, `CampaignsController.cs:353-367`) — docstring:
  *"**Player registers one of their own** characters"* — and the implementation enforces
  it: the character is resolved via `_characters.GetByIdAsync(request.CharacterId,
  userId)` and a miss returns 400 `"Character not found or not owned by you."`

So the API hands the DM a dropdown of member characters that the POST then rejects,
one by one, with a 400. The frontend dutifully built that dropdown
(`CampaignDetail.tsx:582`, the "Member characters" optgroup) — it is dead on submit.

## Live repro (2026-06-11, IIS `:3501`)

Setup: `dungeonmaster` DMs campaign `E2E Camp`; `e2eplayer` is an **Active** member
(role=2, status=3) owning character `E2E Player Char`
(`7c784fa4-42e6-41be-b847-3b7d8a79404b`).

| Caller | `POST /api/campaigns/{id}/characters {characterId: <player's>}` | Result |
|---|---|---|
| DM | register member's char | **400** `CharacterId: "Character not found or not owned by you."` |
| Owner (member) | register own char | **204** |
| DM | `DELETE /characters/{id}` (after owner registered it) | **204** |

## Root cause — a chicken-and-egg in repository scoping

`CharacterRepository.GetByIdAsync` (`CharacterRepository.cs:60-80`) grants access to
the **owner OR the DM of any campaign that already contains the character** (the
`EXISTS (... CampaignCharacters cc JOIN Campaigns camp ... camp.CreatedBy = @UserId)`
branch). For *registration* the character is, by definition, **not yet in** the DM's
campaign — so the DM branch can never match at register time. That's why the DM can
REMOVE a registered character (it's in the campaign → branch matches) but can never
REGISTER one. The owner-scoped lookup is doing double duty as an authorization rule it
was never designed for.

(Checked and fine: `TransferDmAsync` rewrites `Campaigns.CreatedBy` itself
(`CampaignRepository.cs:115-123`), so the `camp.CreatedBy` DM-branch stays correct
after a CAMP-10 transfer — no second bug there.)

## What we're asking for

Allow **the campaign's DM** to register a character that is owned by an **Active
member** of that campaign. Suggested shape for `AddCharacter`:

1. Resolve the campaign (already done — `GetCampaignByIdAsync` line 358).
2. If caller is the **owner** → current path unchanged (`GetByIdAsync(charId, userId)`).
3. Else if caller is the **DM** (`campaign.CreatedBy == userId` — the documented DM
   identity, `Campaign.cs:4`) → validate the characterId against the same source the
   dropdown uses: `GetMemberCharactersAsync(id)` (exists, non-retired, owned by an
   Active member). A miss → the existing 400 message.
4. Anyone else → existing 400. Duplicate check (line 369) unchanged.

This makes the POST's accept-set exactly equal to the dropdown's offer-set — the two
docstrings stop contradicting each other.

## ⚠ Don't skip this: `AddedBy` is masquerading as the owner in the response

`GetCharacters` (`CampaignsController.cs:349-350`) maps
`new CampaignCharacterResponse(c.CharacterId, c.CharacterName, c.AddedBy, c.OwnerUsername)`
— **`AddedBy` is passed into the response's `ownerId` slot.** Today that's accidentally
correct because the owner is the only possible registrant. The moment a DM can register,
`AddedBy = DM` and the response would report the **DM as the owner** of a member's
character — which breaks real frontend logic:
- the Unregister button gate (`CampaignDetail.tsx:527`: `isDm || cc.ownerId === userId`),
- `EncounterView`'s owned-character filtering (`cc.ownerId` checks).

Fix together with the feature: have `GetCampaignCharactersAsync` return the **true
owner** (`Characters.CreatedBy`) for the response's `ownerId`/`ownerUsername` (the
member-characters query already joins this), keeping `AddedBy` as a separate audit
field if you want it. `GetMemberCharacters` (line 339-340) already maps true
`c.OwnerId` — make `GetCharacters` consistent with it.

## Acceptance criteria

1. DM `POST {id}/characters` with an **Active member's** non-retired character → **204**;
   it appears in `GET {id}/characters` with the **member** as `ownerId`/`ownerUsername`
   (not the DM).
2. Member registering their **own** character → **204** (unchanged).
3. DM registering their **own** character → **400** (unchanged — CAMP-08b; the
   member-characters set excludes the DM's own).
4. Registering a character owned by a non-member / Invited-only / Pending member →
   **400**. Duplicate registration → **400** (unchanged, ENC-13).
5. Owner-scoping of `GET /api/character/{id}` (the IDOR guard) is untouched — the new
   allowance lives in the campaign controller's validation, not in a loosened
   character-repo read scope.

## Frontend impact

**None to ship** — the DM dropdown already exists and starts working the moment this
lands. We'll flip CAMP-08 to PASS in `E2E-REGRESSION.md` and re-run:
DM-register → 204 → Unregister button visible to the owner (validates the
`ownerId` mapping fix).

## Notes

- Adjacent observation from the same run (separate decision, not blocking this):
  player-view visibility (`isHiddenFromPlayers`/`hpHiddenFromPlayers`) is filtered
  **client-side** — hidden combatants ride the member's encounter payload (network-tab
  leak). If you ever want server-side redaction for non-DM callers, say so and we'll
  spec it; fine as-is for a friendly table.
- Build/run reminder: IIS serves the built DLL — `dotnet build DMTool.slnx` + pool
  restart. (The pool also **stopped itself mid-run** today — 503 on `/api/health`,
  recovered by `Start-WebAppPool DMTool` — worth a glance at the event log if it
  recurs.)
