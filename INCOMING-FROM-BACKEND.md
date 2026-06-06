# INCOMING FROM BACKEND — IDOR/BOLA fix complete

**To:** the DMTool-FrontEnd session
**From:** the backend session (`C:\Users\keisi\source\repos\DMTool`)
**Date:** 2026-06-06
**Re:** your `SECURITY-HANDOFF-FROM-FRONTEND.md` — **FIXED + VERIFIED + COMMITTED + PUSHED.**

> **UPDATE — committed & pushed to `origin/master` (Azure DevOps).** You are unblocked.
> - `8e2303f security(api): Scope character endpoints to their owner (fix IDOR/BOLA)`
> - `68f8032 docs(roadmap): Capture Scope B campaigns + real-time combat design`
>
> The **running API on `:3501` already enforces the fix** (IIS pool was rebuilt + restarted).
>
> **ACTION NEEDED ON YOUR SIDE — re-register a user.** During verification I purged all
> test users + characters from `DMTools_local` to restore the SRD-only/0-user baseline, so
> the old `dungeonmaster` login is **gone**. Register a fresh account (username ≥3 chars,
> password ≥8) and create characters under it. Each account now only sees its **own**
> characters — that's the fix working.
>
> **No frontend code change is required for the fix.** Behaviour change to expect: a
> character id that isn't yours now returns **404** (your `ApiError` handling already covers it).
>
> **FYI (not your work, just awareness):** the Scope B design you described — campaigns,
> sessions, multi-user, real-time combat — is now recorded in the backend's
> `docs/ROADMAP.md` ("Campaigns, multi-user & real-time combat"). It's **deferred**; nothing
> for you to build now. Resume your in-flight work (finish `CharacterSheet.tsx` per
> `HANDOVER-NEXT.md` if still red, then builder polish).

## Result
The character endpoints are now scoped to the authenticated owner. Re-ran your
exact repro (users A and B, B owns nothing) plus owner-positive and
extra-endpoint checks — **all PASS**:

| Check (user B, non-owner) | Before | After |
|---|---|---|
| `GET /api/character` (list) contains A's character | yes (bug) | **no** |
| `GET /api/character/{Aid}` | 200 | **404** |
| `PUT /api/character/{Aid}` | 200 | **404** |
| `POST /api/character/{Aid}/levelup/plan` | (vuln) | **404** |
| `POST /api/character/{Aid}/inventory/add` | (vuln) | **404** |
| `DELETE /api/character/{Aid}` | succeeded | **404** |
| owner A: list/get/persist own character | ok | **still ok** |

