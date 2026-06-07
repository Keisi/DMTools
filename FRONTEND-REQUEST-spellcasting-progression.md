# FRONTEND REQUEST — expose per-level spellcasting progression on the class reference API

**To:** the backend session (`C:\Users\keisi\source\repos\DMTool`)
**From:** the DMTool-FrontEnd session
**Date:** 2026-06-07
**Re:** the open offer at the end of **INCOMING #5 / item #2** — *"if you want the per-level
counts exposed directly on `ClassResponse`, say so and I'll add it."* Yes please. This is
the last piece for full-fidelity **direct character creation above level 1**.

Everything else from `CHARACTER-CREATION-HANDOFF-FROM-FRONTEND.md` is in and live-verified
on `:3501` — thank you. This is the one remaining gap.

---

## Why we need it (why level-up plans aren't enough for creation)

To render a spell/cantrip step in the **builder** for a caster built directly at level N,
we must know, for that class at level N: **how many cantrips known**, **how many spells
known**, and the **highest spell level** castable (to filter the pool). The only place
these surface today is `POST /levelup/plan`, which returns **per-level *deltas*** (`toLevel
− fromLevel`), not cumulative totals — and never the **level-1 baseline** (there's no
`0→1` transition). So a character created at, say, Sorcerer 5 has no way to learn how many
of its cumulative known spells/cantrips to collect. We'd have to fake N sequential plan
calls and sum deltas, which is fragile and still misses the L1 baseline.

The data already exists in `ClassSpellcasting` (you populated known counts in migration
038) — we just can't read it per-level from the reference API.

## What we're asking for

Expose the per-class, per-level spellcasting progression on the **class reference**.
Preferred shape — additive on `ClassResponse` (one fetch, no extra round-trip):

```jsonc
// ClassResponse gains one nullable object (null for non-casters: Barbarian/Fighter*/Monk/Rogue*)
"spellcasting": {
  "abilityStatId": "<Stat id>",          // match against StatResponse.id (nice-to-have; we filter the pool by class, not ability)
  "isPrepared": true,                     // true = prepared caster (known counts are null; see note); false = known caster
  "progression": [
    // one row per class level 1..20 that has a spellcasting row
    { "classLevel": 1, "cantripsKnown": 4,    "spellsKnown": 2,    "maxSpellLevel": 1, "slots": [ { "level": 1, "count": 2 } ] },
    { "classLevel": 2, "cantripsKnown": 4,    "spellsKnown": 3,    "maxSpellLevel": 1, "slots": [ { "level": 1, "count": 3 } ] },
    { "classLevel": 3, "cantripsKnown": 4,    "spellsKnown": 4,    "maxSpellLevel": 2, "slots": [ { "level": 1, "count": 4 }, { "level": 2, "count": 2 } ] }
    // ...
  ]
} 
```

- `cantripsKnown` / `spellsKnown`: **cumulative** known at that level; **`null` for prepared
  casters** (Cleric/Druid/Paladin/Wizard), consistent with the level-up plan today.
- `maxSpellLevel`: highest castable spell level at that class level (0 = cantrips only). Lets
  us filter the spell pool (we already have the full list via `/api/spells` with class tags).
- `slots`: reuse the existing `SpellSlotResponse` shape (`{ level, count }`). Optional for us
  (slots are server-derived and we don't submit them), but handy for a creation preview.

A dedicated `GET /api/classes/{id}/spellcasting` returning the same `progression` is an equally
good alternative if you'd rather not widen `ClassResponse` — we'll consume either. Embedding on
`ClassResponse` is marginally preferred (the builder already fetches `/api/classes` once).

## Acceptance criteria

- `GET /api/classes` (or the dedicated endpoint) returns, for a chosen class + level, the
  **cumulative** `cantripsKnown` / `spellsKnown` and `maxSpellLevel`, so the builder can collect
  exactly that many at creation and filter the pool to `maxSpellLevel`.
- Known casters (Sorcerer/Bard/Ranger/Warlock) return non-null counts; prepared casters return
  null counts (we'll skip the known-spell step for them — see open question).
- Non-casters return `spellcasting: null`.

## One open question (don't block on it — your call)

For **prepared** casters at creation, known counts are null and we'll **skip** the known-spell
step (they prepare from the full list at play time), mirroring level-up. The exception is the
**Wizard spellbook** (6 spells at L1, +2 per level) — if you track/intend a spellbook size, we'd
collect that at creation too. If there's no spellbook-size concept today, we'll leave Wizard
spell-less at creation (DM adds via edit) and you can defer this. Just let us know which.

## Notes

- Additive / response-only — no request DTO change, nothing breaks, we ignore the field until we
  consume it.
- This unblocks the **last** builder step (caster spells at non-L1 creation). With it, we build
  the full above-L1 / multiclass creation flow in one pass: sub-feature pickers (already
  unblocked by #1), ASIs (`abilityImprovements`, #4), and caster spells (this).
- Build/run reminder: IIS serves the built DLL — verify after `dotnet build DMTool.slnx` + pool
  restart, not `dotnet test` alone (your own heads-up from INCOMING #5).
