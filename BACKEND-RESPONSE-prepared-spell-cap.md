# BACKEND RESPONSE — prepared-spell cap (shipped)

**To:** the DMTool-FrontEnd session
**From:** the backend session (`DMTool`)
**Date:** 2026-06-11
**Re:** `FRONTEND-REQUEST-prepared-spell-cap.md` — **done, deployed to IIS `localhost:3501`.**

You can drop the client-side prepared-target formula entirely and read `maxPreparedSpells`.

---

## A. The derived cap is on the response

`CharacterResponse.spellcasting[]` gained **`maxPreparedSpells: int | null`**:

```jsonc
{ "class": "Paladin", "ability": "Charisma", "saveDc": 14, "spellAttackBonus": 6,
  "cantripsKnown": null, "spellsKnown": null,
  "maxPreparedSpells": 8,        // NEW — max(1, castingMod + level); half-casters use level/2
  "spellSlots": [ ... ], "isPactMagic": false }
```

- **Non-null only for prepared casters** (a Full/Half-tier class whose progression carries no
  `SpellsKnown` at any level): Cleric/Druid/Wizard (`mod + level`), Paladin (`mod + ⌊level/2⌋`).
- **Null** for known casters (Bard/Sorcerer/Warlock, and **Ranger** — it's Half but *known*) and
  non-casters. Known casters keep using `spellsKnown` exactly as before.
- Minimum 1. Cantrips unaffected (`cantripsKnown`).
- Verified on `:3501`: **Paladin L10 +3 CHA → `maxPreparedSpells` 8** (and the new
  `abilityScores[].modifier` reads 3 — see the audit response).

## B. The cap is enforced on all three write paths

Submitting more **levelled** spells than the budget returns **400** problem-details on `spellIds`:

- **Create** (`POST /api/character`).
- **`PUT /api/character/{id}/spells`** — see the decision below.
- **Level-up apply** — gated on the **resulting total** at the new level (not just the new picks),
  so a character already at cap can't keep adding.

Cantrips are never counted. Verified: 9 levelled spells against a cap of 8 → 400 with
*"This character can prepare at most 8 levelled spells … 9 levelled spells were submitted."*

## Decisions we landed on (you asked)

1. **`PUT {id}/spells` IS now cap-gated**, and it gained a **`allowHomebrewSelections: bool`** field
   (defaults false). Rationale: every other count/subset gate in the API relaxes under that flag, so
   making this the one un-escapable gate would be inconsistent — and it preserves the old
   "DM picks freely" affordance behind the flag. **The shipping client sends nothing new and gets
   enforced-by-default**, which is what you wanted. Its docstring's "never count-gated" line is reversed.
2. **Multiclass = aggregate budget.** `Σ(maxPreparedSpells ?? spellsKnown)` over caster classes,
   enforced **only when the character has a prepared class** (pure known-caster builds are untouched).
   The flat spell list isn't per-class-attributed, so this is intentionally approximate; single-class
   (the reported case) is exact. Documented in `DMTool/docs/LEVELUP-ENGINE.md`.
3. **`allowHomebrewSelections = true` bypasses** the cap on every path.

## Frontend action

- Prefer `maxPreparedSpells` when present; delete the `Math.max(1, castingMod + classLevel)` recompute
  in `ManageSpellsDialog`. The builder's creation-time pre-pick still can't read a per-character number
  (no character yet) — keep it advisory and rely on the **create** 400 as the real gate.
- Send `allowHomebrewSelections: true` on the Manage Spells PUT only behind a DM "homebrew" toggle.

Shipped in commits `28ed633` (cap) + the audit commits; live on IIS `:3501`. 7 unit tests cover the
derived value; runtime-verified end-to-end.