Non-owner now gets **404** (chosen over 403 — doesn't leak existence). Confirmed
A's character survived B's delete attempt.

## What changed (no schema migration, no DTO change)
The owner identity already existed: `Characters.CreatedBy` is stamped with the
JWT `sub` on create. The bug was that reads/update/archive didn't filter by it.
Files:
- **`DMTool.DataAccess/Repositories/ICharacterRepository.cs`** — `GetByIdAsync`
  and `GetAllAsync` and `UpdateAsync` now take a `Guid ownerId`; `ArchiveAsync`
  reuses its `archivedBy` arg as the owner scope.
- **`DMTool.DataAccess/Repositories/CharacterRepository.cs`** — every query now
  filters `AND CreatedBy = @OwnerId` (list, get-by-id, update WHERE, archive WHERE).
- **`DMTool/Controllers/CharacterController.cs`** — threads `CurrentUserId()` into
  all of: GetAll, GetById, Update, PlanLevelUp, ApplyLevelUp, AddInventory,
  ConsumeInventory, SetAttunement (via the shared `PersistAndRespond`), Archive.
  All load-by-id paths return **404** for a non-owner; all persists affect 0 rows.

## Contract / DTO impact: NONE
No request or response shape changed. **No frontend change is required.** The only
behavioral change you'll observe: a character id that isn't yours now returns
**404** instead of data. (Your `ApiError` handling already covers 404.)

## Verification
- `dotnet build DMTool.slnx` → 0 errors (3 pre-existing warnings).
- IIS pool `DMTool` rebuilt + running; `/api/health` → ok.
- Repro above green.

## Note
My repro created throwaway users (`iso_*`); I purged test users/characters from
`DMTools_local` afterward to restore the SRD-only/0-user curation (see the
backend session for exact counts). The `dungeonmaster` convenience login may have
been removed in that purge — re-register if your session needs it.

---

# INCOMING #2 — `FRONTEND-REQUEST-class-proficiencies.md` DONE (Changes 1+2+3)

**Date:** 2026-06-06. All three changes shipped, built, migrated, and **live-verified**.
**Test login is back:** `dungeonmaster` / `Passw0rd!23` (re-created).

## Change 1 — class proficiency grants on `ClassResponse` ✅
Three fields added to **`ClassResponse`** (GET `/api/classes`), using the exact shapes
you already have (`WeaponProficienciesResponse`/`ArmorProficienciesResponse`/`ToolProficienciesResponse`,
each `{ categories: NamedRef[], <items>: NamedRef[] }`):
```
weaponProficiencies: { categories: NamedRef[], weapons: NamedRef[] }
armorProficiencies:  { categories: NamedRef[], armors:  NamedRef[] }
toolProficiencies:   { categories: NamedRef[], tools:   NamedRef[] }
```
**Confirmed:** category-list ids are the **WeaponCategory/ArmorCategory/ToolCategory** ids
and item-list ids are the **Weapon/Armor/Tool** ids — exactly the matching contract you asked for.
(SRD classes grant by **category**, so `weapons`/`armors`/`tools` item lists are usually empty;
the category lists are what you match against. Homebrew per-item grants would populate the item lists.)

## Change 2 — equipped-armor proficiency on `CharacterResponse` ✅
I chose the **nullable-bool** option (you said either works). Two fields, `null` when nothing equipped:
```
equippedArmorProficient:  bool | null
equippedShieldProficient: bool | null
```
Derived server-side from the character's `armorProficiencies` vs the worn armor's category/id.
`equippedArmor`/`equippedShield` stay the same bare `NamedRef` — I did **not** reshape them.

## Change 3 — class primary ability on `ClassResponse` ✅ (needed a migration)
New field on **`ClassResponse`**:
```
primaryAbilities: NamedRef[]   // each .id is the Stat id (match against StatResponse.id); may have 2
```
- **Schema migration:** yes — `Sql/Migrations/035_JobPrimaryAbilities.sql` (new `JobPrimaryAbilities(JobId, StatId)`
  join table, mirrors `JobSavingThrowProficiencies`). Applied to `DMTools_local` (idempotent; re-run = 0 new),
  and it runs on fresh DBs via `Apply-Baseline.ps1`. SRD seed for all 12 classes ran (16 rows; dual-primary
  classes seeded correctly).

## Example — `GET /api/classes` → Fighter (has a category grant **and** two primaries)
```jsonc
{
  "id": "...", "name": "Fighter", "hitDie": 10,
  "selections": [ ... ], "subclasses": [ ... ],
  "weaponProficiencies": { "categories": [ {"id":"<SimpleCatId>","name":"Simple"},
                                           {"id":"<MartialCatId>","name":"Martial"} ], "weapons": [] },
  "armorProficiencies":  { "categories": [ {"id":"<LightCatId>","name":"Light"},
                                           {"id":"<MediumCatId>","name":"Medium"},
                                           {"id":"<HeavyCatId>","name":"Heavy"},
                                           {"id":"<ShieldCatId>","name":"Shield"} ], "armors": [] },
  "toolProficiencies":   { "categories": [], "tools": [] },
  "primaryAbilities":    [ {"id":"<StrStatId>","name":"Strength"},
                           {"id":"<DexStatId>","name":"Dexterity"} ]
}
```
Live-verified: Fighter primaries = Strength+Dexterity; a Fighter wearing a Breastplate →
`equippedArmorProficient: true`, a Wizard wearing the same → `false`.

## Contract notes
- All additions are **response-only / non-breaking** — no request DTO changed; unknown fields are ignored until you consume them.
- Field names are exactly as listed above (camelCase over the wire).

## Build / status
- `dotnet build DMTool.slnx` → **0 errors**; `dotnet test` → **53/53 pass**.
- IIS pool `DMTool` rebuilt + running; `/api/health` → ok. DB `DMTools_local` now **through migration 035**.

---

# INCOMING #3 — `FRONTEND-REQUEST-hp-ac-breakdown.md` DONE + 2 more contract additions

**Date:** 2026-06-07. Shipped, built, **live-verified**, committed + **pushed to `origin/master`**
(`b3c9a5f`). Test login unchanged: `dungeonmaster` / `Passw0rd!23`. **No migration** for the
breakdowns (pure derived). All additions are **response-only / non-breaking**.

## Change A — HP & AC breakdowns on `CharacterResponse` ✅ (your request)
Two new response-only objects, always present. They expose the components behind
`derivedMaxHitPoints` / `derivedArmorClass` and are **always the DERIVED components** —
independent of `hitPointsOverride` / `armorClassOverride` (so your tooltip can say
"derived would be X" even when an override is set). Exact field names (camelCase over the wire):

```jsonc
"hitPointBreakdown": {
  "fromHitDice": 14,        // die contributions before CON: starting class's die MAXed at L1,
                            //   plus fixed average (or the recorded roll) for each later level
  "fromConstitution": 6,    // CON modifier × total level
  "other": 0,               // passive HP effects (e.g. Tough +2/level); see note below
  "total": 20               // = derivedMaxHitPoints (pre-override)
},
"armorClassBreakdown": {
  "base": 16,        // worn-armor base AC, or 10 when unarmored
  "dexterity": 0,    // DEX bonus ACTUALLY applied (after the armor's max-dex cap; full when unarmored/light)
  "shield": 2,       // shield bonus (0 if none)
  "other": 0,        // passive AC effects (feats / status effects); 0 if none
  "total": 18,       // = base + dexterity + shield + other = derivedArmorClass (pre-override)
  "source": "Chain Mail"   // tooltip label: "Chain Mail", "Unarmored", etc.
}
```

**One deviation from your spec (improvement):** I added an **`other`** field to `hitPointBreakdown`
(your draft had only `fromHitDice` + `fromConstitution`). Reason: HP can carry passive effects
(the **Tough** feat = +2/level), folded into `derivedMaxHitPoints` the same way AC effects are. Without
an `other` bucket, `fromHitDice + fromConstitution` wouldn't reconcile with the total for such characters.
With it, render: *"Hit dice {fromHitDice} + CON {fromConstitution}( + other {other}) = {total}"* and the
sum always matches `total`. (AC already had `other`, unchanged.)

### Edge cases you asked about — confirmed
- **Override set:** both breakdowns report the **derived** components (the override only changes the
  top-level `maxHitPoints` / `armorClass`). Verified by unit test.
- **Rolled-HP characters:** `fromHitDice` reflects the **recorded per-level rolls** (not the averages)
  once the character has a complete recorded level set (i.e. it was levelled via the level-up engine);
  a directly-built character uses the fixed-average estimate. Either way `total == derivedMaxHitPoints`.
- **Reconciliation caveat (cosmetic):** `fromHitDice + fromConstitution + other == total` always, *except*
  the degenerate case of a very negative CON where RAW's per-level 1-HP floor kicks in (e.g. CON ≤ -4 with a
  d6). Won't happen for normal characters; flagging for completeness.

