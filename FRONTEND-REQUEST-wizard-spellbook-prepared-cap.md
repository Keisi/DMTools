# FRONTEND-REQUEST — reconcile the Wizard spellbook with the prepared-spell cap

**To:** the DMTool backend session (`C:\Users\keisi\source\repos\Personal\DMTool`)
**From:** the DMTool-FrontEnd session
**Date:** 2026-06-14
**Re:** a collision between two already-shipped features —
[`FRONTEND-REQUEST-prepared-spell-cap.md`] (the prepared-spell cap, INCOMING) and
[`FRONTEND-REQUEST-wizard-spellbook.md`] (Wizard `spellbookSize`, INCOMING #24).
Both landed; together they make a **correct** Wizard spellbook **un-submittable**
without `allowHomebrewSelections`.

## What prompted this

A new pure-HTTP e2e harness (`tests/api-e2e/` in the frontend repo) walks every
class 1→20 via `levelup/plan` + `levelup/apply`. Every class passes **except**
Wizard, which `400`s the moment its spellbook outgrows the prepared cap (L5).

The prepared-spell-cap request deliberately scoped the spellbook **out**, saying
the only cap wanted was `maxPrepared = INT mod + level`, and *"if you ever add a
spellbook size, that's a separate field — out of scope here."* The wizard-spellbook
request then **added** `spellbookSize` (6 at L1, +2/level → 44 at L20) and asked
the level-up plan to surface the delta as `newSpells: 2`. Both shipped — but the
spellbook spells are stored in the **same flat levelled-spell list** the prepared
cap counts, so the cap now gates the spellbook itself.

## Evidence (live, 2026-06-14)

Wizard `spellbookSize` is correct on the plan/progression: L1 **6**, L2 8, L3 10,
L4 12, L5 **14** … L20 **44**. But `maxPreparedSpells` for a L5 Wizard (INT 15,
+2) is **7**. Creating a L5 Wizard with its **correct 14-spell spellbook** (no
homebrew flag):

```
POST /api/character  { classes:[{Wizard, level:5}], spellIds:[14 wizard L1 spells] }
-> 400 { "SpellIds": [
   "This character can prepare at most 7 levelled spells (sum of per-class prepared
    caps and known-caster spells known); 14 levelled spells were submitted.
    Set allowHomebrewSelections to override." ] }
```

The identical body with `allowHomebrewSelections: true` succeeds and stores all 14
(and the response still reports `maxPreparedSpells: 7`). So the spellbook *can*
hold 14 — the cap is just the wrong limit for it.

The same failure hits `levelup/apply`: from L5 on, the plan's `newSpells` delta
pushes the cumulative stored list past `maxPrepared`, and every Wizard level-up
`400`s without homebrew. (The harness works around it by retrying with the
homebrew flag and recording this as a finding — that workaround is the bug, made
visible.)

## Root cause

For a Wizard, the stored levelled-spell list **is the spellbook**, not a list of
*prepared* spells. RAW these are different quantities: the spellbook holds up to
`spellbookSize` (44 by L20); the wizard prepares only `INT mod + level` of them
each day. The prepared cap (`maxPrepared`) is a **daily-preparation** limit; it
should not bound what's stored in the book. Because we store one flat list and the
cap counts it, the two concepts are conflated — and the bigger number (spellbook)
loses to the smaller one (prepared cap).

## Request — cap the stored list by the spellbook size for spellbook casters

For a class that exposes `spellbookSize` (Wizard, and any future spellbook caster),
the authoritative cap on its **stored** levelled spells is `spellbookSize` at the
character's class level — **not** `maxPrepared`. Concretely, in the aggregate cap
the prepared-spell-cap request enforces on create / update-spells / level-up apply,
swap the per-class term:

```
allowedLevelledSpells = Σ over caster classes of:
    spellbookSize(classLevel)   if the class is a spellbook caster   // NEW: Wizard
    maxPrepared(classLevel)     else if prepared                      // Cleric/Druid/Paladin
    spellsKnown(classLevel)     else (known)                          // Bard/Sorcerer/Ranger/Warlock
```

- Single-class Wizard L5 → cap **14** (was 7); L20 → **44**. A 14-spell L5
  spellbook is accepted without `allowHomebrewSelections`.
- `maxPrepared` (INT mod + level) stays exactly as-is as the **display/daily-prep**
  number on the response — we still show it; it just stops being the *storage* gate
  for spellbook casters. (If you'd rather drop `maxPreparedSpells` entirely for
  Wizard and only surface `spellbookSize`, that's fine too — your call; we can
  render either.)
- Everything else unchanged: cantrips by `cantripsKnown`; prepared non-Wizard
  casters still gated by `maxPrepared`; known casters by `spellsKnown`;
  `allowHomebrewSelections` still relaxes the whole thing.

This is the smallest change consistent with the existing aggregate-cap design — it
only refines which per-class number feeds the sum.

## Acceptance criteria

- Create / `PUT {id}/spells` / `levelup/apply` for a **single-class Wizard** accepts
  exactly `spellbookSize(level)` levelled spells (L1 → 6, L5 → 14, L20 → 44) with
  **no** `allowHomebrewSelections`; one over → `400`.
- A Wizard can be walked 1→20 via `levelup/plan`+`apply` (taking the plan's
  `newSpells` delta each level) **without** ever needing the homebrew flag.
- Non-Wizard prepared casters (Cleric/Druid/Paladin) and known casters
  (Bard/Sorcerer/Ranger/Warlock) are unchanged — no regression to their caps.
- Multiclass (e.g. Wizard X / Cleric Y): aggregate cap =
  `spellbookSize(WizardLevel) + maxPrepared(ClericLevel)`; document the choice in
  `LEVELUP-ENGINE.md` like the existing aggregate-cap note.

## Notes

- Repro lives in the frontend harness: `node tests/api-e2e/run.mjs` (Suite A,
  Wizard) reports the finding; `SUITES=B` over-cap negatives confirm the other
  caps still hold. No frontend change is needed once this ships — we just drop the
  homebrew workaround in the harness.
- Additive/validation-only; no migration, no contract break (the
  `spellbookSize` field already exists from INCOMING #24).
- Build/run reminder: IIS serves the built DLL — verify after
  `dotnet build DMTool.slnx` + pool restart, not `dotnet test` alone.
