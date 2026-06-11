/* ============================================================================
   API types — a faithful mirror of the DMTool backend DTOs.

   SOURCE OF TRUTH (read these, not this file, when in doubt):
     DMTool\DMTool\Models\Characters\CharacterContracts.cs   (character + level-up)
     DMTool\DMTool\Models\Reference\ReferenceContracts.cs    (reference data)
     DMTool\DMTool\Models\Auth\AuthContracts.cs              (auth)
     DMTool\DMTool.Entities\Enums\*.cs                       (enum numeric values)

   Two backend conventions baked in here:
   - JSON is camelCase (ASP.NET Core web defaults) — C# `ClassId` -> `classId`.
   - ENUMS SERIALIZE AS NUMBERS (no JsonStringEnumConverter). Modeled below as
     const-object + numeric union (tsconfig `erasableSyntaxOnly` forbids TS enums).

   Homebrew create-request DTOs (RaceCreateRequest, SpellCreateRequest, ...) are
   NOT modeled yet — add them from ReferenceContracts.cs when a screen POSTs them.
   ========================================================================== */

// ---- Enums (numeric over the wire) ----

export const Alignment = {
  LawfulGood: 0,
  NeutralGood: 1,
  ChaoticGood: 2,
  LawfulNeutral: 3,
  TrueNeutral: 4,
  ChaoticNeutral: 5,
  LawfulEvil: 6,
  NeutralEvil: 7,
  ChaoticEvil: 8,
} as const;
export type Alignment = (typeof Alignment)[keyof typeof Alignment];

export const HitDie = {
  D4: 4,
  D6: 6,
  D8: 8,
  D10: 10,
  D12: 12,
} as const;
export type HitDie = (typeof HitDie)[keyof typeof HitDie];

export const Size = {
  Tiny: 0,
  Small: 1,
  Medium: 2,
  Large: 3,
  Huge: 4,
  Gargantuan: 5,
} as const;
export type Size = (typeof Size)[keyof typeof Size];

export const SkillProficiencyLevel = {
  Proficient: 1,
  Expertise: 2,
} as const;
export type SkillProficiencyLevel =
  (typeof SkillProficiencyLevel)[keyof typeof SkillProficiencyLevel];

export const SpellSchool = {
  Abjuration: 0,
  Conjuration: 1,
  Divination: 2,
  Enchantment: 3,
  Evocation: 4,
  Illusion: 5,
  Necromancy: 6,
  Transmutation: 7,
} as const;
export type SpellSchool = (typeof SpellSchool)[keyof typeof SpellSchool];

export const ResistanceKind = {
  Resistance: 0,
  Immunity: 1,
  Vulnerability: 2,
} as const;
export type ResistanceKind =
  (typeof ResistanceKind)[keyof typeof ResistanceKind];

export const ResourceRecharge = {
  None: 0,
  ShortRest: 1,
  LongRest: 2,
} as const;
export type ResourceRecharge =
  (typeof ResourceRecharge)[keyof typeof ResourceRecharge];

export const FeatureKind = {
  Normal: 0,
  AbilityScoreImprovement: 1,
  Subclass: 2,
} as const;
export type FeatureKind = (typeof FeatureKind)[keyof typeof FeatureKind];

export const SelectionType = {
  Skill: 1,
  Subclass: 2,
  Language: 3,
  FightingStyle: 4,
  Expertise: 5,
  Metamagic: 6,
  EldritchInvocation: 7,
  Tool: 8,
} as const;
export type SelectionType = (typeof SelectionType)[keyof typeof SelectionType];

export const EncumbranceLevel = {
  Unencumbered: 0,
  Encumbered: 1,
  HeavilyEncumbered: 2,
} as const;
export type EncumbranceLevel =
  (typeof EncumbranceLevel)[keyof typeof EncumbranceLevel];

export const EffectTarget = {
  HitPoints: 0,
  ArmorClass: 1,
  Initiative: 2,
  WalkingSpeed: 3,
} as const;
export type EffectTarget = (typeof EffectTarget)[keyof typeof EffectTarget];

export const EffectScaling = {
  Flat: 0,
  PerLevel: 1,
} as const;
export type EffectScaling = (typeof EffectScaling)[keyof typeof EffectScaling];

export const LevelUpHitPointMode = {
  Average: 0,
  Roll: 1,
} as const;
export type LevelUpHitPointMode =
  (typeof LevelUpHitPointMode)[keyof typeof LevelUpHitPointMode];

// ---- Auth (AuthContracts.cs) ----

/** Both register and login take { username, password }. */
export interface AuthRequest {
  username: string;
  password: string;
}
export interface AuthResponse {
  token: string;
  expiresAtUtc: string; // ISO-8601 (C# DateTime)
  username: string;
}

// ---- Reference data (ReferenceContracts.cs) ----

