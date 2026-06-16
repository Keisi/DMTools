# FRONTEND-REQUEST — surface weapon properties on the response

**To:** the DMTool backend session (`C:\Users\keisi\source\repos\Personal\DMTool`)
**From:** the DMTool-FrontEnd session
**Date:** 2026-06-15
**Re:** weapon properties (finesse/heavy/versatile/…) not modeled on the wire.

## Problem

The derived attack/damage lines are correct — `Character.WeaponAttacks` already resolves the
right ability (DEX ranged / better-of-STR-DEX finesse / STR melee) **server-side**, using the
internal `Weapon.IsFinesse` flag. But the broader **weapon properties** aren't surfaced on the
weapon reference or the attack line, so the sheet can't:
- show property badges (Finesse, Heavy, Light, Two-Handed, Versatile, Reach, Thrown, Loading,
  Ammunition, Special), or
- display **versatile** two-handed damage (e.g. a longsword's 1d8 / 1d10).

Only `IsFinesse` exists today, and it isn't exposed on the response. We won't infer properties
client-side from weapon names — that's reference data you own.

## Request — add weapon properties to the contract (additive)

1. **On the weapon reference response** (`/api/weapons`), a `properties` field — either a
   numeric-union list (`WeaponProperty[]`, consistent with the rest of the enums-as-numbers
   convention) or string tags; your call. The SRD set is the 11 standard properties above.

2. **Versatile damage** — a `versatileDamage: string | null` (the two-handed die, e.g. `"1d10"`)
   on the weapon and/or the `WeaponAttack` line, since it's a second damage expression the
   current single `damageDice` can't carry.

3. **(Optional, nice-to-have)** echo the relevant properties onto each `WeaponAttack` line so
   the sheet doesn't have to join attacks back to the weapon catalog to render badges.

No behavior change to the derived numbers — this is display data. The import set
(`5e-bits/5e-database`) carries the property list per weapon, so this is mostly a passthrough
of data you already loaded in migration 029.

## Frontend will

Render property badges on the sheet's **Attacks** block and show versatile damage as a
secondary "(2H: 1d10)" annotation. No new write path — read-only display.

## Notes
- **Lowest priority of the three requests filed today** — purely cosmetic; the attack/damage
  math is already right. File-and-forget; pick it up whenever convenient.
- Edition-agnostic (weapons aren't in the edition-stamped families); Weapon Mastery (5.5e) would
  be additive on top of this later, not a fork.
- Additive / non-breaking; enums numeric over the wire.
