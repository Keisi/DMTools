# FRONTEND REQUEST — make prepared-spell counts a backend responsibility (derive + enforce)

**To:** the backend session (`C:\Users\keisi\source\repos\Personal\DMTool`)
**From:** the DMTool-FrontEnd session
**Date:** 2026-06-11
**Re:** prepared casters (Paladin/Cleric/Druid/Wizard) have a real "how many can I
prepare" limit, but the contract doesn't model it and no write path enforces it. The
frontend is currently **recomputing it client-side** — which both violates the
derived-not-stored rule and is **wrong for half-casters**. Please own this number.

---

## What prompted this

A level-10 Paladin's Spells step couldn't select anything (a frontend cap bug — fixed:
the optional prepared pool is now uncapped client-side). While fixing it we confirmed:

1. There is **no prepared-spell-count concept anywhere in the backend.** The only
   "prepared" signal is `ClassSpellcastingResponse.IsPrepared`, derived as
   `SpellcastingProgression.All(p => p.SpellsKnown is null)` (`ClassesController.cs:78`).
2. The **create** path validates submitted spell ids for **existence + distinctness
   only** — no count cap, no class-list check, no prepared limit
   (`CharacterController.cs:982-983`, `ResolveDistinctIds`).
3. The **level-up apply** path skips the count for prepared casters too: `CollectSpellPicks`
   treats a `null` grant as "pool is informational — subset gate only, no count"
   (`CharacterController.cs:615-640`).
4. So a prepared caster can be created / updated with **any number** of levelled spells.

Because the backend exposes no number, the frontend's **Manage Spells** dialog derives the
target itself: `Math.max(1, castingMod + classLevel)` recomputed from the character's
scores (`ManageSpellsDialog.tsx:97-101`). Two problems with that:
- It's a **client-side recomputation of a derived stat** — against the project rule
  "render what the API returns, never recompute these."
