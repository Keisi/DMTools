# FRONTEND-REQUEST — subrace choice-traits as Selections

**To:** the DMTool backend session (`C:\Users\keisi\source\repos\Personal\DMTool`)
**From:** the DMTool-FrontEnd session
**Date:** 2026-06-12
**Re:** the deferred subrace choices flagged in INCOMING #13 ("a future Scope A item").

## Problem

The subraces vertical (migration 051) modeled ability mods, speeds, darkvision
override, and **descriptive** `traits[]`. But several SRD subrace traits are actually
**player choices**, currently text-only:

- **High Elf** — *Cantrip*: one wizard cantrip of your choice.
- **High Elf** — *Extra Language*: one additional language of your choice.
- **Dark Elf (Drow)** — *Drow Magic*: Dancing Lights cantrip now; Faerie Fire at L3,
  Darkness at L5 (CHA-cast). The cantrip is the create-time part.
- **Forest Gnome** — *Natural Illusionist*: the Minor Illusion cantrip (fixed, not a
  choice — so this one is auto-grant, not a Selection).

These are exactly the `Selection` shape you already enforce for class/background
choices (`{ type, choose, level, options }`), just sourced from a **Subrace**. INCOMING
#13 explicitly deferred them: *"The Selection mechanic for these is a future Scope A
item."* Filing it now so it can land in parallel.

## Request — Subrace as a new Selection source (additive)

1. **`SubraceResponse.featureSelections: SelectionResponse[]`** (mirrors
   `ClassResponse.featureSelections` / `SubclassResponse.featureSelections`), e.g.:
   - High Elf → a `SelectionType.Skill`-style cantrip pick. **Question for you:** is a
     "choose 1 cantrip from the wizard list" best modeled as a new `SelectionType` (a
     `Spell`/`Cantrip` type) or reusing an existing one with the wizard-cantrip pool as
     `options`? Your call — we'll render whatever `type` + `options` you return.
   - High Elf → a `SelectionType.Language` pick (the type already exists, used by
     backgrounds — reuse it).
   - Dark Elf → the Dancing Lights cantrip (fixed grant or single-option Selection).

2. **`CharacterRequest`** — accept the chosen ids at creation. If the cantrip choice can
   reuse the existing `spellIds` field (the char already collects spells), that may need
   nothing new beyond surfacing the *requirement*; the extra **language** choice can reuse
   the existing language-selection plumbing. Tell us which request fields carry each pick.

3. **Auto-grants** (no choice) like Forest Gnome's Minor Illusion / Drow's higher-level
   spells — fold into the derived character (e.g. `Character.Spells` or a racial-spells
   passthrough) the same way racial weapon proficiencies already flow through; no request
   field needed. Surface them on `CharacterResponse` so we can display "racial spell".

## Frontend will

In the builder **Race** step, when a subrace with `featureSelections` is picked, render
its pickers (cantrip dropdown from the supplied options, language dropdown) right under
the subrace selector — same component we already use for class/background Selections.
Display auto-granted racial spells on the sheet's spell/traits block.

## Notes
- Lowest priority of the four requests filed today — it's a fidelity nicety, not a
  blocker. Sequence behind combat-resource-tracking and the spell-DC source class.
- Additive / non-breaking; enums numeric over the wire.