export interface StatResponse {
  id: string;
  name: string;
  description?: string | null;
  isDefault: boolean;
  code?: string | null; // "STR","DEX","CON",... (rules-significant)
}

export interface LanguageResponse {
  id: string;
  name: string;
  description?: string | null;
}

export interface DamageTypeResponse {
  id: string;
  name: string;
  description?: string | null;
  code?: string | null;
}

export interface RaceAbilityModifierResponse {
  statId: string;
  stat: string;
  modifier: number;
}

export interface RaceDamageResistanceResponse {
  damageTypeId: string;
  damageType: string;
  code?: string | null;
  kind: ResistanceKind;
}

export interface SubraceResponse {
  id: string;
  raceId: string;
  name: string;
  description?: string | null;
  abilityModifiers: RaceAbilityModifierResponse[];
  bonusHpPerLevel: number;
  walkingSpeedBonus: number;
  darkvisionOverride: number;
  traits: { name: string; description?: string | null }[];
}

export interface RaceResponse {
  id: string;
  name: string;
  description?: string | null;
  size: Size;
  walkingSpeed: number;
  swimSpeed: number;
  climbSpeed: number;
  flySpeed: number;
  darkvisionRange: number;
  // Other senses (feet; 0 = none). All SRD player races are 0 — these exist for
  // homebrew races (backend migration 044).
  blindsightRange: number;
  tremorsenseRange: number;
  truesightRange: number;
  abilityModifiers: RaceAbilityModifierResponse[];
  languages: LanguageResponse[];
  damageResistances: RaceDamageResistanceResponse[];
  traits: { name: string; description?: string | null }[];
  subraces: SubraceResponse[];
}

export interface SkillResponse {
  id: string;
  name: string;
  description?: string | null;
  abilityStatId: string;
  ability?: string | null;
  code?: string | null;
}

export interface SpellResponse {
  id: string;
  name: string;
  description?: string | null;
  level: number;
  school: SpellSchool;
  castingTime?: string | null;
  range?: string | null;
  components?: string | null;
  duration?: string | null;
  concentration: boolean;
  ritual: boolean;
  higherLevel?: string | null;
  classes: string[];
  // Structured combat fields (backend mig. 049; all nullable/best-effort). A spell
  // is either usesSpellAttack OR has a saveStatId, or neither (utility). scalingDice
  // is free text.
  damageDice?: string | null;
  damageType?: NamedRef | null;
  healingDice?: string | null;
  scalingDice?: string | null;
  usesSpellAttack: boolean;
  saveStatId?: string | null;
  saveAbility?: string | null;
  // Tier 2 per-character scaling (backend mig. 050). kind:"slot" keys are slot
  // levels; kind:"cantrip" keys are character-level milestones 1/5/11/17. Values
  // are fully-resolved dice strings. null for unscaled spells.
  scaling?: { kind: "slot" | "cantrip"; diceByLevel: Record<string, string> } | null;
}

export interface ItemResponse {
  id: string;
  name: string;
  description?: string | null;
  weight: number;
  cost: number;
  isMagic: boolean;
  requiresAttunement: boolean;
  category?: string | null;
  rarity?: string | null;
}

// Selections: 5e's generalized "choose N from a set" (skills, subclass, languages).
export interface SelectionOptionResponse {
  optionId: string;
  name: string;
}
export interface SelectionResponse {
  id: string;
  name: string;
  type: SelectionType;
  choose: number;
  level: number;
  options: SelectionOptionResponse[];
}

export interface SubclassFeatureResponse {
  name: string;
  description?: string | null;
  level: number;
}
export interface SubclassResponse {
  id: string;
  name: string;
  description?: string | null;
  features: SubclassFeatureResponse[];
  // Sub-feature choices the subclass's features force (e.g. Champion's extra
  // Fighting Style at L10). Same type-4/5/6 shape as ClassResponse.featureSelections.
  featureSelections: SelectionResponse[];
}

// A class's per-level spellcasting row (ClassResponse.spellcasting.progression).
// Known counts are CUMULATIVE totals at that level; both null for prepared casters.
// Only levels that have a spellcasting row are present (e.g. Ranger has no L1 row).
export interface ClassSpellcastingProgressionResponse {
  classLevel: number;
  cantripsKnown?: number | null;
  spellsKnown?: number | null;
  maxSpellLevel: number; // highest castable spell level (0 = cantrips only)
  slots: SpellSlotResponse[];
}
export interface ClassSpellcastingResponse {
  abilityStatId: string; // casting ability (match StatResponse.id)
  isPrepared: boolean; // prepared caster → known counts null; skip the known-spell step
  progression: ClassSpellcastingProgressionResponse[];
}

export interface ClassFeatureResponse {
  name: string;
  description?: string | null;
  kind: FeatureKind;
  level: number;
}