- It's **wrong for half-casters.** It uses `mod + level` for *all* prepared casters, but a
  Paladin prepares `mod + ⌊level/2⌋`. A L10 Paladin (+3 Cha) shows a target of **13**; the
  correct number is **8**. (The dialog's own header comment only lists "Cleric/Druid/Wizard"
  — the author didn't account for Paladin.)

## The formula we need the backend to own

Prepared levelled-spell count, per prepared caster class:

```
maxPrepared = max(1, castingAbilityModifier + levelContribution)
  where levelContribution = (SpellcastingTier == Half) ? floor(classLevel / 2) : classLevel
```

- **Half + prepared** (Paladin): `mod + ⌊classLevel/2⌋`. (Ranger is `Half` but a *known*
  caster — `SpellsKnown` non-null — so it is not prepared; don't apply this to it.)
- **Full + prepared** (Cleric/Druid/Wizard): `mod + classLevel`.
- Minimum **1**.
- Cantrips are unaffected — they stay `CantripsKnown` (fixed, already correct).
- Wizard nuance: RAW the spellbook (known list) and prepared count differ; we do **not**
  model a spellbook. For our purposes `maxPrepared = Int mod + level` is the only cap we
  want. (If you ever add a spellbook size, that's a separate field — out of scope here.)

The inputs already sit together in `Character.Spellcasting`
(`DMTool.Entities/Characters/Character.cs:580-633`): it computes `modifier` (line 607)
from `EffectiveAbilityScores`, has `cc.Level`, and has `cc.Class.SpellcastingTier`. The
prepared test mirrors `ClassesController.cs:78` (`progression?.SpellsKnown is null`).

## What we're asking for — two parts

### A. Surface the derived cap on the character response (so the UI can display + cap accurately)

Add a nullable `MaxPreparedSpells` to the derived spellcasting, **null for non-prepared
casters** (known casters keep using `SpellsKnown`; this stays null for them):

- `DMTool.Entities/Derived/CharacterSpellcasting.cs` — add `int? MaxPreparedSpells` to the
  record.
- `Character.cs:623` — set it in the `new CharacterSpellcasting(...)`: compute it with the
  formula above when the class is prepared, else `null`.
- `CharacterContracts.cs:270-273` — add `int? MaxPreparedSpells` to `SpellcastingResponse`.
- `CharacterContracts.cs:444-448` — map `sc.MaxPreparedSpells` through.

Resulting per-class block the frontend consumes:
```jsonc
// CharacterResponse.spellcasting[]
{
  "class": "Paladin", "ability": "Charisma", "saveDc": 14, "spellAttackBonus": 6,
  "cantripsKnown": null,          // Paladin: no cantrips
  "spellsKnown": null,            // prepared → still null (unchanged)
  "maxPreparedSpells": 8,         // NEW: null for known casters & non-casters
  "spellSlots": [ ... ], "isPactMagic": false
}
```
This is additive/response-only — nothing breaks; we ignore it until we consume it.

### B. Enforce the cap on the write paths (the authoritative gate)

The frontend can only ever *advise* — please make the backend the gate so an over-cap
submission is a clean `400` with a problem-details message we can surface:

- **Create** (`CharacterController.cs:982`): after the character entity is built (so
  `Spellcasting[].MaxPreparedSpells` is available — the cap doesn't depend on *which*
  spells were chosen, only on ability mod + level), validate the count of **levelled**
  prepared spells against the cap. Reject with a `ModelState` error on
  `nameof(request.SpellIds)` when exceeded.
- **Update spells** (`PUT {id}/spells`, `CharacterController.cs:135-154`): same check — this
  is the path **Manage Spells** uses. ⚠️ **Heads-up / your call:** this endpoint is currently
  *deliberately* uncapped — its docstring says *"Existence-checked only, never count-gated (the
  frontend guides counts; a DM may pick freely)… this is a DM tool."* We're asking you to add
  the cap here anyway (the frontend should stop being the one "guiding counts"), but that
  reverses a documented decision — so it's your call how:
    - enforce for everyone (simplest, matches our intent), **or**
    - enforce but keep a DM/homebrew bypass (note: `UpdateSpellsRequest` has no
      `AllowHomebrewSelections` flag today — you'd add one, or key off a DM role), **or**
    - leave this path lenient and rely on the displayed cap + the create/level-up gates.
  We prefer the first; tell us which you land on.
  Ordering note: the character is loaded **after** the write today (`:151`). The cap depends
  only on ability mod + level (not on the chosen spells), so load the existing character (or
  recompute from it) **before** `UpdateSpellsAsync` to read `MaxPreparedSpells`, then gate.
- **Level-up apply** (`CollectSpellPicks`, `CharacterController.cs:630-640`): when `grant`
  is null (prepared), enforce `picks.Count <= maxPrepared` instead of "no count".

Relax the cap under `AllowHomebrewSelections` (the DM escape hatch), consistent with how the
subset/count gates already relax there (`CollectSpellPicks:635`).

## The multiclass wrinkle (please decide + document)

`CharacterSpells` is a **flat union** list — it doesn't record which class a levelled spell
was prepared *for*, and spells appear on multiple class lists, so per-class attribution
isn't recoverable from the stored list. Two pragmatic options:

1. **(Recommended) Aggregate cap.** Enforce: total **levelled** spells ≤
   `Σ(maxPrepared over prepared classes) + Σ(spellsKnown over known classes)`. This mirrors
   the *intentionally approximate* multiclass skill math already in the create path
   (`CharacterController.cs:967-971`). Single-class (the common case + the reported bug) is
   then exact.
2. **Single-class only.** Enforce only when the character has exactly one caster class;
   skip multiclass. Simplest, but leaves multiclass unbounded.

We're happy with either; (1) is our preference. Whatever you pick, a one-liner in the
response comment / `LEVELUP-ENGINE.md` so the next session knows it's deliberate.

## Acceptance criteria

- `CharacterResponse.spellcasting[].maxPreparedSpells` is **non-null and correct** for
  prepared casters (Paladin L10 +3 Cha → **8**; Cleric L5 +3 Wis → **8**), **null** for
  known casters (Sorcerer/Bard/Ranger/Warlock) and non-casters.
- Creating / updating-spells / leveling-up a prepared caster with **more** levelled spells
  than the cap returns **400** with a problem-details message naming the field and the cap;
  at or under the cap succeeds.
- `AllowHomebrewSelections = true` bypasses the cap.
- Cantrips and known-caster levelled counts behave exactly as today (no regression).

## Notes

- We'll wire the frontend to **prefer `maxPreparedSpells` when present** and fall back to a
  (now half-caster-corrected) client estimate only until this ships — then drop the
  client formula entirely. The builder's creation-time pre-pick can't read a per-character
  number (no character yet), so it stays an advisory hint and relies on the **create**
  enforcement (B) as the real gate; the sheet + Manage Spells use the authoritative field.
- Build/run reminder: IIS serves the built DLL — verify after `dotnet build DMTool.slnx` +
  pool restart, not `dotnet test` alone.
- This is response-additive + write-validation only; no migration, no breaking change.
