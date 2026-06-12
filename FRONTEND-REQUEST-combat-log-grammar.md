# FRONTEND-REQUEST — fix status-effect combat-log grammar

**To:** the DMTool backend session (`C:\Users\keisi\source\repos\Personal\DMTool`)
**From:** the DMTool-FrontEnd session
**Date:** 2026-06-12
**Re:** log text reads "X is now Bless." — the templates treat an effect name as an adjective.

## Problem

Combat-log messages are server-rendered (the frontend renders `message` verbatim, by
design — it never composes log text). The status-effect templates produce ungrammatical
lines, observed live today:

```
Theren is now Bless.
Theren is no longer Bless.
Goblin Boss is now Bless.
Keisi is now Exhaustion (Level 1).
```

"Bless"/"Exhaustion" are nouns (effect names), so "is now <noun>" only works by accident
for adjective-shaped conditions ("is now Blinded" reads fine, "is now Bless" doesn't).

## Request — verb the templates, not the names

Change the apply/remove templates in `CombatLogMessages` to a verb form that works for
every effect name:

```
{combatant} gains {effect}.          // apply
{combatant} loses {effect}.          // manual remove / consumed-on-use
```

And sweep the rest of the status-effect message family for the same pattern — at least:
- the duration-expiry line added in migration 063 (`StatusEffectExpired`) — suggest
  `{combatant}'s {effect} expires.` if it isn't already verb-shaped;
- the concentration-sweep removals — suggest `{combatant} loses {effect} (concentration broken).`

No DTO/shape change — `message` stays a server-rendered string; existing stored log rows
can stay as-is (history is history; only new entries need the fix). Frontend has **zero**
work here — we render whatever you send.

## Notes
- Smallest request of today's batch — a string-template fix + tests.
- If you'd rather "is now affected by {effect}", also fine — your wording call; "gains/
  loses" is just the shortest form that reads correctly for both buffs and conditions.