/** A "class" (Job on the backend). */
export interface ClassResponse {
  id: string;
  name: string;
  description?: string | null;
  hitDie: HitDie;
  selections: SelectionResponse[];
  subclasses: SubclassResponse[];
  // Sub-feature choices the class's features force (Fighting Style / Expertise /
  // Metamagic), each with type (4/5/6), choose, level, and options. Expertise
  // (type 5) carries an EMPTY options[] — its pool is the character's proficient
  // skills. Render a picker per entry whose level <= the chosen class level.
  featureSelections: SelectionResponse[];
  // Per-level spellcasting progression (null for non-casters). Lets the builder
  // collect the level-appropriate cantrips/spells at direct creation.
  spellcasting?: ClassSpellcastingResponse | null;
  // Proficiency grants — category ids match Armor/Weapon/Tool .*CategoryId;
  // item ids match the Armor/Weapon/Tool id. SRD classes grant by category
  // (item lists usually empty); homebrew per-item grants populate the item lists.
  weaponProficiencies: WeaponProficienciesResponse;
  armorProficiencies: ArmorProficienciesResponse;
  toolProficiencies: ToolProficienciesResponse;
  // 5e primary ability/abilities; each .id is a Stat id (match StatResponse.id).
  primaryAbilities: NamedRef[];
  features: ClassFeatureResponse[];
}

export interface EditionResponse {
  id: string;
  name: string;
  description?: string | null;
  code?: string | null;
  isDefault: boolean;
  // Minimum ability score (in a class's primary ability/abilities) required to
  // multiclass into/out of it under this edition (backend migration 046). null =
  // inherit the system default (currently 13) — NOT "no rule". Prefer the
  // level-up plan's per-ability minimumScore over `?? 13` for display.
  multiclassMinimumAbilityScore?: number | null;
}

export interface FeatAbilityModifierResponse {
  statId: string;
  stat?: string | null;
  modifier: number;
}
export interface FeatEffectResponse {
  target: EffectTarget;
  amount: number;
  scaling: EffectScaling;
}
export interface FeatResponse {
  id: string;
  name: string;
  description?: string | null;
  prerequisite?: string | null;
  abilityModifiers: FeatAbilityModifierResponse[];
  effects: FeatEffectResponse[];
}

export interface BackgroundProficiencyRef {
  id: string;
  name: string;
}
export interface BackgroundResponse {
  id: string;
  name: string;
  description?: string | null;
  featureName: string;
  featureDescription?: string | null;
  equipment?: string | null;
  startingGold: number;
  skills: BackgroundProficiencyRef[];
  tools: BackgroundProficiencyRef[];
  languages: BackgroundProficiencyRef[];
  selections: SelectionResponse[];
}

export interface StatusEffectEffectResponse {
  target: EffectTarget;
  amount: number;
  scaling: EffectScaling;
}
export interface StatusEffectResponse {
  id: string;
  name: string;
  description?: string | null;
  isBeneficial: boolean;
  effects: StatusEffectEffectResponse[];
}

export interface WeaponCategoryResponse {
  id: string;
  name: string;
  description?: string | null;
}
export interface WeaponResponse {
  id: string;
  name: string;
  description?: string | null;
  weaponCategoryId: string;
  weaponCategory?: string | null;
  damage?: string | null;
  isRanged: boolean;
  isFinesse: boolean;
}

export interface ArmorCategoryResponse {
  id: string;
  name: string;
  description?: string | null;
}
export interface ArmorResponse {
  id: string;
  name: string;
  description?: string | null;
  armorCategoryId: string;
  armorCategory?: string | null;
  baseArmorClass: number;
  maxDexBonus?: number | null;
  addsDexModifier: boolean;
  isShield: boolean;
  strengthRequirement?: number | null;
  stealthDisadvantage: boolean;
}

export interface ToolCategoryResponse {
  id: string;
  name: string;
  description?: string | null;
}
export interface ToolResponse {
  id: string;
  name: string;
  description?: string | null;
  toolCategoryId: string;
  toolCategory?: string | null;
}

// Sub-feature catalogs (GET /api/fightingstyles, /api/metamagics). The level-up
// plan already carries the relevant options inline; fetch these only for a
// standalone "browse" view.
export interface FightingStyleResponse {
  id: string;
  name: string;
  description?: string | null;
}
export interface MetamagicResponse {
  id: string;
  name: string;
  description?: string | null;
}
// GET /api/eldritchinvocations (Warlock). Plans carry options inline (Type 7);
// fetch this only for a standalone browse view. Prerequisites live in the text.
export interface EldritchInvocationResponse {
  id: string;
  name: string;
  description?: string | null;
}

// ---- Character: request (CharacterContracts.cs / CharacterRequest) ----

