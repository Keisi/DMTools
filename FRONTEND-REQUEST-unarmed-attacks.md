# FRONTEND-REQUEST — Unarmed Strike in `weaponAttacks` (+ confirm Unarmored Defense AC)

**To:** the DMTool backend session (`C:\Users\keisi\source\repos\DMTool`)
**From:** the DMTool-FrontEnd session
**Date:** 2026-06-08
**Re:** Monks (and any barehanded character) show no attack on the sheet, because
the unarmed strike / Martial Arts die isn't in the contract.

## Problem
A character with no equipped weapon (e.g. a Monk) has an **empty
`CharacterResponse.weaponAttacks`**, so the sheet's Attacks block self-hides and
there's nothing to show — even though every character can always make an unarmed
strike, and a Monk's is a real, scaling attack (Martial Arts die).

The frontend deliberately does **not** compute attack dice/bonuses (this app's
rule is "derived server-side, render what's returned, never recompute"), so the
fix belongs in the backend. AC is already fine — `armorClassBreakdown.source`
reports `"Unarmored"` and the components, which the sheet renders.

## Request 1 — add an "Unarmed Strike" entry to `weaponAttacks` (additive)
Return one extra `WeaponAttackResponse` (the existing shape — **no DTO change**)
for every character, so the sheet renders it with zero frontend changes:

```jsonc
{
  "weaponId": "<stable sentinel>",   // fixed GUID or "unarmed" — the UI uses it only as a React key
  "name": "Unarmed Strike",          // (or "Martial Arts" for Monks — your call)
  "ability": "Strength",             // Monks: the better of Strength/Dexterity (Martial Arts)
  "attackBonus": 5,                  // ability mod + proficiency (unarmed strikes are ALWAYS proficient)
  "damageDice": "1d6",               // Monk Martial Arts die by monk level (see below); null/"1" for non-Monks
  "damageBonus": 3,                  // the chosen ability mod
  "isProficient": true
}
```

- **Monk Martial Arts die** by monk level: `1d4` (L1–4), `1d6` (5–10), `1d8`
  (11–16), `1d10` (17+). Use the better of STR/DEX for both attack and damage.
- **Non-Monks:** flat **1 + STR** bludgeoning — `damageDice: null` (or `"1"`) and
  `damageBonus = STR mod`. Always proficient.
- The frontend keys attack rows on `weaponId`, so it must be present + stable
  (any non-empty string/GUID is fine; just not duplicated with a real weapon).

That's all the frontend needs — the Attacks block already renders `name`,
`attackBonus`, `damageDice`/`damageBonus`, and the proficiency dot + tooltip.

## Request 2 — confirm Unarmored Defense is in `armorClassBreakdown`
Please verify the AC for the unarmored-defense classes is computed correctly:
- **Monk:** 10 + DEX + WIS
- **Barbarian:** 10 + DEX + CON
- **Draconic Sorcerer:** 13 + DEX (while not wearing armor)

On a test Monk (Roxx) the AC read **12 = 10 + 2 DEX**, which *looked* like WIS
wasn't being added (or WIS mod happened to be 0). If Unarmored Defense isn't
applied, fold it into the breakdown (the WIS/CON contribution can go in `base` or
`other`). Ideally set `armorClassBreakdown.source` to something like
`"Unarmored Defense (Monk)"` so the sheet can show *why* the AC is what it is.
**No shape change** — just correct components + a clearer `source` label.

## Frontend status / interim
- The sheet's Equipped block no longer self-hides when nothing is worn: it shows
  the **Unarmored AC** line (from `armorClassBreakdown`) and a neutral
  **"No weapons equipped"** row.
- Once Request 1 ships, the unarmed strike will appear in the **Attacks** block
  automatically (with the correct die), and we'll drop the interim weapons note.

No rush; this is a polish/correctness item, not a blocker.
