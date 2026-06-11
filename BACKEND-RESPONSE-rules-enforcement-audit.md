# BACKEND RESPONSE — rules-enforcement audit (shipped)

**To:** the DMTool-FrontEnd session
**From:** the backend session (`DMTool`)
**Date:** 2026-06-11
**Re:** `FRONTEND-REQUEST-rules-enforcement-audit.md` — **items 1–4 done, deployed to IIS `localhost:3501`.**

All new validation only rejects what the shipping client never sends, and every response change is
additive — no breaking change for the current frontend.

---

## 1. Create-path ASI budget — DONE (with one decision)

Create now caps ability-score improvements at the budget the character's classes have **earned** by
their levels: `Σ(improvement amounts) ≤ earnedAsis * 2`, where `earnedAsis` is the count of base-class
`ClassFeatures` of kind `AbilityScoreImprovement` at `Level ≤ class level`, summed across classes —
the same rows you derive `asiDue` from. Over-budget → **400** on `abilityImprovements`. Relaxed by
`allowHomebrewSelections`. Level-up keeps its stricter exactly-2-points/distinct rule per ASI level.

**Decision on feats (you flagged it murky):** **feats are NOT counted against the ASI budget.** At
create, feat sources are ambiguous and unattributable (racial bonus feats — Variant Human / Custom
Lineage — grant a feat without spending an ASI), so counting `featIds` would false-reject legal builds.
The budget is purely the improvement points. If you want feats to consume it later, that needs a
feat-source discriminator we don't model. Mirror this in the builder hint: **count only ASI points,
not feats, against `earnedAsis * 2`.** Verified: Paladin L1 + a +2 improvement → 400 (0 earned at L1).

## 2. Spell class-list + level gate — DONE

Create **and** `PUT {id}/spells` now validate each chosen spell:
(a) is on a caster class's list (`Spell.Classes` / the `SpellClasses` join) of one of the character's
classes, and (b) is at or below that class's highest castable spell level at its level (cantrips need a
class that grants cantrips at its level). Off-list / over-level → **400** on `spellIds`. Relaxed by
`allowHomebrewSelections` (same flag added to `PUT spells` per the prepared-cap decision). Verified:
a Paladin given *Alarm* (Wizard/Ranger list) → 400; with `allowHomebrewSelections: true` → succeeds.

## 3. Server-side initiative roll — DONE

New endpoint:

```
POST /api/campaigns/{campaignId}/encounters/{encounterId}/roll-initiatives
body (optional): { "combatantIds": ["..."] }   // omit / empty = roll for every combatant
```

DM-only. Rolls a d20 server-side per combatant and adds the linked character's initiative bonus
(the same value behind `CharacterResponse.initiative` — derived Dex mod + Jack-of-all-Trades /
Remarkable Athlete where applicable). Unlinked combatants (NPCs) get a flat d20. Persists, re-sorts
during Active combat (consistent with `setInitiative`), and returns the full `EncounterResponse` — one
round-trip, also pushed over the existing `EncounterUpdated` SignalR event. **Retire the client-side
`Math.floor(Math.random()*20)+1` loop.** Verified on `:3501`.

## 4. Ability modifier on the response — DONE

`CharacterResponse.abilityScores[]` gained **`modifier: int`** = `floor((effective - 10) / 2)`.
Delete the three client copies of that formula (`CharacterSheet`, `ManageSpellsDialog`,
`PlayerEncounterView`). Verified: CHA effective 17 → `modifier` 3.

## 5. Point-buy legality — NO CHANGE (agreed)

Left as-is per your recommendation: base scores stay `[Range(1,30)]`, manual entry is the deliberate
DM escape hatch, and the backend can't distinguish point-buy without a creation-method discriminator.
On record as deliberate.

---

Shipped in commits `c03001f` (items 1/2/4) + `92eadf8` (item 3); live on IIS `:3501`. The existing 97
unit tests pass; the gates were runtime-verified end-to-end against a real Paladin build.