export interface CharacterClassRequest {
  classId: string;
  level: number;
  subclassId?: string | null;
}
export interface AbilityScoreRequest {
  statId: string;
  value: number; // BASE score (1-30); racial/feat mods are applied server-side
}
/** Exactly one of category / item id must be set. */
export interface WeaponProficiencyRequest {
  weaponCategoryId?: string | null;
  weaponId?: string | null;
}
export interface ArmorProficiencyRequest {
  armorCategoryId?: string | null;
  armorId?: string | null;
}
export interface ToolProficiencyRequest {
  toolCategoryId?: string | null;
  toolId?: string | null;
}
export interface SkillProficiencyRequest {
  skillId: string;
  level?: SkillProficiencyLevel; // defaults to Proficient
}
export interface InventoryItemRequest {
  itemId: string;
  quantity?: number; // default 1
  isAttuned?: boolean;
}
export interface CharacterStatusEffectRequest {
  statusEffectId: string;
  source?: string | null;
}

/** PHB "Character Details" + appearance — free-text, pure narrative (no rules
 *  effect), round-tripped on both request and response. All optional/nullable.
 *  Short-text fields (height/weight/eyes/skin/hair) reject > 50 chars with 400
 *  on the request; the long-text fields are unbounded. */
export interface CharacterDetails {
  personalityTraits?: string | null;
  ideals?: string | null;
  bonds?: string | null;
  flaws?: string | null;
  backstory?: string | null;
  height?: string | null;
  weight?: string | null;
  eyes?: string | null;
  skin?: string | null;
  hair?: string | null;
}

/**
 * The create/update payload. Minimum to create: name, raceId, >=1 classes
 * (levels summing to <=20), >=1 abilityScores (every IsDefault stat present).
 * startingClassId is the sole source of save proficiencies + the maxed HP die
 * (defaults to the only class when single-classed). Everything else is optional.
 * Derived values (level, modifiers, HP, AC, ...) are NOT submitted.
 */
export interface CharacterRequest extends CharacterDetails {
  name: string;
  description?: string | null;
  raceId: string;
  subraceId?: string | null;
  classes: CharacterClassRequest[];
  abilityScores: AbilityScoreRequest[];
  spellSlots: number;
  alignment: Alignment;
  experience: number;
  age: number;
  hitPointsOverride?: number | null;
  armorClassOverride?: number | null;
  armorId?: string | null;
  shieldId?: string | null;
  equippedWeaponIds?: string[] | null;
  weaponProficiencyAdditions?: WeaponProficiencyRequest[] | null;
  armorProficiencyAdditions?: ArmorProficiencyRequest[] | null;
  toolProficiencyAdditions?: ToolProficiencyRequest[] | null;
  startingClassId?: string | null;
  savingThrowProficiencyAdditions?: string[] | null;
  skillProficiencies?: SkillProficiencyRequest[] | null;
  hasJackOfAllTrades: boolean;
  // Champion's Remarkable Athlete: half proficiency (rounded up) to untrained
  // STR/DEX/CON checks + initiative. Optional, defaults false (backend mig. 044).
  hasRemarkableAthlete?: boolean;
  spellIds?: string[] | null;
  featIds?: string[] | null;
  backgroundId?: string | null;
  editionId?: string | null; // locked after creation
  languageIds?: string[] | null;
  allowHomebrewSelections?: boolean;
  inventory?: InventoryItemRequest[] | null;
  // Sub-feature picks settable at creation (e.g. a Fighter built directly at a
  // level that already has a style). Existence-checked; expertise is set via
  // skillProficiencies[].level = 2, not here.
  fightingStyleIds?: string[] | null;
  metamagicIds?: string[] | null;
  // Warlock Eldritch Invocations chosen at creation. Existence-checked; the
  // catalog is GET /api/eldritchinvocations (backend migration 043).
  eldritchInvocationIds?: string[] | null;
  // Ability-score improvements baked in at creation for an above-L1 character
  // (preserves the base/improvement split instead of inflating base scores).
  // Each leg adds `amount` to a stat; legs may repeat a stat (they accumulate).
  // Existence-checked (stat must be one the character has); not count-gated.
  abilityImprovements?: AbilityImprovementChoice[] | null;
  copperPieces?: number;
  silverPieces?: number;
  electrumPieces?: number;
  goldPieces?: number;
  platinumPieces?: number;
  statusEffects?: CharacterStatusEffectRequest[] | null;
}

// Focused spell-list update (PUT /api/character/{id}/spells, backend 827c50d).
// Full replacement of the known/prepared list — cantripIds + spellIds are unioned
// (the stored list is flat; a spell's own level distinguishes a cantrip). Both
// optional; {} or empty arrays clears the list. Existence-checked only (no count
// or class-list gate). Returns 200 + the updated CharacterResponse. Safer than a
// whole-character PUT for spell edits — it touches only the spell list.
export interface UpdateSpellsRequest {
  cantripIds?: string[] | null;
  spellIds?: string[] | null;
}

