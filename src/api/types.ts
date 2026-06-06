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
  abilityModifiers: RaceAbilityModifierResponse[];
  languages: LanguageResponse[];
  damageResistances: RaceDamageResistanceResponse[];
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
}

export interface ItemResponse {
  id: string;
  name: string;
  description?: string | null;
  weight: number;
  cost: number;
  isMagic: boolean;
  requiresAttunement: boolean;
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
}

/** A "class" (Job on the backend). */
export interface ClassResponse {
  id: string;
  name: string;
  description?: string | null;
  hitDie: HitDie;
  selections: SelectionResponse[];
  subclasses: SubclassResponse[];
  // Proficiency grants — category ids match Armor/Weapon/Tool .*CategoryId;
  // item ids match the Armor/Weapon/Tool id. SRD classes grant by category
  // (item lists usually empty); homebrew per-item grants populate the item lists.
  weaponProficiencies: WeaponProficienciesResponse;
  armorProficiencies: ArmorProficienciesResponse;
  toolProficiencies: ToolProficienciesResponse;
  // 5e primary ability/abilities; each .id is a Stat id (match StatResponse.id).
  primaryAbilities: NamedRef[];
}

export interface EditionResponse {
  id: string;
  name: string;
  description?: string | null;
  code?: string | null;
  isDefault: boolean;
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
  spellIds?: string[] | null;
  featIds?: string[] | null;
  backgroundId?: string | null;
  editionId?: string | null; // locked after creation
  languageIds?: string[] | null;
  allowHomebrewSelections?: boolean;
  inventory?: InventoryItemRequest[] | null;
  copperPieces?: number;
  silverPieces?: number;
  electrumPieces?: number;
  goldPieces?: number;
  platinumPieces?: number;
  statusEffects?: CharacterStatusEffectRequest[] | null;
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
  background?: NamedRef | null;
  edition?: NamedRef | null;
  size: Size;
  walkingSpeed: number;
  swimSpeed: number;
  climbSpeed: number;
  flySpeed: number;
  darkvisionRange: number;
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
  resources: CharacterResourceResponse[];
  features: CharacterFeatureResponse[];
  spellcasting: SpellcastingResponse[];
  spells: SpellRef[];
  feats: FeatRef[];
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
export interface LevelUpApplyRequest {
  classId: string;
  hitPoints: LevelUpHitPointChoice;
  abilityImprovements?: AbilityImprovementChoice[] | null;
  featId?: string | null;
  subclassId?: string | null;
  cantripIds?: string[] | null;
  spellIds?: string[] | null;
  allowHomebrewSelections?: boolean;
}
