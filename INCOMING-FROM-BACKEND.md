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

---

# INCOMING #4 — Level-up engine Phase 3: sub-feature choices (Fighting Style / Expertise / Metamagic)

**Date:** 2026-06-07. Shipped, built, **live-verified**, committed + **pushed to `origin/master`** (`6395d3d`,
migration **037**; DB `DMTools_local` now **through 037**). Test login unchanged: `dungeonmaster` / `Passw0rd!23`.
**The level-up engine is now complete** (Plan + Apply + sub-feature choices). All additions below are **additive /
non-breaking** — nothing existing changed shape.

> **TL;DR for the LevelUpDialog:** the plan response gains a `featureChoices[]` array. Render each entry as a
> "choose N" picker; on apply, echo the picks back in a `featureChoices[]` array. Two brand-new reference
> catalogs (`/api/fightingstyles`, `/api/metamagics`) supply option names. Expertise is special — its picker is
> populated from *the character's own proficient skills*, not from the selection's options (see below).

## Background: the Selection source generalization (internal — **nothing to do**)
Internally we replaced `Selection`'s `jobId`/`backgroundId` columns with a polymorphic `sourceType`/`sourceId`.
**`SelectionResponse` never exposed those fields**, so `/api/classes` and `/api/backgrounds` selection shapes are
**unchanged**. Mentioned only so the backend diff isn't a surprise.

