// Shared, pure tooltip-text builders + roll-rider summaries for the character
// sheet and the combat views. Every function here is `(response) => string`
// (or a small map) with NO JSX and NO React — so the route sheet, the player
// combat card, and the encounter badges can all render identical hover copy
// from one source. Extracted from CharacterSheet.tsx / EncounterView.tsx
// (Phase 0 of COMBAT-UX-PLAN) with names preserved.
//
// Contract reminder: the API returns the DERIVED numbers (modifiers, DCs,
// breakdowns) — these builders only format what's already in the response,
// they never recompute a rule.
import {
  AdvantageState,
  RollModifierKind,
  RollTarget,
  type AbilityScoreResponse,
  type CharacterResponse,
  type RollAdvantageResponse,
  type RollModifierResponse,
  type SpellcastingResponse,
  type StatusEffectRollModifierResponse,
  type WeaponAttackResponse,
} from "../api/types";

export const fmtMod = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

// Exact composition of an effective ability score (all parts — including the
// modifier, since backend c03001f — are in the response; nothing is recomputed).
export const abilityBreakdown = (a: AbilityScoreResponse) => {
  const parts = [`Base ${a.base}`, `racial ${fmtMod(a.racialModifier)}`];
  if (a.subraceModifier !== 0) parts.push(`subrace ${fmtMod(a.subraceModifier)}`);
  parts.push(`feat ${fmtMod(a.featModifier)}`, `ASI ${fmtMod(a.improvementModifier)}`);
  return `${parts.join(" · ")}  =  ${a.effective} (mod ${fmtMod(a.modifier)})`;
};

// Weapon-attack hover: how the to-hit bonus and damage are composed. `modByName`
// maps ability name → modifier; `prof` is the proficiency bonus.
export const attackTip = (
  a: WeaponAttackResponse,
  modByName: Map<string, number>,
  prof: number,
): string => {
  const m = modByName.get(a.ability) ?? 0;
  const hit = a.isProficient
    ? `${a.ability} mod ${fmtMod(m)} + proficiency ${fmtMod(prof)}`
    : `${a.ability} mod ${fmtMod(m)} (not proficient)`;
  const dmg = a.damageDice
    ? ` · damage ${a.damageDice}${a.damageBonus !== 0 ? fmtMod(a.damageBonus) : ""}`
    : "";
  return `${hit} = ${fmtMod(a.attackBonus)} to hit${dmg}`;
};

// Spellcasting hover: how the save DC and spell attack bonus are composed.
export const casterTip = (
  sc: SpellcastingResponse,
  modByName: Map<string, number>,
  prof: number,
): string => {
  const m = modByName.get(sc.ability) ?? 0;
  return `Save DC = 8 + proficiency ${fmtMod(prof)} + ${sc.ability} mod ${fmtMod(m)} = ${sc.saveDc}\nSpell attack = proficiency + ability mod = ${fmtMod(sc.spellAttackBonus)}`;
};

// ---- Vital breakdown tooltips (HP / AC / Init / Speed / Prof / Pass.Perc) ----
// One builder per vital, derived entirely from the response's *Breakdown rows.
// Returned as a flat object so the sheet header can spread them into Vital props.

export interface VitalTips {
  hpTip: string;
  acTip: string;
  initTip: string;
  speedTip: string;
  profTip: string;
  percTip: string;
}