// Focused HP-override update (PUT /api/character/{id}/hp, backend mig.-less #10).
// A number (1-9999) sets the override; null clears it (HP reverts to
// derivedMaxHitPoints). Returns 200 + the updated CharacterResponse.
export interface UpdateHpRequest {
  hitPointsOverride: number | null;
}

// Play-time inventory ops (mutate one stack; the whole-character PUT also works).
export interface InventoryAddRequest {
  itemId: string;
  quantity?: number;
  isAttuned?: boolean;
}
export interface InventoryConsumeRequest {
  itemId: string;
  quantity?: number;
}
export interface InventoryAttunementRequest {
  isAttuned: boolean;
}

// ---- Character: response (CharacterContracts.cs / CharacterResponse) ----
// All derived fields are server-computed and read-only. Note `GET /api/character`
// (list) returns full CharacterResponse[] — there is no summary DTO.

export interface NamedRef {
  id: string;
  name: string;
}
export type RaceRef = NamedRef;

export interface DamageResistanceResponse {
  damageTypeId: string;
  damageType: string;
  code?: string | null;
  kind: ResistanceKind;
}

export interface CharacterClassResponse {
  classId: string;
  name: string;
  level: number;
  hitDie?: HitDie | null;
  subclassId?: string | null;
  subclass?: string | null;
}

export interface HitDieResponse {
  die: HitDie;
  count: number;
}

/** NOTE: the API does NOT return the ability modifier — derive it from
 *  `effective` via the 5e formula floor((effective - 10) / 2). */
export interface AbilityScoreResponse {
  statId: string;
  name: string;
  base: number;
  racialModifier: number;
  subraceModifier: number;
  featModifier: number;
  improvementModifier: number;
  effective: number;
}

export interface SavingThrowResponse {
  statId: string;
  name: string;
  isProficient: boolean;
  modifier: number;
}

export interface SkillBonusResponse {
  skillId: string;
  name: string;
  ability: string;
  isProficient: boolean;
  level?: SkillProficiencyLevel | null;
  bonus: number;
}

export interface CharacterResourceResponse {
  name: string;
  recharge: ResourceRecharge;
  max: number;
  source: string;
}

export interface CharacterFeatureResponse {
  name: string;
  description?: string | null;
  kind: FeatureKind;
  level: number;
  source: string;
}

export interface SpellSlotResponse {
  level: number;
  count: number;
}

export interface SpellcastingResponse {
  class: string;
  ability: string;
  saveDc: number;
  spellAttackBonus: number;
  cantripsKnown?: number | null;
  spellsKnown?: number | null;
  spellSlots: SpellSlotResponse[];
  isPactMagic: boolean;
}

export interface SpellRef {
  id: string;
  name: string;
  level: number;
  school: SpellSchool;
}

export interface FeatRef {
  id: string;
  name: string;
  prerequisite?: string | null;
}

export interface WeaponAttackResponse {
  weaponId: string;
  name: string;
  ability: string;
  isProficient: boolean;
  attackBonus: number;
  damageDice?: string | null;
  damageBonus: number;
}

export interface InventoryItemResponse {
  itemId: string;
  name: string;
  quantity: number;
  isAttuned: boolean;
  weight: number;
  cost: number;
  isMagic: boolean;
  requiresAttunement: boolean;
}

export interface CharacterStatusEffectResponse {
  statusEffectId: string;
  name: string;
  isBeneficial: boolean;
  source?: string | null;
  effects: StatusEffectEffectResponse[];
}

export interface EncumbranceResponse {
  carriedWeight: number;
  carryingCapacity: number;
  pushDragLiftCapacity: number;
  encumberedThreshold: number;
  heavilyEncumberedThreshold: number;
  level: EncumbranceLevel;
  speedPenalty: number;
  isOverCapacity: boolean;
}

export interface WeaponProficienciesResponse {
  categories: NamedRef[];
  weapons: NamedRef[];
}
export interface ArmorProficienciesResponse {
  categories: NamedRef[];
  armors: NamedRef[];
}
export interface ToolProficienciesResponse {
  categories: NamedRef[];
  tools: NamedRef[];
}

// Always present. Components behind derivedMaxHitPoints / derivedArmorClass —
// always the DERIVED components, independent of the *Override fields (so a tooltip
// can show "derived would be X" even when an override is set). Sums reconcile to
// `total`, which equals the derived value (pre-override).
export interface HitPointBreakdownResponse {
  fromHitDice: number; // starting class's die maxed at L1 + average/recorded rolls after
  fromConstitution: number; // CON modifier x total level
  other: number; // passive HP effects (e.g. Tough +2/level)
  total: number; // = derivedMaxHitPoints (pre-override)
}
export interface ArmorClassBreakdownResponse {
  base: number; // worn-armor base AC, or 10 when unarmored
  dexterity: number; // DEX bonus actually applied (after the armor's max-dex cap)
  shield: number; // shield bonus (0 if none)
  other: number; // passive AC effects (feats / status effects); 0 if none
  total: number; // = base + dexterity + shield + other = derivedArmorClass (pre-override)
  source: string; // tooltip label: "Chain Mail", "Unarmored", ...
}

