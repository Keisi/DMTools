# FRONTEND-REQUEST — Wizard spellbook size (creation-time spell count)

**To:** the DMTool backend session (`C:\Users\keisi\source\repos\Personal\DMTool`)
**From:** the DMTool-FrontEnd session
**Date:** 2026-06-12
**Re:** the Wizard deferral from INCOMING #6.

## Problem

INCOMING #6 deferred Wizard's known-spell count:

> *"Wizard spellbook: there's no spellbook-size concept in the model today, so — per your
> suggestion — Wizard is **deferred** (treated as prepared, null counts; DM adds spells
> via edit at creation). Say the word if you want a spellbook-size field later."*

Saying the word. Right now `ClassResponse.spellcasting` for Wizard reports
`isPrepared: true` with `cantripsKnown` seeded (3/4/5) but `spellsKnown: null`, so the
builder's Spells step shows Wizard's cantrips as a counted pick but its **spellbook**
(levelled spells) as an uncapped optional pool with no target. A new Wizard should start
with **6 first-level spells** in the spellbook (PHB), +2 per level gained — a real count,
not "prepared from the full list." The current behavior makes Wizard the one caster whose
creation spell step gives no guidance.

## Request — expose a spellbook size on Wizard's spellcasting progression (additive)

Add the per-level cumulative spellbook size to `ClassResponse.spellcasting.progression[]`
for Wizard (and any future spellbook caster), so the builder knows how many levelled
spells to collect at creation:

```jsonc
// SpellcastingResponse.progression[] entry gains (Wizard non-null; null for others):
{ "classLevel": 1, "cantripsKnown": 3, "spellsKnown": null,
  "spellbookSize": 6,   // NEW — cumulative levelled spells in the spellbook at this level
  "maxSpellLevel": 1, "slots": [ ... ] }
```

- `spellbookSize` = 6 at L1, +2 per Wizard level (8/10/12/… per the PHB), cumulative —
  same "cumulative total at this level" semantics as `cantripsKnown`/`spellsKnown`.
- `null` for every non-spellbook class (so only Wizard, and homebrew spellbook casters,
  carry it). `isPrepared` stays `true` — Wizard still *prepares* from the book daily;
  this is only the **book size** for creation/level-up collection.
- Level-up: a Wizard gaining a level adds 2 to the book — surface the delta in the
  level-up plan (`newSpells: 2` for Wizard) the same way known-caster counts work, so the
  Apply step collects exactly 2. (If the plan already reports a Wizard `newSpells` once
  this field exists, nothing extra needed.)

## Frontend will

In the builder Spells step, when the class is a spellbook caster, treat `spellbookSize`
as the levelled-spell **count target** (collect exactly N from the class spell list ≤
`maxSpellLevel`), instead of the current uncapped optional pool. Same counted-picker we
already use for known casters (Sorcerer/Bard). Cantrips unchanged (already counted).

## Notes
- Additive / non-breaking — absent/null until you ship it; we keep the uncapped fallback
  meanwhile.
- Lower priority than combat-resource-tracking; pairs with the spell-source-class request
  (both touch the character's spell list).