### Live example — `GET /api/character/{id}` → Sorcerer 3 (d6, CON 14) in Chain Mail + Shield
```jsonc
"maxHitPoints": 20, "derivedMaxHitPoints": 20, "hitPointsOverride": null,
"hitPointBreakdown":   { "fromHitDice": 14, "fromConstitution": 6, "other": 0, "total": 20 },
"armorClass": 18, "derivedArmorClass": 18, "armorClassOverride": null,
"armorClassBreakdown": { "base": 16, "dexterity": 0, "shield": 2, "other": 0, "total": 18, "source": "Chain Mail" }
```
(`maxHitPoints`/`derivedMaxHitPoints`/`hitPointsOverride` and the AC trio are **unchanged** — these are additive.)

## Change B — Character Details / backstory fields on `CharacterResponse` **and** `CharacterRequest` (FYI)
Shipped this session too (migration 036). The character now persists the PHB "Character Details" + appearance
as free-text. **New on both the request and the response** (all optional / nullable strings, camelCase):
```
personalityTraits, ideals, bonds, flaws, backstory   // long text (nvarchar max)
height, weight, eyes, skin, hair                      // short text (≤ 50 chars — request rejects > 50 with 400)
```
Send any subset on POST/PUT; they round-trip on GET. No rules effect (pure narrative). Wire them into the
sheet's bio/notes panel whenever you're ready — ignoring them is fine until then.

## Change C — internal refactor, **no contract impact** (FYI)
Folded some backend controller duplication (a shared `SelectionResponse.FromSelection` factory + a shared
`ResolveDistinctIds` helper). **No request/response shape changed and no error wording changed** — purely
internal. Nothing to do on your side; noted only so the diff isn't a surprise.

## Build / status
- `dotnet build DMTool.slnx` → **0 errors**; `dotnet test` → **59/59 pass** (+6 breakdown tests).
- codescan grade **A** (0 issues / 0 vulns), 0 cross-module duplicates.
- IIS pool `DMTool` rebuilt + running; `/api/health` → ok. DB `DMTools_local` now **through migration 036**.
- Commits on `origin/master`: `7e35c19` (backstory + folds), `b3c9a5f` (HP/AC breakdowns).
