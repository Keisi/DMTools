# FRONTEND REQUEST — rules-enforcement audit: close the gaps where the frontend is the only gate

**To:** the backend session (`C:\Users\keisi\source\repos\Personal\DMTool`)
**From:** the DMTool-FrontEnd session
**Date:** 2026-06-11
**Re:** Kevin's directive — *"we want to depend as much as possible on the backend since
the API is meant to be data and rules driven."* We audited the frontend for places where
a 5e rule lives client-side. One was fixable today with data you already expose (ASI
schedule from `ClassResponse.features` — done, frontend-only). The rest need you. This
is a sibling of `FRONTEND-REQUEST-prepared-spell-cap.md` (same theme, different rules) —
read that one first if you haven't; item 2 below extends it.

Ordered by impact. Each is independent — ship in any order.

---

## 1. Direct-create accepts an unlimited ASI budget (validation gap)

**Today:** the level-up path validates ability improvements strictly —
`ValidateAbilityImprovements` (`CharacterController.cs:597-610`) enforces "exactly 2
points, different abilities," gated on the plan's `asiDue`. But the **create** path
(`CharacterController.cs:996-1004`) only checks each leg targets one of the character's
stats — the comment even says "Legs may repeat a stat (they accumulate)." A direct-built
character can be created with `+20 STR` via ten legs. The only thing stopping that today
is the frontend's earned-ASI counter.

**The schedule is already yours:** `LevelUpPlanner.cs:40-41` derives `asiDue` from
`Features` rows with `Kind == FeatureKind.AbilityScoreImprovement` at the target level.
The same rows answer the create-time question: for each requested class at level N,
`earnedAsis = features.Count(f => f.SubclassId is null && f.Kind == AbilityScoreImprovement && f.Level <= N)`,
summed over the character's classes.

**Ask:** at create, validate `Σ(improvement amounts) <= earnedAsis * 2` (each ASI = 2
points). Reject over-budget with a `ModelState` error on
`nameof(request.AbilityImprovements)`. Relax under `AllowHomebrewSelections` (consistent
with the other gates).

Two deliberate asymmetries vs. level-up to preserve (just confirming, not asking for
changes): create legs MAY repeat a stat and MAY be uneven (+2/+0 vs +1/+1) since they
represent several accumulated ASIs — only the **total points** cap matters; and feats
interact (a character may have spent an ASI on a feat instead) — if `FeatIds` are present,
the budget question gets murky. Simplest correct rule:
`Σ(amounts) + 2 * count(featIds) <= earnedAsis * 2`… **your call** whether feats consume
the same budget at create (RAW they do). Tell us which you implement so the builder's
client hint can mirror it.

**Frontend note:** the builder's ASI panel now derives its earned count from
`ClassResponse.features` (kind 1, level <= pick level) — the same rows you read — so the
two ends will agree by construction, including for homebrew classes.

## 2. Create + `PUT {id}/spells` accept off-class / over-level spells (extends the prepared-cap request)

**Today:** the level-up apply path has the subset gate (`CollectSpellPicks`,
`CharacterController.cs:615-640`: picks must come from the class pool). But:
- **Create** (`CharacterController.cs:982-983`): existence + distinctness only. A Fighter
  can be created knowing Wish.
- **`PUT {id}/spells`** (`CharacterController.cs:135-154`): deliberately lenient (docstring:
  "this is a DM tool"). Same caveat as the prepared-cap request — adding gates here
  reverses a documented decision; your call there governs here too.

**Ask:** on create (and `PUT spells` if you gate it per the prepared-cap decision),
validate each picked spell is (a) on the spell list of at least one of the character's
caster classes (`SpellClasses` join) and (b) at or below that class's `MaxSpellLevel` for
its chosen level (cantrips: level 0 always fine for a class with `CantripsKnown > 0`).
Relax under `AllowHomebrewSelections`. This plus the prepared-cap count makes the spell
contract fully backend-enforced.

