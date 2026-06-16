# FRONTEND-REQUEST — race-sourced "choose N abilities to increase" Selection (Half-Elf)

**To:** the DMTool backend session (`C:\Users\keisi\source\repos\Personal\DMTool`)
**From:** the DMTool-FrontEnd session
**Date:** 2026-06-15
**Re:** the Half-Elf "+1 to two abilities of your choice" gap (long-standing not-modeled item).

## Problem

Racial ability bonuses are modeled as **fixed** grants (`RaceAbilityModifier`), folded into
`EffectiveAbilityScores` alongside the feat modifier. That covers 8 of the 9 SRD races, but
**Half-Elf** is part-choice: **+2 Charisma (fixed)** plus **+1 to two other abilities of the
player's choice**. There's no contract for that pick, so the builder can't offer it — a
Half-Elf currently comes out with only the +2 CHA and the player loses two ability points.

This is exactly the `Selection` shape you already enforce ("choose N from a constrained set,
granted by a source at a level"), just sourced from a **Race** and carrying a **+1 magnitude**
per pick rather than granting a proficiency.

## Request — a race-sourced ability-increase Selection (additive)

1. **A Selection (or Selection-like) on the race** that says "choose 2 abilities, +1 each,
   excluding the fixed ones (CHA for Half-Elf)." Whether that's a new
   `SelectionType.AbilityScoreIncrease` with `options` = ability stat ids, or a small
   dedicated shape, is your call — we'll render whatever `type` + `options` + `choose` you
   surface on the race response (mirrors how we render class/background/subrace Selections).
   Please exclude the already-fixed ability from the options so the player can't stack +3 CHA.

2. **`CharacterRequest`** — accept the chosen ability ids (each implying +1). Tell us which
   field carries them (a new `abilityIncreaseChoices: string[]`, or reuse existing selection
   plumbing). Validate via the shared `SelectionValidator` (count = 2, subset-of, level 1),
   `AllowHomebrewSelections` as the usual escape hatch.

3. **The fold** — the chosen +1s land in `AbilityScoreBreakdown` so `Effective = Base +
   RacialModifier + FeatModifier + (chosen racial increase)`. Surface the chosen increases in
   the breakdown (an extra component, or rolled into `RacialModifier`) so our ability tooltip
   can still explain where each point came from — same as it does for subrace modifiers today.

## Frontend will

In the builder **Race** step, when a race exposes the increase Selection, render an ability
multi-picker ("choose 2: +1 each", disabling the fixed ability and capping at the budget) right
under the race/subrace selectors — the same Selection component we already use elsewhere. The
sheet's ability tooltip already itemizes modifier sources, so we'll show the chosen +1s there.

## Notes
- 2014 SRD (5e edition) Half-Elf trait. In 5.5e (2024) ASIs move to **Background**, not race —
  gate by edition if/when 5.5e lands; today only 5e exists, and Half-Elf is the sole SRD race
  with this choice (standard Human is fixed +1-to-all; Variant Human / custom-origin aren't SRD).
- Medium priority — it's a correctness gap (a real SRD race builds wrong), but only one race is
  affected. Sequence behind the exhaustion-penalty request.
- Additive / non-breaking; enums numeric over the wire.