export interface CharacterResponse extends CharacterDetails {
  id: string;
  name: string;
  description?: string | null;
  race?: RaceRef | null;
  subrace?: { id: string; name: string } | null;
  background?: NamedRef | null;
  edition?: NamedRef | null;
  size: Size;
  walkingSpeed: number;
  swimSpeed: number;
  climbSpeed: number;
  flySpeed: number;
  darkvisionRange: number;
  // Other senses (feet; 0 = none) — passed through from the race (backend mig. 044).
  blindsightRange: number;
  tremorsenseRange: number;
  truesightRange: number;
  languages: NamedRef[];
  damageResistances: DamageResistanceResponse[];
  age: number;
  level: number;
  proficiencyBonus: number;
  startingClassId?: string | null;
  classes: CharacterClassResponse[];
  hitDice: HitDieResponse[];
  abilityScores: AbilityScoreResponse[];
  savingThrows: SavingThrowResponse[];
  initiative: number;
  passivePerception: number;
  skills: SkillBonusResponse[];
  hasJackOfAllTrades: boolean;
  // Champion's Remarkable Athlete (already folded into skills[].bonus + initiative).
  hasRemarkableAthlete: boolean;
  resources: CharacterResourceResponse[];
  features: CharacterFeatureResponse[];
  spellcasting: SpellcastingResponse[];
  spells: SpellRef[];
  feats: FeatRef[];
  // Chosen sub-features ([] when none). Expertise is NOT here — it shows up in
  // skills[] as level === Expertise (2).
  fightingStyles: NamedRef[];
  metamagics: NamedRef[];
  // Warlock Eldritch Invocations ([] when none); description-only, like fightingStyles.
  eldritchInvocations: NamedRef[];
  maxHitPoints: number;
  derivedMaxHitPoints: number;
  hitPointsOverride?: number | null;
  hitPointBreakdown: HitPointBreakdownResponse;
  armorClass: number;
  derivedArmorClass: number;
  armorClassOverride?: number | null;
  armorClassBreakdown: ArmorClassBreakdownResponse;
  equippedArmor?: NamedRef | null;
  equippedShield?: NamedRef | null;
  // Whether the character is proficient with the worn armor/shield (null = none equipped).
  equippedArmorProficient?: boolean | null;
  equippedShieldProficient?: boolean | null;
  equippedWeapons: NamedRef[];
  weaponAttacks: WeaponAttackResponse[];
  weaponProficiencies: WeaponProficienciesResponse;
  armorProficiencies: ArmorProficienciesResponse;
  toolProficiencies: ToolProficienciesResponse;
  spellSlots: number;
  alignment: Alignment;
  experience: number;
  inventory: InventoryItemResponse[];
  copperPieces: number;
  silverPieces: number;
  electrumPieces: number;
  goldPieces: number;
  platinumPieces: number;
  totalCarriedWeight: number;
  totalCurrencyInGold: number;
  attunedItemCount: number;
  encumbrance: EncumbranceResponse;
  statusEffects: CharacterStatusEffectResponse[];
  created: string; // ISO-8601
  modified: string; // ISO-8601
  // Organizer flag — retired characters are hidden in the Vault by default but
  // never deleted; toggle via PUT /api/character/{id}/retire.
  isRetired: boolean;
}

// ---- Level-up engine (CharacterContracts.cs) ----

export interface LevelUpPlanRequest {
  classId: string;
}

export interface LevelUpHitPointsResponse {
  hitDie: number;
  average: number;
  rollMin: number;
  rollMax: number;
  conModifier: number;
}

export interface LevelUpSpellPoolEntryResponse {
  id: string;
  name: string;
  level: number;
}

export interface LevelUpSpellChoicesResponse {
  newCantrips?: number | null; // null for prepared casters
  cantripPool: LevelUpSpellPoolEntryResponse[];
  newSpells?: number | null;
  maxSpellLevel: number;
  spellPool: LevelUpSpellPoolEntryResponse[];
}

/**
 * A sub-feature choice forced by a feature gained at the new level (Fighting
 * Style / Expertise / Metamagic). `selection.type` is 4/5/6. For type 4/6 the
 * picker uses `selection.options[]`; for Expertise (5) `options[]` is EMPTY and
 * the pool is the character's already-proficient skills (skills[].isProficient).
 */
export interface FeatureChoiceResponse {
  featureName: string;
  source: string; // class/subclass that granted it (display)
  selection: SelectionResponse;
}