export function vitalTips(c: CharacterResponse): VitalTips {
  const dex = c.abilityScores.find((a) => a.name === "Dexterity");
  const perception = c.skills.find((s) => s.name === "Perception");
  // Component math from the server-supplied breakdowns (always the DERIVED
  // components, independent of any override — so the tooltip can show "derived
  // would be X" even when an override is set).
  const hb = c.hitPointBreakdown;
  const hpDerivedLine = `Hit dice ${hb.fromHitDice} + CON ${fmtMod(
    hb.fromConstitution,
  )}${hb.other !== 0 ? ` + other ${fmtMod(hb.other)}` : ""} = ${hb.total}`;
  const hpTip =
    typeof c.hitPointsOverride === "number"
      ? `Custom override ${c.maxHitPoints} (derived ${c.derivedMaxHitPoints}: ${hpDerivedLine})`
      : hpDerivedLine;
  const ab = c.armorClassBreakdown;
  const acDerivedLine = `${ab.source}: base ${ab.base} + DEX ${fmtMod(
    ab.dexterity,
  )}${ab.shield !== 0 ? ` + shield ${fmtMod(ab.shield)}` : ""}${
    ab.other !== 0 ? ` + other ${fmtMod(ab.other)}` : ""
  } = ${ab.total}`;
  const acTip =
    typeof c.armorClassOverride === "number"
      ? `Custom override ${c.armorClass} (derived ${c.derivedArmorClass}: ${acDerivedLine})`
      : acDerivedLine;
  const initTip = dex
    ? `Initiative = Dexterity modifier (${fmtMod(dex.modifier)})`
    : "Initiative = your Dexterity modifier";
  const speedTip = [
    `walk ${c.walkingSpeed}ft`,
    c.swimSpeed > 0 ? `swim ${c.swimSpeed}ft` : null,
    c.climbSpeed > 0 ? `climb ${c.climbSpeed}ft` : null,
    c.flySpeed > 0 ? `fly ${c.flySpeed}ft` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const profTip = `Proficiency bonus for character level ${c.level}`;
  const percTip = perception
    ? `10 + ${perception.bonus} Perception bonus`
    : "10 + your Perception bonus";
  return { hpTip, acTip, initTip, speedTip, profTip, percTip };
}

// ---- Roll-rider labels + summaries -------------------------------------------
// Two label maps, one per audience: the SHEET's long-form labels (used in the
// "At roll time" list) and the COMBAT short-form labels (used in compact badge
// tooltips). Both map the same RollTarget values — kept separate so neither
// reads awkwardly in its own context, no duplication of the summary logic.

// Long-form (sheet "At roll time" list). Flat modifiers are NOT shown — they're
// already folded into the saves/skills/attack numbers above (the backend's
// no-double-counting invariant); only dice + advantage/disadvantage ride here.
export const ROLL_TARGET_LABEL_LONG: Record<number, string> = {
  [RollTarget.AttackRoll]: "attack rolls",
  [RollTarget.SavingThrow]: "saving throws",
  [RollTarget.AbilityCheck]: "ability checks",
  [RollTarget.IncomingAttackRoll]: "attacks against you",
};

// Short-form (compact combat badge tooltips).
export const ROLL_TARGET_LABEL_SHORT: Record<RollTarget, string> = {
  [RollTarget.AttackRoll]: "attack",
  [RollTarget.SavingThrow]: "save",
  [RollTarget.AbilityCheck]: "check",
  [RollTarget.IncomingAttackRoll]: "attacks vs it",
};

export function riderLine(m: RollModifierResponse, statName: string | null): string {
  const sign = m.diceCount < 0 ? "−" : "+";
  const dice = `${sign}${Math.abs(m.diceCount)}d${m.dieSize}`;
  const scope = statName ? `${statName} ` : "";
  return `${dice} to ${scope}${ROLL_TARGET_LABEL_LONG[m.target] ?? "rolls"}`;
}

export function advantageLine(a: RollAdvantageResponse, statName: string | null): string {
  const word =
    a.state === AdvantageState.Advantage
      ? "Advantage"
      : a.state === AdvantageState.Disadvantage
        ? "Disadvantage"
        : "Straight roll (adv + disadv cancel)";
  const scope = statName ? `${statName} ` : "";
  return `${word} on ${scope}${ROLL_TARGET_LABEL_LONG[a.target] ?? "rolls"}`;
}

// A short human label for a status effect's roll riders, for badge tooltips. Flat
// riders are excluded — they're already folded into the sheet's derived numbers and
// shouldn't read as a separate "apply this" instruction.
export function summarizeRiders(
  mods: StatusEffectRollModifierResponse[] | undefined,
): string | null {
  if (!mods || mods.length === 0) return null;
  const parts = mods
    .filter((m) => m.kind !== RollModifierKind.Flat)
    .map((m) => {
      const tgt = ROLL_TARGET_LABEL_SHORT[m.target] ?? "roll";
      if (m.kind === RollModifierKind.Dice && m.diceCount && m.dieSize) {
        const sign = m.diceCount < 0 ? "−" : "+";
        return `${sign}${Math.abs(m.diceCount)}d${m.dieSize} ${tgt}`;
      }
      if (m.kind === RollModifierKind.Advantage) return `adv ${tgt}`;
      if (m.kind === RollModifierKind.Disadvantage) return `dis ${tgt}`;
      return null;
    })
    .filter((p): p is string => p !== null);
  return parts.length > 0 ? parts.join(" · ") : null;
}
