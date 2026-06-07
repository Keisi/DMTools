import {
  SelectionType,
  SkillProficiencyLevel,
  type BackgroundResponse,
  type CharacterRequest,
  type CharacterResponse,
} from "./types";

/**
 * Build a faithful CharacterRequest from a loaded CharacterResponse so a PUT
 * round-trip (characters.update) doesn't wipe any stored field. This is the
 * supported way to add a class to an existing character — the level-up engine
 * rejects a class the character doesn't already have, so multiclassing-in goes
 * through update().
 *
 * `backgrounds` is used to recover which of the character's languages were the
 * background "languages of your choice" picks (the only languages the request
 * models as chosen; race/class-granted ones are re-derived server-side). When the
 * catalog isn't available, no chosen languages are sent — the grants still derive.
 *
 * `allowHomebrewSelections` is set so re-submitting already-granted skills /
 * languages doesn't bust the Selection subset/count budgets (level gates still
 * apply). Unlike the builder's edit path, this preserves each skill's *actual*
 * proficiency level, so Expertise is not downgraded to Proficient on round-trip.
 */
export function characterResponseToRequest(
  ch: CharacterResponse,
  backgrounds: BackgroundResponse[] = [],
): CharacterRequest {
  const bgLangSelection = backgrounds
    .find((b) => b.id === ch.background?.id)
    ?.selections.find((s) => s.type === SelectionType.Language);
  const bgLangOptionIds = new Set(
    bgLangSelection?.options.map((o) => o.optionId) ?? [],
  );
  const languageIds = ch.languages
    .filter((l) => bgLangOptionIds.has(l.id))
    .map((l) => l.id);

  return {
    name: ch.name,
    description: ch.description ?? undefined,
    raceId: ch.race?.id ?? "",
    classes: ch.classes.map((c) => ({
      classId: c.classId,
      level: c.level,
      subclassId: c.subclassId ?? undefined,
    })),
    // startingClassId is required once multiclassed; single-class lets the backend default it.
    startingClassId:
      ch.classes.length > 1
        ? (ch.startingClassId ?? ch.classes[0]?.classId ?? undefined)
        : undefined,
    abilityScores: ch.abilityScores.map((a) => ({
      statId: a.statId,
      value: a.base,
    })),
    spellSlots: ch.spellSlots,
    alignment: ch.alignment,
    experience: ch.experience,
    age: ch.age,
    hasJackOfAllTrades: ch.hasJackOfAllTrades,
    skillProficiencies: ch.skills
      .filter((s) => s.isProficient)
      .map((s) => ({
        skillId: s.skillId,
        level: s.level ?? SkillProficiencyLevel.Proficient,
      })),
    backgroundId: ch.background?.id ?? undefined,
    languageIds: languageIds.length ? languageIds : undefined,
    featIds: ch.feats.length ? ch.feats.map((f) => f.id) : undefined,
    armorId: ch.equippedArmor?.id ?? undefined,
    shieldId: ch.equippedShield?.id ?? undefined,
    equippedWeaponIds: ch.equippedWeapons.length
      ? ch.equippedWeapons.map((w) => w.id)
      : undefined,
    inventory: ch.inventory.length
      ? ch.inventory.map((i) => ({
          itemId: i.itemId,
          quantity: i.quantity,
          isAttuned: i.isAttuned,
        }))
      : undefined,
    copperPieces: ch.copperPieces,
    silverPieces: ch.silverPieces,
    electrumPieces: ch.electrumPieces,
    goldPieces: ch.goldPieces,
    platinumPieces: ch.platinumPieces,
    // Carry everything the level-up engine / builder also preserve so a PUT is lossless.
    hitPointsOverride: ch.hitPointsOverride ?? undefined,
    armorClassOverride: ch.armorClassOverride ?? undefined,
    spellIds: ch.spells.length ? ch.spells.map((s) => s.id) : undefined,
    statusEffects: ch.statusEffects.length
      ? ch.statusEffects.map((s) => ({
          statusEffectId: s.statusEffectId,
          source: s.source ?? undefined,
        }))
      : undefined,
    fightingStyleIds: ch.fightingStyles.length
      ? ch.fightingStyles.map((f) => f.id)
      : undefined,
    metamagicIds: ch.metamagics.length
      ? ch.metamagics.map((m) => m.id)
      : undefined,
    personalityTraits: ch.personalityTraits ?? undefined,
    ideals: ch.ideals ?? undefined,
    bonds: ch.bonds ?? undefined,
    flaws: ch.flaws ?? undefined,
    backstory: ch.backstory ?? undefined,
    height: ch.height ?? undefined,
    weight: ch.weight ?? undefined,
    eyes: ch.eyes ?? undefined,
    skin: ch.skin ?? undefined,
    hair: ch.hair ?? undefined,
    allowHomebrewSelections: true,
  };
}