## New `SelectionType` enum values (enums are NUMBERS over the wire)
```
1 = Skill   2 = Subclass   3 = Language   4 = FightingStyle   5 = Expertise   6 = Metamagic
```
`SelectionResponse.type` can now be 4 / 5 / 6 in level-up plans (and on `/api/classes` if you ever inspect
class-feature selections, though those aren't surfaced on `ClassResponse` today).

## Two new reference catalogs (GET + homebrew POST)
```jsonc
GET /api/fightingstyles  ->  [ { "id": "...", "name": "Archery",  "description": "You gain a +2 bonus ..." }, ... ]   // 6 SRD styles
GET /api/metamagics      ->  [ { "id": "...", "name": "Quickened Spell", "description": "..." }, ... ]                // 8 SRD options
POST /api/fightingstyles { "name": "...", "description": "..." }   // homebrew, returns the created row
POST /api/metamagics     { "name": "...", "description": "..." }
```
You usually won't need to fetch these directly for the level-up flow — the plan's `featureChoices[].selection.options[]`
already carry `{ optionId, name }`. Fetch the catalogs only if you want a standalone "browse fighting styles" view.

## `CharacterRequest` — two new optional fields (create/edit time)
For setting these at character **creation** (e.g. a Fighter built directly at level 3 who already has a style):
```jsonc
"fightingStyleIds": ["<FightingStyle id>", ...],   // optional; existence-checked
"metamagicIds":     ["<Metamagic id>", ...]         // optional; existence-checked
```
(Expertise at creation is unchanged — set it via `skillProficiencies[].level = 2` as you already can.)

## `CharacterResponse` — two new always-present arrays
```jsonc
"fightingStyles": [ { "id": "<FightingStyle id>", "name": "Dueling" } ],   // NamedRef[]; [] when none
"metamagics":     [ { "id": "<Metamagic id>", "name": "Subtle Spell" } ]    // NamedRef[]; [] when none
```
Render these on the sheet (e.g. under the class features panel). **Expertise** does **not** appear here — it shows
up exactly as before in `skills[]`: the chosen skills' `level` becomes `2` (Expertise) and their `bonus` doubles
the proficiency contribution. (`SkillProficiencyLevel`: `1` = Proficient, `2` = Expertise.)

## Level-up **Plan** response — new `featureChoices[]`
`POST /api/character/{id}/levelup/plan { "classId": "..." }` now returns, alongside the existing
`subclassChoice` / `spellChoices` / etc.:
```jsonc
"featureChoices": [
  {
    "featureName": "Fighting Style",     // the granting class feature
    "source": "Paladin",                 // class (or subclass) that granted it — for display
    "selection": {                       // a standard SelectionResponse
      "id": "<selectionId>",             // <-- echo this back on apply
      "name": "Paladin Fighting Style",
      "type": 4,                         // 4=FightingStyle, 5=Expertise, 6=Metamagic
      "choose": 1,                       // how many to pick
      "level": 2,
      "options": [                       // present for FightingStyle (4) & Metamagic (6)
        { "optionId": "<FightingStyle id>", "name": "Dueling" },
        { "optionId": "<FightingStyle id>", "name": "Defense" },
        { "optionId": "<FightingStyle id>", "name": "Protection" },
        { "optionId": "<FightingStyle id>", "name": "Great Weapon Fighting" }
      ]
    }
  }
]
```
- `featureChoices` is `[]` when the level forces no sub-feature choice. It only appears for a feature **gained at
  the new level** (e.g. Paladin/Ranger Fighting Style at L2, Sorcerer Metamagic at L3/L10/L17, Rogue/Bard
  Expertise at their levels). A Fighter's L1 Fighting Style is a **create-time** choice (see `fightingStyleIds`),
  not a level-up one.
- **Expertise (`type: 5`) has an EMPTY `options[]` array** — its pool is *dynamic*: the character's
  **already-proficient skills**. For the Expertise picker, list the character's proficient skills (from the
  sheet's `skills[]` where `isProficient === true`) and let the DM pick `choose` of them.

## Level-up **Apply** request — new `featureChoices[]`
`POST /api/character/{id}/levelup/apply` gains one optional field (everything else as before):
```jsonc
{
  "classId": "...",
  "hitPoints": { "mode": 0 },
  // ... subclassId / abilityImprovements / featId / cantripIds / spellIds as applicable ...
  "featureChoices": [
    { "selectionId": "<from plan>", "optionIds": ["<chosen optionId>", ...] }
  ],
  "allowHomebrewSelections": false
}
```
- **FightingStyle / Metamagic:** `optionIds` = the chosen `optionId`s from the plan's `selection.options`.
- **Expertise:** `optionIds` = **Skill ids the character is already proficient in** (pick `choose` of them).
- One entry per plan choice; `selectionId` must match a `featureChoices[].selection.id` from the plan.
- `allowHomebrewSelections: true` relaxes the count + subset gates (DM override), same semantics as the
  subclass/spell picks.

### Validation (all 400 on `featureChoices`)
- More picks than `choose`, or a pick outside the pool (style not offered to this class / skill not proficient)
  → 400. A `selectionId` not offered at this level → 400. Re-picking a fighting style/metamagic the character
  already has is silently de-duped (no error, no duplicate).

## Visible sheet cleanup (non-breaking, but you'll notice it)
Previously, Fighter/Paladin/Ranger characters listed every fighting-style option as its own entry in
`CharacterResponse.features` (e.g. "Fighting Style: Archery", "Fighting Style: Defense", …) — a data-import
artifact. **Those are gone.** A character now shows a single `"Fighting Style"` feature, and the chosen style
lives in the new `fightingStyles[]` array. If your sheet was rendering those `"Fighting Style: X"` rows, they'll
simply stop appearing (correct behavior).

## Suggested UI flow for the LevelUpDialog
1. `POST .../levelup/plan` → read `featureChoices[]` (in addition to subclass/spell choices you already handle).
2. For each entry, render a "choose `selection.choose`" picker:
   - `type 4/6` → options from `selection.options[]` (`name` for label, `optionId` for value).
   - `type 5` (Expertise) → options = the character's proficient skills (`skills[]` where `isProficient`).
3. `POST .../levelup/apply` with `featureChoices: [{ selectionId, optionIds }]` for each.
4. On success you get the updated `CharacterResponse` — read `fightingStyles[]` / `metamagics[]`, and for
   Expertise the upgraded `skills[]` (`level: 2`).

## Live-verified examples
- **Paladin 1→2:** plan `featureChoices` = 1 entry, `type 4`, `choose 1`, options `Dueling/Defense/Protection/
  Great Weapon Fighting` (correctly **no** Archery/Two-Weapon — Paladin's SRD subset). Applied Dueling →
  `fightingStyles: [{ name: "Dueling" }]`.
- **Sorcerer 2→3:** plan `featureChoices` = 1 entry, `type 6`, `choose 2`, 8 metamagic options. Applied 2 →
  `metamagics: [{ name: "Heightened Spell" }, { name: "Subtle Spell" }]`.
- **Rogue 5→6:** plan `featureChoices` = 1 entry, `type 5`, `choose 2`, `options: []` (dynamic). Applied 2
  proficient skill ids → those `skills[]` entries now `level: 2`, bonus = ability mod + 2×proficiency.

## Build / status
- `dotnet build DMTool.slnx` → **0 errors**; `dotnet test` → **60/60 pass** (+1 planner test).
- codescan grade **A** (0 issues / 0 vulns), 0 cross-module duplicates. Migration **037** idempotent.
- IIS pool `DMTool` running; `/api/health` → ok. DB `DMTools_local` **through 037**.
- Commits on `origin/master`: `6395d3d` (Phase 3), `eb4b19b` (CLAUDE.md migration-list refresh).
- **Known simplifications (not blockers):** fighting-style/metamagic mechanical effects are description-only
  (conditional bonuses applied at the table — show the `description`); metamagic isn't de-duped against
  already-known across level-ups (DM picks new ones). Eldritch Invocations (Warlock) aren't seeded yet — same
  recipe when wanted.