## 3. Initiative "randomize" is a client-side d20 that drops the Dex modifier (rules bug + ownership)

**Today:** the encounter view's "roll initiative" does
`Math.floor(Math.random() * 20) + 1` per combatant and PUTs each result sequentially
(`EncounterView.tsx:289-316`). Two problems: RAW initiative is **d20 + Dex modifier**
(you already derive `CharacterResponse.initiative` for linked characters — the client
roll ignores it), and the roll itself is client-authored, against the rules-driven-API
principle.

**Ask:** a server-side roll endpoint, e.g.
`POST /api/campaigns/{cid}/encounters/{eid}/roll-initiatives`
that, for every combatant (or accept an optional `combatantIds` filter): rolls d20
server-side, adds the linked character's initiative bonus (unlinked combatants: flat d20,
or a stored monster Dex if/when modeled), persists, and returns the full
`EncounterResponse` (matching your every-mutation-returns-the-encounter convention). One
round-trip instead of N, and the tie-sort logic stays consistent with
`setInitiative`'s.

**Frontend after:** the randomize button calls the endpoint and renders; the local d20
goes away.

## 4. Expose the ability modifier so the last client formula can die (additive, low priority)

**Today:** `floor((effective-10)/2)` is duplicated in three frontend files
(`CharacterSheet.tsx:35`, `ManageSpellsDialog.tsx:8`, `PlayerEncounterView.tsx:20`) —
the one derivation the frontend CLAUDE.md sanctions, purely because the response omits
it. It's display-only (saves/skills/attacks/initiative values all already come from you),
but it's still a rule formula living client-side, and `ManageSpellsDialog` uses it for
the prepared-target fallback (until `maxPreparedSpells` ships).

**Ask:** add `int Modifier` to the ability-score block on `CharacterResponse` (the
`AbilityScoreBreakdown` already computes everything around it — `Character.cs:607` shows
the formula in three server-side places already). Additive; we migrate the three files
and delete the helper.

## 5. Point-buy legality stays client-side — flagging as a DECISION, not a gap

The builder enforces 27 points / 8–15 / the cost table; the backend accepts any base
score `[Range(1, 30)]` (`CharacterContracts.cs:18`). The backend can't distinguish
point-buy from manual entry (no creation-method field), and manual 1–30 is the deliberate
DM escape hatch. **We recommend leaving this as is** — point-buy is a table convention,
not a character-validity rule. Noting it here so it's on record as deliberate; if you
ever want it server-enforced, it needs a `method` discriminator on `CharacterRequest`
first. Nothing to do unless you disagree.

---

## Acceptance criteria (per item)

1. Creating a character whose `abilityImprovements` total exceeds `earnedAsis * 2`
   (features-derived) → **400** problem-details naming `AbilityImprovements`; at/under →
   succeeds. Level-up behavior unchanged.
2. Creating a character with a spell not on any of its classes' lists, or above the
   class's max castable level → **400** naming `SpellIds`; legal picks unchanged.
   `AllowHomebrewSelections` bypasses.
3. `POST .../roll-initiatives` rolls d20 + initiative bonus per combatant server-side and
   returns the updated `EncounterResponse`; linked PCs' results reflect their Dex.
4. `CharacterResponse.abilityScores[].modifier` equals `floor((effective-10)/2)` for
   every stat.
5. No change (decision recorded).

## Notes

- All response changes are additive; all new validation only **rejects** what the
  shipping frontend never sends (it already self-gates) — no breaking change for the
  current client.
- Build/run reminder: IIS serves the built DLL — `dotnet build DMTool.slnx` + pool
  restart, not `dotnet test` alone.
- Already fixed frontend-side (no action for you): the builder's hardcoded ASI schedule
  (`[4,8,12,16,19]` + Fighter/Rogue by name) now derives from `ClassResponse.features`
  kind/level rows. Mentioned so you know the two ends now read the same source.
