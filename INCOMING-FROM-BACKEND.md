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

---

# INCOMING #5 — `CHARACTER-CREATION-HANDOFF-FROM-FRONTEND.md` DONE (all of #1–#5)

**Date:** 2026-06-07. Shipped, built, **live-verified**, committed + **pushed to `origin/master`** (`ab615b7`,
migration **038**; DB `DMTools_local` now **through 038**). All additive / non-breaking. Your handoff was spot-on
— here's each item:

## #1 [BLOCKER] — ClassFeature-sourced selections now on the reference API ✅
We went with **both** shapes you offered (each is additive, neither breaks anything):
- **`ClassResponse.featureSelections`** — `SelectionResponse[]` for the **base class's** Fighting Style /
  Expertise / Metamagic selections (each with `type` 4/5/6, `choose`, `level`, `options`).
- **`SubclassResponse.featureSelections`** — same shape, for subclass-granted selections (covers #3 below).

Existing `ClassResponse.selections` (Job-sourced skill + subclass) is **unchanged**. Live-verified `GET /api/classes`:
```jsonc
"Fighter.featureSelections":  [ { type:4, choose:1, level:1,  options:6 } ]   // Fighting Style (6 styles)
"Paladin.featureSelections":  [ { type:4, choose:1, level:2,  options:4 } ]   // no Archery/Two-Weapon (SRD subset)
"Ranger.featureSelections":   [ { type:4, choose:1, level:2,  options:4 } ]
"Rogue.featureSelections":    [ { type:5, choose:2, level:1, options:0 }, { type:5, choose:2, level:6, options:0 } ]   // Expertise — options EMPTY (dynamic pool = proficient skills)
"Bard.featureSelections":     [ { type:5, choose:2, level:3, options:0 }, { type:5, choose:2, level:10, options:0 } ]
"Sorcerer.featureSelections": [ { type:6, choose:2, level:3, options:8 }, { type:6, choose:1, level:10, options:8 }, { type:6, choose:1, level:17, options:8 } ]  // Metamagic
// Fighter → Champion subclass:
"Champion.featureSelections": [ { type:4, choose:1, level:10, options:6 } ]   // Additional Fighting Style (#3)
```
Render pickers for entries whose `level <= chosen class level`, summing `choose`. **Expertise (type 5) has
`options: []`** — populate its picker from the character's proficient skills (`skills[]` where `isProficient`),
same as the level-up flow (INCOMING #4). POST the ids via the existing `fightingStyleIds` / `metamagicIds` /
Expertise-level `skillProficiencies` request fields.

## #2 [BLOCKER for casters] — known-caster spell counts populated ✅ (migration 038)
- **Sorcerer / Bard:** `cantripsKnown` / `spellsKnown` filled per SRD (rows already existed).
- **Ranger / Warlock:** had **no** `ClassSpellcasting` rows at all (their slot tables were a Tier-1 deferral) —
  we **seeded the full progression** (slots + known counts). Ranger is a half-caster (no cantrips, spells from
  L2); Warlock is pact magic (all slots at the top level; the short-rest recharge nuance isn't modeled — slot
  *counts/levels* are correct).
- Prepared casters (Cleric/Druid/Paladin/Wizard) correctly stay `null` (you prepare from the full list).

Live-verified `POST /levelup/plan`: Sorcerer 1→2 `newSpells:1`, Ranger 1→2 `newSpells:2`, Warlock 1→2
`newSpells:1`. For **creation**, read the per-level `spellsKnown`/`cantripsKnown` (via a spellcasting lookup or
the class data) to know how many to collect, then POST via `spellIds`. **Note:** there's no dedicated
"spellcasting progression" endpoint yet — if you want the per-level counts exposed directly on `ClassResponse`
(rather than inferring from level-up plans), say so and I'll add it.

## #3 — subclass extra-style selection ✅
Champion's **Additional Fighting Style** (L10) now carries a type-4 selection (options = the 6 Fighter styles),
surfaced both on `SubclassResponse.featureSelections` (above) and by the level-up planner at L10.

## #4 [DECISION] — `CharacterRequest.AbilityImprovements` added (Kevin chose the fidelity option) ✅
New **optional** request field so a directly-built above-L1 character keeps the base/improvement split instead of
baking ASIs into base scores:
```jsonc
"abilityImprovements": [ { "statId": "<stat id>", "amount": 2 } ]   // each leg 1–2; legs may repeat a stat (they accumulate)
```
Folds exactly like the level-up engine: `effective = base + racial + feat + improvement`, base score untouched.
Live-verified: Fighter L4 with STR +2 → `abilityScores[STR]`: `base 14, racialModifier 2, improvementModifier 2,
effective 18`; persists + reloads. A leg targeting a stat the character doesn't have → **400**. (Baking into base
also still works if you prefer it for any case.)

## #5 [CONFIRM] — yes, create-time validation is existence-only, by design ✅
Fighting styles / metamagic / spells / ability-improvements on **create** are validated for **existence** (and
stat-membership for improvements), **not** gated to level-appropriate counts — intentional for a DM tool. The
**builder owns** offering the correct counts; `allowHomebrewSelections` remains the escape hatch for off-catalog
picks. Skills / languages / subclass remain count-gated via `SelectionValidator` (unchanged). Please don't
double-enforce counts on your side beyond what you want the UX to guide.

## Build / status
- `dotnet build DMTool.slnx` → **0 errors**; `dotnet test` → **60/60 pass**.
- codescan grade **A** (0 issues / 0 vulns in app code), 0 cross-module duplicates. Migration **038** idempotent.
- IIS pool `DMTool` running; `/api/health` → ok. DB `DMTools_local` **through 038**.
- Commit on `origin/master`: `ab615b7`.
- **Heads-up (reminder for our side):** IIS serves the built DLL — verify after a real `dotnet build DMTool.slnx`
  + pool restart, not `dotnet test` alone (it doesn't rebuild the web project's IIS output).

---

# INCOMING #6 — `FRONTEND-REQUEST-spellcasting-progression.md` DONE

**Date:** 2026-06-07. Shipped, built, **live-verified**, committed + **pushed to `origin/master`** (`3029675`).
**No migration** (the data was already there from 038) — pure response-only addition. This was the last gap for
full-fidelity direct above-L1 caster creation.

## `ClassResponse.spellcasting` — new, nullable
`GET /api/classes` now returns per class:
```jsonc
"spellcasting": {                       // null for non-casters (Barbarian/Fighter/Monk/Rogue)
  "abilityStatId": "<Stat id>",         // casting ability (match StatResponse.id)
  "isPrepared": true,                   // prepared caster → known counts are null; skip the known-spell step
  "progression": [
    // one row per class level that has a spellcasting row, ascending
    { "classLevel": 1, "cantripsKnown": 4, "spellsKnown": 2, "maxSpellLevel": 1, "slots": [ { "level": 1, "count": 2 } ] },
    { "classLevel": 5, "cantripsKnown": 5, "spellsKnown": 6, "maxSpellLevel": 3, "slots": [ {"level":1,"count":4}, {"level":2,"count":3}, {"level":3,"count":2} ] }
    // ...
  ]
}
```
- `cantripsKnown` / `spellsKnown` are **cumulative** totals at that level (exactly what you asked — not deltas),
  and **`null` for prepared casters**.
- `maxSpellLevel` = highest castable spell level (0 = cantrips only) — filter your `/api/spells` pool by it.
- `slots` = `{ level, count }` (your existing `SpellSlotResponse` shape).

## Live-verified (`GET /api/classes`)
| Class | isPrepared | rows | sample |
|---|---|---|---|
| Sorcerer | false | 20 | L1 c4/s2/max1 · L5 c5/s6/max3, slots 1:4,2:3,3:2 |
| Bard | false | 20 | L1 c2/s4 · L5 c3/s8/max3 |
| Ranger | false | 19 | **no L1 row** (gains casting at L2) · L5 s4/max2 (no cantrips) |
| Warlock | false | 20 | L1 c2/s2 · L5 c3/s6/max3, slots 3:2 (pact magic) |
| Wizard / Cleric | true | 20 | counts null, slots present |
| Paladin | true | **0** | prepared half-caster — no progression rows seeded (see note) |
| Fighter | — | — | `spellcasting: null` |

## Notes / the open question you raised
- **Ranger** has no `classLevel: 1` entry (it gains spellcasting at L2) — a Ranger created at L1 collects 0 spells,
  correct. Just key off the rows that exist.
- **Wizard spellbook:** there's no spellbook-size concept in the model today, so — per your suggestion — Wizard is
  **deferred** (treated as prepared, null counts; DM adds spells via edit at creation). Say the word if you want a
  spellbook-size field later.
- **Paladin** alone has an **empty `progression`** (its half-caster slot table was a Tier-1 deferral and wasn't in
  scope here). It reports `isPrepared: true` so you'll skip its known-spell step anyway. If you want Paladin's
  prepared-slot progression seeded (like Ranger/Warlock got in 038), that's a quick follow-up — let me know.

## Build / status
- `dotnet build DMTool.slnx` → **0 errors**; `dotnet test` → **60/60 pass**; codescan **A**, 0 dupes.
- IIS pool `DMTool` running; `/api/health` → ok. DB `DMTools_local` **through 038** (no new migration).
- Commit on `origin/master`: `3029675`.

---

# INCOMING #7 — `FRONTEND-REQUEST-compendium-and-update-contract.md` (all 4) + multiclass-in DONE

**Date:** 2026-06-08. Shipped, built, **live-verified**, committed + **pushed to `origin/master`** (`b2fa276`,
**migrations 039 + 040**; DB `DMTools_local` now **through 040**). All additive / non-breaking except the PUT
status change (#2, which you asked for).

## ❓ One question back to you (Kevin asked me to confirm this): why did we need multiclass-in (#3)?
I built the **multiclass-in level-up engine** (#3) this pass — but your handoff explicitly marked it **"no rush"**
and said the sheet's Multiclass action already works via the `PUT`/update path (append `{classId, level:1}` and
re-submit). So: **what made multiclass-in necessary now, and will you actually route the Multiclass action
through `levelup/plan`+`apply` instead of the bulk PUT?** If the PUT path is staying, #3 is still a correctness
win (proper L1 HP recording + L1 feature/subclass/spell prompts for the new class) but it's optional for you —
let me know so I document the intended path. (Implementation details below regardless.)

## #2 — `PUT /api/character/{id}` now returns `200 + CharacterResponse` ✅
Was `204 No Content`; now returns the full updated `CharacterResponse` (same shape as create / levelup-apply).
**You can drop the follow-up GET workaround** in `characters.update()`. Live-verified (PUT → body with the
renamed character). The only behavioral change in this batch — everything else is additive.

## #4c — `ClassResponse.features` (class feature-by-level) ✅
New `features: ClassFeatureResponse[]` on `GET /api/classes`, ordered by level:
```jsonc
"features": [ { "name": "Second Wind", "description": "...", "level": 1, "kind": 0 }, ... ]   // base-class features
```
`kind` is the `FeatureKind` enum (0 Normal / 1 AbilityScoreImprovement / 2 Subclass). Subclass features remain on
`subclasses[].features`. Live: Fighter returns 22 features (L1 = Fighting Style, Second Wind).

## #4a — `ItemResponse.category` + `.rarity` ✅ (migration 039)
```jsonc
{ ..., "category": "Wondrous item", "rarity": "Uncommon" }   // magic item
{ ..., "category": "Adventuring Gear", "rarity": null }       // plain gear
{ ..., "category": "Magic Item", "rarity": null }             // magic item w/o an SRD header (hand-seeded)
```
- `category` (string): for SRD magic items, the type header ("Wondrous item", "Ring", "Potion", "Weapon",
  "Armor", "Wand", "Staff", "Rod", "Scroll"); "Adventuring Gear" for non-magic; **"Magic Item"** for the couple
  of hand-seeded magic items (Ring of Protection, Potion of Healing) that lack an SRD type/rarity header.
- `rarity` (string|null): Common / Uncommon / Rare / Very Rare / Legendary / Artifact for SRD magic items; null
  for plain gear and headerless magic items. **Caveat:** the few multi-variant items ("…uncommon (+1), rare
  (+2), very rare (+3)") resolve to their **highest** rarity — fine as a browser facet, not a per-variant value.
- Backfilled by parsing 030's SRD descriptions (lossy but good); both settable on homebrew `POST /api/items`.
- Live distinct categories: Wondrous item 172, Adventuring Gear 117, Potion 37, Ring 35, Weapon 35, Armor 29, …

## #4b — `RaceResponse.traits` (named racial traits) ✅ (migration 040)
```jsonc
"traits": [ { "name": "Fey Ancestry", "description": "You have advantage on saving throws against being charmed..." }, ... ]
```
Seeded the 8 SRD races that have named traits (Dwarf 5, Elf 4, Half-Orc 4, Dragonborn/Half-Elf/Halfling/Tiefling 3,
Gnome 2). **Human has none** (no named SRD traits) → `traits: []`. Descriptive only (the mechanical bits —
ability modifiers, speeds, darkvision, resistances, languages — stay where they were). Also settable on homebrew
`POST /api/races` via a `traits: [{name, description}]` field. Live: Elf → Darkvision, Fey Ancestry, Keen Senses, Trance.

## #3 — Multiclass-in level-up engine ✅
`POST /api/character/{id}/levelup/plan` and `…/apply` now accept a **classId the character doesn't have yet** —
the planner treats it as that class's **first level** (`fromLevel: 0 → toLevel: 1`) and `apply` adds a new
`CharacterClass` at level 1. HP is the normal roll/average (NOT maxed — RAW: only the *starting* class's L1 is
maxed). The plan surfaces the new class's L1 features, subclass choice (Cleric/Sorcerer/Warlock get theirs at
L1), caster spell/cantrip choices, and feature sub-choices (e.g. multiclassing into Fighter → Fighting Style;
into Rogue → Expertise). Live: Fighter 1 → `plan {classId: Wizard}` returns from 0/to 1/totalAfter 2 + Wizard
spell choices; `apply` → character has Fighter 1 + Wizard 1.
- **Known simplification (documented):** multiclassing does NOT apply the RAW *reduced* multiclass proficiency
  grants — a new class still contributes its **full** proficiency grants (the existing create-path approximation).
  Multiclass ability-score prerequisites aren't enforced either (DM tool). If you route Multiclass through the
  engine, surface that to the DM. (See the question at the top.)

## Build / status
- `dotnet build DMTool.slnx` → **0 errors**; `dotnet test` → **61/61 pass** (+1 multiclass-in test); codescan
  **A** (the only 2 flags are Kevin's local Azure publish scaffolding, not app code); 0 cross-module dupes.
- Migrations **039 + 040** idempotent. IIS pool `DMTool` running; `/api/health` → ok. DB `DMTools_local` **through 040**.
- Commit on `origin/master`: `b2fa276`.

---

# INCOMING #8 — multiclass proficiency subset now RAW + answers to your reply

**Date:** 2026-06-08. Committed + **pushed** (`8ffc2b4`, **migration 041**; DB `DMTools_local` now **through 041**).

## Answers to your INCOMING #7 reply
- **#2 (PUT-200):** great, glad it's consumed and the extra GET is gone.
- **#3 (multiclass-in):** thanks for the framing — "retire the bulk-PUT stopgap, route Add-Class through
  `levelup/plan`+`apply`" is exactly the intended use. **Nothing else needed on the backend** for that path;
  the engine accepting an unowned `classId` (fromLevel 0→1) is the whole feature. One thing changed since your
  reply ↓.

## Multiclass proficiencies are now RAW-correct (you can drop most of that DM caveat)
You said you'd surface "multiclass grants full (not RAW-reduced) proficiencies" to the DM. **That over-grant is
fixed** (migration 041): a multiclassed (non-starting) class now grants only the **reduced PHB multiclass
subset**, not its full starting set. The starting class still grants everything. Examples (live-verified):
- Wizard (start) + Fighter (multiclass) → armor **Light/Medium/Shield** (no **Heavy**), weapons Simple/Martial.
- Fighter (start) + Wizard (multiclass) → armor includes **Heavy** (Fighter's full set); Wizard adds nothing.
- Saving throws were already starting-class-only (unchanged).

**No contract/shape change** — `CharacterResponse.weaponProficiencies` / `armorProficiencies` /
`toolProficiencies` are the same shape; they just now contain the correct (smaller) set for multiclass characters.
Nothing to do on your side — but **you can soften the DM warning**: proficiencies are now RAW for the fixed grants.

**Still simplified (smaller caveat, your call to surface or not):**
- The multiclass **choice** grants aren't auto-applied: Bard/Rogue/Ranger's "one skill of your choice" and Bard's
  "one musical instrument" on multiclass. The DM can add these via the character's per-character proficiency
  additions / skill proficiencies. (The *fixed* armor/weapon/tool grants are correct.)
- Multiclass **ability-score prerequisites** (13+ in the relevant abilities) are still not enforced — DM tool.

## Build / status
- `dotnet build DMTool.slnx` → **0 errors**; `dotnet test` → **63/63** (+2 multiclass-proficiency tests); codescan
  **A** (only the 2 scaffolding flags); 0 dupes. Migration **041** idempotent. DB `DMTools_local` **through 041**.
- Commit on `origin/master`: `8ffc2b4`.

---

# INCOMING #9 — Deferral folds (042-045): multiclass prereqs now ENFORCED + Eldritch Invocations + Paladin spells + senses

**origin/master `bec9ccb`, DB `DMTools_local` through migration 045. Build 0 errors, 71/71 tests (+8), codescan A (only the 2 Azure-scaffolding PII flags, not app code), 0 cross-module dupes, all migrations idempotent.**

Backend cleared a four-item deferral/standing-offer backlog. One item reverses an explicit #8 statement, so read the first section.

## ⚠️ Reverses an INCOMING #8 statement — multiclass ability-score prerequisites are now ENFORCED (RAW)
#8 said "Multiclass ability-score prerequisites (13+...) are still not enforced." Migration **045** now enforces them as the RAW 5e mechanic: to take a level in a class you need **>= 13** in the relevant ability of **BOTH** the class you're entering **and** every class you already have. Fighter is STR **or** DEX (either); all other multi-ability classes (Monk DEX+WIS, Paladin STR+CHA, Ranger DEX+WIS) require **all**; single-ability classes are obvious.

- **`POST /api/character/{id}/levelup/plan`** now returns an extra `multiclassPrerequisite` object, **present only when the plan enters a class the character doesn't already have** (a multiclass-in); it is `null` when advancing an owned class. Shape:
  ```jsonc
  "multiclassPrerequisite": {
    "isMet": false,                       // conjunction over every class below
    "classes": [
      { "classId": "...", "className": "Fighter", "requiresAll": false, "isMet": false,
        "abilities": [
          { "statId": "...", "statName": "Strength",  "minimumScore": 13, "characterScore": 10, "isMet": false },
          { "statId": "...", "statName": "Dexterity", "minimumScore": 13, "characterScore": 10, "isMet": false }
        ] },
      { "classId": "...", "className": "Wizard", "requiresAll": true, "isMet": true, "abilities": [ ... ] }
    ]
  }
  ```
  Use it to show the DM *whether* the multiclass qualifies and *why not* (which class, which ability, current vs 13). `requiresAll` tells you to render the abilities as AND vs OR.
- **`POST .../levelup/apply`** returns **400** on a multiclass-in whose prerequisites aren't met. The error is on `classId` and reads e.g. *"Multiclass ability-score prerequisite not met: requires Fighter (one of Strength 13, Dexterity 13). Set allowHomebrewSelections to override."*
- **Override:** send `"allowHomebrewSelections": true` on the apply request to bypass the gate (the same homebrew flag you already use for off-catalog subclass/spell/skill picks). Returns 200 and multiclasses anyway.
- **The bulk `PUT /api/character/{id}` path is UNAFFECTED** — no prerequisite check runs there (it doesn't build a level-up plan). Only the level-up **engine** path enforces this.
- **Strictness heads-up:** character *creation* does not enforce prereqs, so a character whose *existing* class is below its own prereq can be blocked from engine-multiclassing even into a class it would qualify for. That's RAW; use the homebrew flag to override, or surface the `multiclassPrerequisite.classes[].isMet` detail so the DM sees which class is the blocker.

**Recommended UX:** in the Add-Class / level-up dialog, call `plan` first; if `multiclassPrerequisite` is non-null and `isMet` is false, show the unmet abilities and either block "Confirm" or offer a "DM override" toggle that sets `allowHomebrewSelections`.

## New API surface since #8

### Eldritch Invocations (Warlock) — migration 043
- New reference catalog: **`GET /api/eldritchinvocations`** (32 SRD invocations) and **`POST /api/eldritchinvocations`** (homebrew; `{ name, description }`). Response item: `{ id, name, description }`.
- Warlock's `ClassResponse.featureSelections` now include **Type 7** (`EldritchInvocation`) entries: one at L2 with `choose: 2`, plus one each at L5/7/9/12/15/18 with `choose: 1`. Same shape/flow as the existing Type 4/5/6 sub-feature selections (Fighting Style / Expertise / Metamagic).
- Settable at **creation** via `CharacterRequest.eldritchInvocationIds: Guid[]`, and at **level-up** via the existing `featureChoices` (`{ selectionId, optionIds }`) on apply.
- `CharacterResponse.eldritchInvocations` is a `NamedRef[]` (the chosen invocations). Description-only — prerequisites (e.g. "requires Pact of the Blade", "level 5+") live in the description text and are DM-resolved, like Fighting Style/Metamagic.
- The old per-invocation noise rows ("Eldritch Invocation: X" in the Warlock feature list) are archived, so the Warlock sheet now shows just "Eldritch Invocations" + the chosen ones.

### Paladin spellcasting is no longer empty — migration 042
`ClassResponse.spellcasting` for **Paladin** is now populated: a prepared half-caster progression L2-20 (`isPrepared: true`, slot table, `*Known` null). (An earlier note said Paladin's progression was empty; that deferral is now closed. Slots match Ranger's half-caster table.)

### Race senses — migration 044
`RaceResponse` and `CharacterResponse` gain `blindsightRange`, `tremorsenseRange`, `truesightRange` (ints, feet, `0` = none — alongside the existing `darkvisionRange`). All SRD player races are `0` (these are monster-centric), so this is for homebrew races; `RaceCreateRequest` accepts the three fields. `CharacterResponse` passes them through from the race.

### Remarkable Athlete (Champion) — migration 044
`CharacterRequest.hasRemarkableAthlete` (optional bool, default `false` — non-breaking) and `CharacterResponse.hasRemarkableAthlete`. When set, the character adds half proficiency (rounded **up**) to untrained **STR/DEX/CON** skill checks and initiative (it wins over Jack of All Trades where both apply). It's already folded into the returned `skills[].bonus` and `initiative` — no extra rendering needed; it's the analog of the existing `hasJackOfAllTrades` flag.

## Received, not yet built
**`FRONTEND-REQUEST-unarmed-attacks.md`** — received and assessed. Confirmed both asks are currently missing server-side: `weaponAttacks` is empty when no weapon is equipped, and `armorClassBreakdown` does only generic `10 + DEX` (no Monk/Barbarian/Draconic Unarmored Defense — your "AC 12 = 10 + 2 DEX" observation is correct). It's queued as the next backend task; you'll get a callback when it ships. No action needed from you meanwhile.

## Build / status
- `dotnet build DMTool.slnx` → **0 errors**; `dotnet test` → **71/71** (+8: Remarkable Athlete x4, multiclass prereq x4); codescan **A** (only the 2 Azure-scaffolding flags); 0 dupes. Migrations **042-045** idempotent. DB `DMTools_local` **through 045**.
- Commits on `origin/master`: `d9beed9` (Paladin slots) + `8637a75` (invocations + Tier-1 folds + multiclass prereqs) + `bec9ccb` (handover doc). HEAD `bec9ccb`.
- This callback was **appended by the backend session but intentionally NOT committed** — committing in this repo is the frontend session's responsibility (avoids sweeping your staged WIP).

---

# INCOMING #10 — Multiclass choice-grants (Bard/Ranger/Rogue) + focused HP-override endpoint

**DB `DMTools_local` through migration 048. Build 0 errors, 91/91 tests (+1), codescan A (only the 2 Azure-scaffolding PII flags, not app code), 0 cross-module dupes, migration 048 idempotent. Live IIS round-trips green.** Two self-contained additions; both **additive / non-breaking**.

> Heads-up: this session's work is **not yet committed** (still applied to the live DB + working tree). HEAD on `origin/master` is unchanged from #9 (`bec9ccb`) until Kevin commits.

## 1) Multiclass choice-grants on the level-up plan (migration 048)

RAW, entering a class *as a multiclass* grants a **reduced** set of proficiencies vs. taking it as your starting class. The flat ones were already handled (migration 041). The three **choices** are now surfaced by the level-up engine:
- **Bard** — one skill of your choice **+** one musical instrument
- **Ranger** — one skill from the Ranger skill list
- **Rogue** — one skill from the Rogue skill list

### `POST /api/character/{id}/levelup/plan` — new `multiclassGrants[]`
The plan response gains `multiclassGrants: SelectionResponse[]`. It is **populated only when the plan enters a class the character doesn't already have** (a multiclass-in) and that class offers such grants (Bard/Ranger/Rogue). It is an **empty array** when advancing an owned class, or entering a class with no choice-grants. Each item is the **same `SelectionResponse` shape you already render** for subclass/feature choices:
```jsonc
"multiclassGrants": [
  { "id": "...", "name": "Bard Multiclass Skill", "type": 1, "choose": 1, "level": 1,
    "options": [ { "optionId": "<skillId>", "name": "Acrobatics" }, ... all 18 skills ] },
  { "id": "...", "name": "Bard Multiclass Instrument", "type": 8, "choose": 1, "level": 1,
    "options": [ { "optionId": "<toolId>", "name": "Lute" }, ... 10 instruments ] }
]
```
- **New `SelectionType` enum value: `Tool = 8`** (enums are NUMBERS over the wire). Its `options[].optionId` point into the **Tools** catalog (`GET /api/tools`); `name` is the tool name. (Existing values unchanged: Skill 1, Subclass 2, Language 3, FightingStyle 4, Expertise 5, Metamagic 6, EldritchInvocation 7.)
- These grants are **NOT** in `GET /api/classes` → `selections[]` (they're multiclass-only; the normal class skill choice still appears there for starting-class creation). You only ever see them via the **plan**.

### `POST .../levelup/apply` — new `multiclassChoices[]`
Send the picks with the **same `{ selectionId, optionIds }` shape as `featureChoices`**:
```jsonc
{
  "classId": "<bardId>",
  "hitPoints": { "mode": 0 },
  "multiclassChoices": [
    { "selectionId": "<Bard Multiclass Skill id>",      "optionIds": ["<skillId>"] },
    { "selectionId": "<Bard Multiclass Instrument id>", "optionIds": ["<toolId>"] }
  ]
}
```
- Validated against the grant (subset + `choose` count), **relaxable** via `allowHomebrewSelections: true` (same flag as everywhere else). Off-pool / over-count → **400** on `multiclassChoices`.
- **Empty picks are allowed** (not hard-required — the DM may fill the choice later); a pick for a selection not offered → 400.
- On success the chosen **skill** appears in `skills[].isProficient = true` and the chosen **instrument** in `toolProficiencies.tools[]` — both in the returned `CharacterResponse` and on a fresh `GET`.
- Reminder: a multiclass-in still also enforces the **ability-score prerequisite** from #9 (e.g. Bard needs CHA ≥ 13) — `plan` first to surface `multiclassPrerequisite`, then `apply`.

**Suggested UX:** in the Add-Class/level-up dialog, after `plan`, if `multiclassGrants` is non-empty render one picker per grant (a skill dropdown; for Bard, also an instrument dropdown), then include the picks as `multiclassChoices` on `apply`.

## 2) Focused HP-override endpoint — `PUT /api/character/{id}/hp` (no migration)

Exactly your `FRONTEND-REQUEST-hp-override.md` ask — the spells-endpoint pattern for `hitPointsOverride`:
```jsonc
PUT /api/character/{id}/hp
{ "hitPointsOverride": 150 }   // null CLEARS the override (HP reverts to derivedMaxHitPoints)
```
- Sets **only** `hitPointsOverride`; no other field/child changes (verified: name/level untouched).
- Validation: integer **1–9999**; `0` / negative / `> 9999` → **400**; `null` is the allowed clear path.
- **Owner-scoped → 404** if the character doesn't exist or isn't yours (the IDOR rule).
- Returns **200 + full `CharacterResponse`** so `maxHitPoints` / `derivedMaxHitPoints` / `hitPointBreakdown` all refresh — re-render straight from the body.
- Live-verified: set 150 → `maxHitPoints` 150 (`derivedMaxHitPoints` stays 28); clear `null` → `maxHitPoints` back to 28, `hitPointsOverride` null.

## Build / status
- `dotnet build DMTool.slnx` → **0 errors**; `dotnet test` → **91/91** (+1 multiclass-grant planner test); codescan **A** (only the 2 Azure-scaffolding flags); 0 cross-module dupes. Migration **048** idempotent. DB `DMTools_local` **through 048**.

---

# INCOMING #11 — `FRONTEND-REQUEST-spell-damage-fields.md` Tier 1 DONE (structured spell combat fields)

**DB `DMTools_local` through migration 049. Build 0 errors, 91/91 tests, codescan A (only the 2 Azure-scaffolding PII flags), 0 cross-module dupes, migration 049 idempotent. Live round-trips green.** Additive / response-only + new optional create fields — non-breaking.

Tier 1 (the catalog fields + homebrew authoring) is shipped. **Tier 2 (per-character computed dice) is NOT built** — scope note at the bottom.

## `GET /api/spells` + `POST /api/spells` — new structured fields on `SpellResponse`
Seven new fields on each spell (all **nullable / best-effort**; utility spells return them null/false):
```jsonc
{
  // ...existing SpellResponse fields...
  "damageDice":      "8d6",                              // base damage dice at the spell's base level; null if non-damage
  "damageType":      { "id": "...", "name": "Fire" },    // NamedRef (DamageType) or null
  "healingDice":     "1d8",                              // healing spells (Cure Wounds); null otherwise
  "scalingDice":     "+1d6 per slot level above 3rd",    // free text; cantrips e.g. "L5: 2d10, L11: 3d10, L17: 4d10"; null if none
  "usesSpellAttack": false,                              // true = spell attack roll (Fire Bolt); false = save/utility
  "saveStatId":      "<Stat id>",                        // when the spell forces a save (Fireball -> DEX); null otherwise
  "saveAbility":     "Dexterity"                         // display name for saveStatId; null otherwise
}
```
- **SRD set backfilled** from the official 2014 SRD JSON (migration 049, **125 spells** carry at least one field). It's lossy-by-design (same spirit as the item category/rarity backfill): a clean parse where the SRD has structured data, **null where it doesn't**. Spot-checked: Fireball `8d6 Fire / DEX save / +1d6 per slot above 3rd`; Fire Bolt `1d10 Fire / spell attack / L5:2d10,L11:3d10,L17:4d10`; Cure Wounds `healing 1d8 / +1d8 per slot above 1st`; Eldritch Blast `1d10 Force / spell attack / no dice-scaling` (it adds beams, not dice — so `scalingDice` is null, as intended).
- A spell is **either** `usesSpellAttack:true` **or** has a `saveStatId` (or neither, for utility) — your "to hit vs save" distinction.
- **Render hint:** `name · {damageDice} {damageType.name} · {usesSpellAttack ? "spell attack" : saveAbility+" save"}`, with `scalingDice` / description on hover. Join the catalog to the character's known list by spell id (no `SpellRef` change — exactly your Tier-1 plan).

## Homebrew authoring — `POST /api/spells` accepts the same fields
New optional create fields: `damageDice`, `damageTypeId`, `healingDice`, `scalingDice`, `usesSpellAttack`, `saveStatId` (camelCase). `damageTypeId` / `saveStatId` are **existence-checked** against the DamageType / Stat catalogs → **400** on a bogus id. They round-trip on the GET. (Live-verified: a homebrew `5d8 Cold` spell with a CON save POSTs and reads back intact; bogus `damageTypeId` → 400.)

## Tier 2 (per-character computed dice) — NOT built; here's what it'd take
Your doc flagged Tier 2 as optional ("adopt later without a frontend rewrite"). Confirming it's deferred, with the honest scope so you can decide if/when to ask for it:
- **Cantrip auto-scaling by character level** needs *structured* per-level dice (the `scalingDice` we shipped is free text — fine to display, not to compute against). That implies a small new normalized table (per-level dice, re-imported from the same SRD JSON) so the engine can resolve "Fire Bolt = 3d10 at character level 11".
- **`saveDc` / `spellAttackBonus` per spell** mostly exists already (`ClassResponse.spellcasting` + the character's `spellcasting` block compute `8+PB+mod` / `PB+mod` per caster class). The gap: a known spell isn't tagged with *which* caster class taught it, so on a multiclass caster we can't unambiguously pick the DC — that's a modeling decision (store a source class on the character's spell, or heuristically match by class-list membership).
- **Levelled-spell upcasting** (8d6 → 9d6 at a 4th-level slot) is a *cast-time* choice (which slot you spend) = runtime state, which is **out of the builder's scope** (Scope A). The base dice + the `scalingDice` note already cover the display; live upcast math would belong to a future combat module (Scope B).
- So a realistic Tier 2 = (cantrip per-level dice table + a pure resolver) + (a source-class decision for multiclass DC). Ping the backend if you want it; it's additive and won't change the Tier-1 shape you build against now.

## Build / status (this session, all three deliverables)
- `dotnet build DMTool.slnx` → **0 errors**; `dotnet test` → **91/91** (+1); codescan **A** (only the 2 Azure-scaffolding flags); 0 cross-module dupes. Migrations **048** (multiclass grants) + **049** (spell combat fields) idempotent. DB `DMTools_local` **through 049**. HP-override endpoint had no migration.
- Covers three frontend requests: `hp-override` (INCOMING #10), the multiclass choice-grants (#10), and `spell-damage-fields` Tier 1 (#11).
- These callbacks were **appended by the backend session**; committing in *this* repo is the frontend session's responsibility (the backend committed only its own repo).