/**
 * RAW multiclass ability-score prerequisites (backend migration 045). Present on
 * the plan ONLY when entering a class the character doesn't already have (a
 * multiclass-in); null when advancing an owned class. `requiresAll` says whether
 * the class's abilities are an AND (e.g. Paladin STR+CHA) or an OR (Fighter
 * STR|DEX). `isMet` (top-level) is the conjunction over every class. When unmet,
 * apply returns 400 unless allowHomebrewSelections is sent.
 */
export interface MulticlassPrerequisiteAbility {
  statId: string;
  statName: string;
  minimumScore: number;
  characterScore: number;
  isMet: boolean;
}
export interface MulticlassPrerequisiteClass {
  classId: string;
  className: string;
  requiresAll: boolean;
  isMet: boolean;
  abilities: MulticlassPrerequisiteAbility[];
}
export interface MulticlassPrerequisiteResponse {
  isMet: boolean;
  classes: MulticlassPrerequisiteClass[];
}

export interface LevelUpPlanResponse {
  classId: string;
  className: string;
  fromLevel: number;
  toLevel: number;
  totalLevelAfter: number;
  hitPoints: LevelUpHitPointsResponse;
  abilityScoreImprovementDue: boolean;
  subclassChoice?: SelectionResponse | null;
  spellChoices?: LevelUpSpellChoicesResponse | null;
  featureChoices: FeatureChoiceResponse[];
  // Non-null only on a multiclass-in; null when advancing an owned class.
  multiclassPrerequisite?: MulticlassPrerequisiteResponse | null;
  // RAW reduced multiclass choice-grants (backend mig. 048): populated only on a
  // multiclass-in into a class that offers them (Bard skill + instrument, Ranger/
  // Rogue skill); [] otherwise. Each is a SelectionResponse with inline options
  // (type 1 = Skill, type 8 = Tool). Echo picks back as multiclassChoices on apply.
  multiclassGrants: SelectionResponse[];
  gainedFeatures: CharacterFeatureResponse[];
  gainedResources: CharacterResourceResponse[];
  newSpellSlots: SpellSlotResponse[];
}

export interface LevelUpHitPointChoice {
  mode: LevelUpHitPointMode;
  rolledValue?: number | null; // required when mode === Roll
}
export interface AbilityImprovementChoice {
  statId: string;
  amount: number; // 1 or 2; per ASI the amounts must sum to 2
}
/** One echoed sub-feature pick. For FightingStyle/Metamagic `optionIds` are the
 *  chosen `optionId`s from the plan; for Expertise they are Skill ids the
 *  character is already proficient in. `selectionId` must match a plan entry. */
export interface FeatureChoiceApply {
  selectionId: string;
  optionIds: string[];
}
export interface LevelUpApplyRequest {
  classId: string;
  hitPoints: LevelUpHitPointChoice;
  abilityImprovements?: AbilityImprovementChoice[] | null;
  featId?: string | null;
  subclassId?: string | null;
  cantripIds?: string[] | null;
  spellIds?: string[] | null;
  featureChoices?: FeatureChoiceApply[] | null;
  // Picks for the plan's multiclassGrants (same {selectionId, optionIds} shape as
  // featureChoices). Empty picks are allowed (DM may fill later).
  multiclassChoices?: FeatureChoiceApply[] | null;
  allowHomebrewSelections?: boolean;
}

// ---- Character organizer requests (Scope B additions) ----

export interface RetireCharacterRequest {
  isRetired: boolean;
}

/** Deep-copy a character to another user. Caller must own the character or be
 *  the DM of a campaign that contains it. Returns the new CharacterResponse. */
export interface CopyCharacterRequest {
  targetUsername: string;
}

// ---- Scope B: Campaign management (backend scope-b, merged master 82e65b2) ----
// Enums are integers over the wire (no JsonStringEnumConverter).

export const CampaignMemberRole = {
  DM: 1,
  Player: 2,
} as const;
export type CampaignMemberRole =
  (typeof CampaignMemberRole)[keyof typeof CampaignMemberRole];

export const CampaignMemberStatus = {
  Invited: 1,
  Requested: 2,
  Active: 3,
  Rejected: 4,
  Removed: 5,
} as const;
export type CampaignMemberStatus =
  (typeof CampaignMemberStatus)[keyof typeof CampaignMemberStatus];

export const MembershipInitiatedBy = {
  DM: 1,
  Player: 2,
} as const;
export type MembershipInitiatedBy =
  (typeof MembershipInitiatedBy)[keyof typeof MembershipInitiatedBy];

export const EncounterStatus = {
  Pending: 0,
  Active: 1,
  Ended: 2,
} as const;
export type EncounterStatus =
  (typeof EncounterStatus)[keyof typeof EncounterStatus];

