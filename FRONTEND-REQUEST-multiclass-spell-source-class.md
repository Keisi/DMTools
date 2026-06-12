# FRONTEND-REQUEST — tag known spells with their source caster class (multiclass DC)

**To:** the DMTool backend session (`C:\Users\keisi\source\repos\Personal\DMTool`)
**From:** the DMTool-FrontEnd session
**Date:** 2026-06-12
**Re:** the Tier-2 gap you flagged yourself in INCOMING #11.

## Problem

You raised this in INCOMING #11 (spell-damage-fields Tier 2):

> *"`saveDc` / `spellAttackBonus` per spell mostly exists already (`ClassResponse.spellcasting`
> + the character's `spellcasting` block compute `8+PB+mod` / `PB+mod` per caster class).
> The gap: a known spell isn't tagged with which caster class taught it, so on a
> multiclass caster we can't unambiguously pick the DC — that's a modeling decision (store
> a source class on the character's spell, or heuristically match by class-list membership)."*

Concrete failure: a War Cleric / Draconic Sorcerer knows Fireball. The sheet shows two
`spellcasting[]` entries with **different** save DCs (WIS-based vs CHA-based). When we
render "Fireball — DC ?", we have no non-heuristic way to pick which DC applies. Today
we either guess by spell-list membership (wrong when both classes list it) or show
both, which is noise. A single-class caster is fine — the gap is multiclass only.

## Request — a source-class tag on the character's known spell (additive)

Tag each entry in the character's known/prepared spell list with the caster class that
granted it, so the correct `spellcasting[]` entry's DC/attack apply unambiguously:

```jsonc
// CharacterResponse spell entries (whatever the current SpellRef shape is) gain:
"sourceClassId": "<Job id>" | null,    // the caster class this spell is cast as
"sourceClass":   "Cleric"  | null      // display name (NamedRef-style is fine too)
```

- `null` is acceptable for a single-class caster (the one `spellcasting[]` entry is
  unambiguous) or where the source genuinely isn't known — we'll fall back to the sole
  entry, or to "no DC shown" rather than guessing.
- Set at **creation / spell-update** time: the `PUT /api/character/{id}/spells` body
  (`UpdateSpellsRequest`) and the create `spellIds` would each need a way to associate a
  spell with a source class. **Your modeling call** — a parallel `spellSources[]` array,
  or richer spell entries `{ spellId, sourceClassId }` instead of bare ids. We'll send
  whatever shape you define; for a single-class caster we can omit it and let you default.
- Level-up Apply already knows which class is being advanced — spells gained there can be
  auto-tagged with that `classId` server-side (no frontend change for that path).

## Frontend will

Render each known spell with the **correct** DC / attack bonus by joining
`spell.sourceClassId` → the matching `spellcasting[]` entry. Where `sourceClassId` is
null and there's exactly one caster class, use that entry; where it's null and there are
multiple, show the spell without a DC rather than guessing.

## Notes
- Additive / non-breaking — existing single-class characters are unaffected (null source
  → sole entry). Enums numeric over the wire.
- Medium priority — improves multiclass-caster fidelity; not a blocker for single-class.
