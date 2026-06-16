# FRONTEND-REQUEST — derive 5e exhaustion penalties from `exhaustionLevel`

**To:** the DMTool backend session (`C:\Users\keisi\source\repos\Personal\DMTool`)
**From:** the DMTool-FrontEnd session
**Date:** 2026-06-15
**Re:** the deferred exhaustion-penalty ask noted when INCOMING #31/#32 (per-campaign state) shipped.

## Problem

INCOMING #31 added `exhaustionLevel` (0–6) to `CampaignCharacterSheetResponse`, and #32
made it a settable stepper. But it is **store-only** — by your own note, the embedded
`character` block does **not** reflect any exhaustion penalty, so our panel can only render
the level as a badge. At the table that means a DM sets a character to Exhaustion 3 and the
sheet's attack rolls / saving throws / speed look unchanged, so the mechanical effect has to
be tracked in someone's head. Per our standing rule we won't compute the 5e penalty ladder
client-side — it's a rules derivation you own.

You already have most of the machinery: the buffs system (migrations 061–063) seeded the
**Exhaustion** condition with advantage/disadvantage riders, and the campaign sheet already
folds per-campaign status effects into the returned `character`. The gap is that the
**`exhaustionLevel` scalar isn't wired to the level-scaled, cumulative ladder** — it's a
single number that produces no derived effect.

## Request — fold the cumulative exhaustion ladder into the derived character (additive)

When assembling `CampaignCharacterSheetResponse.character` (and `currentHp`/`maxHp` on the
sheet), apply the 2014 SRD exhaustion table cumulatively from `exhaustionLevel`, surfacing
through the channels the frontend already renders (`rollAdvantages`, `walkingSpeed`/other
speeds, `maxHitPoints`) — nothing new on the wire if possible:

| Level | Effect | Suggested channel |
|---|---|---|
| ≥1 | Disadvantage on **ability checks** (incl. skills, passive ⇒ −5, initiative) | `rollAdvantages` `AbilityCheck` = Disadvantage |
| ≥2 | **Speed halved** | derived `walkingSpeed` (+ swim/climb/fly) ÷2 |
| ≥3 | Disadvantage on **attack rolls** and **saving throws** | `rollAdvantages` `AttackRoll` + `SavingThrow` = Disadvantage |
| ≥4 | **HP maximum halved** | derived `maxHitPoints` (and the sheet's `maxHp`) ÷2 |
| ≥5 | **Speed reduced to 0** | derived speeds = 0 |
| 6 | Death | a flag is fine — DM handles narratively; no derivation needed |

Effects are cumulative (level 3 also carries 1 and 2). The advantage/disadvantage entries
should flow through the **existing** `rollAdvantages` net-cancelling path (5e presence-not-count),
so a separately-applied Bless etc. cancels correctly — same invariant as the buffs system.
**Don't** add flat roll modifiers for these (disadvantage is not a number) and don't
double-count against the seeded Exhaustion *status-effect* riders — if that catalog entry
overlaps, derive from the scalar and treat the catalog row as descriptive, or tell us which
is authoritative.

This is a per-campaign derivation: the base character sheet (outside a campaign) carries no
exhaustion, so the fold belongs in the campaign-sheet assembly, alongside the per-campaign
status-effect application you already do.

## Frontend will

Drop the "render level only" caveat in `CampaignCharacterPanel`. We already render
`rollAdvantages`, derived AC/initiative/speed, and HP — so once the `character` block
reflects the ladder it surfaces automatically. We'll add a small tooltip listing the active
penalties for the current level so the DM sees *why* the numbers moved.

## Notes
- **Highest priority of the three requests filed today** — it's the one that affects live play.
- 2014 SRD (5e edition) ladder; the 2024 (5.5e) exhaustion rule differs (flat −2 per level to
  d20 rolls) — gate by edition if/when 5.5e data lands, but 5e is all that exists today.
- Additive / non-breaking; enums numeric over the wire. No new request field — this is
  derivation only, driven by the existing `exhaustionLevel`.