// Combatant disposition shown to players (friend/foe indicator). DM-set; broadcast.
export const CombatantDisposition = {
  PlayerCharacter: 0,
  FriendlyNpc: 1,
  Enemy: 2,
} as const;
export type CombatantDisposition =
  (typeof CombatantDisposition)[keyof typeof CombatantDisposition];

// ---- Scope B: Campaign responses ----

export interface CampaignResponse {
  id: string;
  name: string;
  description?: string | null;
  dmUserId: string;
  dmUsername: string;
}

export interface CampaignMemberResponse {
  userId: string;
  username: string;
  role: CampaignMemberRole;
  status: CampaignMemberStatus;
  initiatedBy: MembershipInitiatedBy;
  created: string; // ISO-8601
}

export interface CampaignCharacterResponse {
  characterId: string;
  characterName: string;
  ownerId: string;
  ownerUsername: string;
}

export interface SessionResponse {
  id: string;
  name: string;
  description?: string | null;
  campaignId: string;
  date?: string | null; // ISO-8601; optional at creation, may be null
  characterIds: string[];
}

// ---- Scope B: Encounter responses ----

export interface CombatantResponse {
  id: string;
  encounterId: string;
  characterId: string | null; // non-null when linked to a campaign character
  name: string;
  initiative: number | null;
  currentHp: number;
  maxHp: number;
  tempHp: number;
  armorClass: number;
  isActive: boolean;
  sortOrder: number; // 0 = highest initiative = goes first
  // DM-controlled per-combatant player visibility (independent toggles). Optional
  // until the backend ships them (see FRONTEND-REQUEST-encounter-combat-controls.md
  // item 2); treat undefined as false (visible).
  isHiddenFromPlayers?: boolean; // hide this combatant from the player view entirely
  hpHiddenFromPlayers?: boolean; // hide this combatant's HP from players
  acHiddenFromPlayers?: boolean; // hide this combatant's AC from players
  // Death saves while at 0 HP (D&D 5e): 3 successes = stable, 3 failures = dead.
  // Optional until the backend ships them (see
  // FRONTEND-REQUEST-encounter-combat-controls.md item 4); reset to 0 on heal.
  deathSaveSuccesses?: number; // 0–3
  deathSaveFailures?: number; // 0–3
  // Friend/foe shown to players. Optional until the backend ships it (see
  // FRONTEND-REQUEST-encounter-combat-controls.md item 3); when absent, derive from
  // the link (character-linked ⇒ PlayerCharacter, unlinked ⇒ Enemy).
  disposition?: CombatantDisposition;
}

/** Full encounter — returned by every mutation and GET /{encounterId}. */
export interface EncounterResponse {
  id: string;
  campaignId: string;
  sessionId: string | null;
  name: string;
  description?: string | null;
  status: EncounterStatus;
  roundNumber: number;
  activeCombatantId: string | null;
  combatants: CombatantResponse[];
}

/** List-level summary — no combatants array. */
export interface EncounterSummaryResponse {
  id: string;
  campaignId: string;
  sessionId: string | null;
  name: string;
  description?: string | null;
  status: EncounterStatus;
  roundNumber: number;
}

// ---- Scope B: Campaign + encounter requests ----

export interface CreateCampaignRequest {
  name: string;
  description?: string | null;
}

export interface TransferDmRequest {
  userId: string;
}

export interface InviteMemberRequest {
  username: string;
}

export interface RegisterCampaignCharacterRequest {
  characterId: string;
}

export interface CreateSessionRequest {
  name: string;
  description?: string | null;
  date?: string | null; // ISO-8601
}

export interface CreateEncounterRequest {
  name: string;
  description?: string | null;
  sessionId?: string | null;
}

export interface AddCombatantRequest {
  name: string;
  maxHp: number;
  armorClass: number;
  characterId?: string | null;
}

export interface SetInitiativeRequest {
  initiative: number;
}

/** Three independent fields — send only what you need.
 *  delta: positive = heal (currentHp only), negative = damage (tempHp first, overflow → currentHp).
 *  setCurrentHp: direct set, clamped 0–maxHp. Takes priority over delta.
 *  setTempHp: direct set, floor 0. Applied independently. */
export interface UpdateCombatantHpRequest {
  delta?: number | null;
  setCurrentHp?: number | null;
  setTempHp?: number | null;
}

export interface UpdateCombatantRequest {
  name?: string;
  maxHp?: number;
  armorClass?: number;
  // DM-only per-combatant player-visibility flags (broadcast to all viewers).
  isHiddenFromPlayers?: boolean;
  hpHiddenFromPlayers?: boolean;
  acHiddenFromPlayers?: boolean;
  disposition?: CombatantDisposition;
  deathSaveSuccesses?: number; // 0–3
  deathSaveFailures?: number; // 0–3
}
