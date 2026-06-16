// Presentational character-sheet body — the renderer shared by the /character/:id
// route (full, interactive) and the DM's read-only combat popup (Phase 3 of
// COMBAT-UX-PLAN). Extracted wholesale from CharacterSheet.tsx: this file owns the
// header identity + vitals, ability scores, the (optionally draggable) block grid,
// and every *Block component. The route stays a thin fetch/actions/dialogs wrapper
// and passes its action bar (headerActions) + dialogs (footer) + drag handlers in;
// the popup passes readOnly and omits all of them.
//
// readOnly mode: no drag handles (blocks render in their natural order), no
// inventory mutation controls, and the route's header actions / dialogs simply
// aren't passed. The DOM is otherwise identical, so the route render is unchanged.
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { characters } from "../api/endpoints";
import {
  AdvantageState,
  EncumbranceLevel,
  ResistanceKind,
  ResourceRecharge,
  RollModifierKind,
  SkillProficiencyLevel,
  WeaponProperty,
  type CharacterFeatureResponse,
  type CharacterResourceResponse,
  type CharacterResponse,
  type CharacterStatusEffectResponse,
  type EncumbranceResponse,
  type RacialSpellResponse,
  type RollAdvantageResponse,
  type RollModifierResponse,
  type SavingThrowResponse,
  type SkillBonusResponse,
  type ItemResponse,
  type NamedRef,
  type SpellRef,
  type SpellResponse,
  type SpellcastingResponse,
  type WeaponAttackResponse,
  type WeaponResponse,
} from "../api/types";
import { ApiError } from "../api/client";
import {
  abilityBreakdown,
  advantageLine,
  attackTip,
  casterTip,
  fmtMod,
  riderLine,
  vitalTips,
} from "../lib/sheetTips";
import { BLOCK_KEYS, type BlockKey, type SheetDragHandlers } from "../lib/sheetBlocks";
import DraggableBlock from "../components/DraggableBlock";
import "./CharacterSheet.css";

const rechargeLabel = (r: ResourceRecharge) =>
  r === ResourceRecharge.ShortRest
    ? "short rest"
    : r === ResourceRecharge.LongRest
      ? "long rest"
      : "—";
const encumbranceLabel = (l: EncumbranceLevel) =>
  l === EncumbranceLevel.HeavilyEncumbered
    ? "Heavily Encumbered"
    : l === EncumbranceLevel.Encumbered
      ? "Encumbered"
      : "Unencumbered";
const resistanceLabel = (k: ResistanceKind) =>
  k === ResistanceKind.Immunity
    ? "immune"
    : k === ResistanceKind.Vulnerability
      ? "vulnerable"
      : "resistant";

// ---- Block ordering (drag-to-reorder) ----------------------------------------
// BLOCK_KEYS / BlockKey / SheetDragHandlers live in ../lib/sheetBlocks.

function isBlockVisible(key: BlockKey, c: CharacterResponse): boolean {
  switch (key) {
    case "attacks": return c.weaponAttacks.length > 0;
    case "resources": return c.resources.length > 0;
    case "spellcasting": return c.spellcasting.length > 0 || c.spells.length > 0 || c.racialSpells.length > 0;
    case "features": return c.features.length > 0;
    case "subfeatures":
      return (
        c.fightingStyles.length > 0 ||
        c.metamagics.length > 0 ||
        c.eldritchInvocations.length > 0
      );
    case "status": return c.statusEffects.length > 0;
    default: return true;
  }
}

// ---- End block ordering -------------------------------------------------------

export default function CharacterSheetView({
  character,
  readOnly,
  headerActions,
  footer,
  items = [],
  spellsById,
  weaponsById,
  onMutated,
  dragHandlers,
}: {
  character: CharacterResponse;
  readOnly: boolean;
  // Rendered inside .sheet__id after the race/class line (route action bar +
  // copy form + copy message). Omitted in read-only mode.
  headerActions?: ReactNode;
  // Rendered after the block grid, inside .container.sheet (route dialogs).
  footer?: ReactNode;
  // Inventory "add" catalog — empty in read-only mode (no add control anyway).
  items?: ItemResponse[];
  // Known-spell → catalog join for the Spellcasting block's dice/save display.
  spellsById?: Map<string, SpellResponse>;
  // Weapon catalog join for the Attacks block's property badges + versatile damage
  // (INCOMING #35; absent ⇒ no badges, attack/damage numbers are unaffected).
  weaponsById?: Map<string, WeaponResponse>;
  // Inventory mutation callback (route's setC). Absent ⇒ inventory is read-only.
  onMutated?: (updated: CharacterResponse) => void;
  // Drag wiring; absent ⇒ blocks render in natural order with no handles.
  dragHandlers?: SheetDragHandlers;
}) {
  const c = character;
  const spellsByIdMap = useMemo(
    () => spellsById ?? new Map<string, SpellResponse>(),
    [spellsById],
  );

  const classLine = c.classes
    .map((cl) => `${cl.name} ${cl.level}`)
    .join(" / ");

  // Vital breakdown tooltips (from data already in the response).
  const { hpTip, acTip, initTip, speedTip, profTip, percTip } = vitalTips(c);

  // Ability-modifier lookups for derived-number breakdowns (saves/skills/attacks/spells).
  const prof = c.proficiencyBonus;
  const modByStatId = new Map(c.abilityScores.map((a) => [a.statId, a.modifier]));
  const modByName = new Map(c.abilityScores.map((a) => [a.name, a.modifier]));
  const renderBlock = (key: BlockKey) => {
    switch (key) {
      case "saves":
        return (
          <SavesBlock
            savingThrows={c.savingThrows}
            modByStatId={modByStatId}
            prof={prof}
          />
        );
      case "skills":
        return (
          <SkillsBlock
            skills={c.skills}
            modByName={modByName}
            prof={prof}
            hasJackOfAllTrades={c.hasJackOfAllTrades}
          />
        );
      case "inventory":
        return (
          <InventoryBlock
            character={c}
            items={items}
            onMutated={onMutated}
            readOnly={readOnly}
          />
        );
      case "equipped":
        return <EquippedBlock character={c} />;
      case "attacks":
        return (
          <AttacksBlock attacks={c.weaponAttacks} attacksPerAction={c.attacksPerAction} modByName={modByName} prof={prof} weaponsById={weaponsById} />
        );
      case "resources":
        return <ResourcesBlock resources={c.resources} />;
      case "spellcasting":
        return (
          <SpellcastingBlock
            spellcasting={c.spellcasting}
            spells={c.spells}
            racialSpells={c.racialSpells}
            spellsById={spellsByIdMap}
            modByName={modByName}
            prof={prof}
            charLevel={c.level}
          />
        );
      case "features":
        return <FeaturesBlock features={c.features} />;
      case "subfeatures":
        return (
          <SubFeaturesBlock
            fightingStyles={c.fightingStyles}
            metamagics={c.metamagics}
            eldritchInvocations={c.eldritchInvocations}
          />
        );
      case "traits":
        return <TraitsBlock character={c} />;
      case "encumbrance":
        return <EncumbranceBlock encumbrance={c.encumbrance} />;
      case "status":
        return (
          <StatusEffectsBlock
            effects={c.statusEffects}
            rollModifiers={c.rollModifiers ?? []}
            rollAdvantages={c.rollAdvantages ?? []}
            statNameById={new Map(c.savingThrows.map((s) => [s.statId, s.name]))}
          />
        );
    }
  };

  // Route order from the drag handlers; read-only / no-drag falls back to the
  // natural BLOCK_KEYS order.
  const order: BlockKey[] = dragHandlers?.order ?? [...BLOCK_KEYS];

  return (
    <div className="container sheet anim-rise-in">
      {/* ---- Header ---- */}
      <header className="sheet__header panel">
        <div className="sheet__id">
          <h1 className="sheet__name">{c.name}</h1>
          <p className="text-muted">
            {c.race?.name}{c.subrace ? ` (${c.subrace.name})` : ""} · {classLine} · Level {c.level}
          </p>
          {headerActions}
        </div>
        <div className="sheet__vitals">
          <Vital label="HP" value={c.maxHitPoints} tooltip={hpTip} />
          <Vital label="AC" value={c.armorClass} tooltip={acTip} />
          <Vital label="Init" value={fmtMod(c.initiative)} tooltip={initTip} />
          <Vital label="Speed" value={`${c.walkingSpeed}ft`} tooltip={speedTip} />
          <Vital label="Prof" value={fmtMod(c.proficiencyBonus)} tooltip={profTip} />
          <Vital label="Pass. Perc" value={c.passivePerception} tooltip={percTip} />
        </div>
      </header>

      {/* ---- Ability scores ---- */}
      <section className="sheet__abilities stagger">
        {c.abilityScores.map((a, i) => (
          <div
            key={a.statId}
            className="ability panel ability--help tip"
            data-tooltip={abilityBreakdown(a)}
            tabIndex={0}
            style={{ "--stagger-i": i } as CSSProperties}
          >
            <div className="ability__code">{a.name}</div>
            <div className="ability__mod">{fmtMod(a.modifier)}</div>
            <div className="ability__score">{a.effective}</div>
          </div>
        ))}
      </section>

      {/* ---- Block grid. Interactive: drag the ⠿ handle to rearrange.
              Read-only: natural order, no handles. ---- */}
      <div className="sheet__cols">
        {order.map((key, idx) =>
          isBlockVisible(key, c) ? (
            dragHandlers ? (
              <DraggableBlock
                key={key}
                idx={idx}
                onDragStart={dragHandlers.onDragStart}
                onDrop={dragHandlers.onDrop}
              >
                {renderBlock(key)}
              </DraggableBlock>
            ) : (
              <div key={key} className="sheet__draggable sheet__draggable--static">
                {renderBlock(key)}
              </div>
            )
          ) : null,
        )}
      </div>

      {footer}
    </div>
  );
}

function Vital({
  label,
  value,
  tooltip,
}: {
  label: string;
  value: string | number;
  tooltip?: string;
}) {
  return (
    <div
      className={"vital" + (tooltip ? " tip ability--help" : "")}
      data-tooltip={tooltip}
      tabIndex={tooltip ? 0 : undefined}
    >
      <div className="vital__value">{value}</div>
      <div className="vital__label">{label}</div>
    </div>
  );
}

// Display labels for the numeric WeaponProperty set (INCOMING #35). Render-only.
const WEAPON_PROPERTY_LABELS: Record<number, string> = {
  [WeaponProperty.Ammunition]: "Ammunition",
  [WeaponProperty.Finesse]: "Finesse",
  [WeaponProperty.Heavy]: "Heavy",
  [WeaponProperty.Light]: "Light",
  [WeaponProperty.Loading]: "Loading",
  [WeaponProperty.Range]: "Range",
  [WeaponProperty.Reach]: "Reach",
  [WeaponProperty.Special]: "Special",
  [WeaponProperty.Thrown]: "Thrown",
  [WeaponProperty.TwoHanded]: "Two-Handed",
  [WeaponProperty.Versatile]: "Versatile",
};

function AttacksBlock({
  attacks,
  attacksPerAction,
  modByName,
  prof,
  weaponsById,
}: {
  attacks: WeaponAttackResponse[];
  attacksPerAction: number;
  modByName: Map<string, number>;
  prof: number;
  weaponsById?: Map<string, WeaponResponse>;
}) {
  if (attacks.length === 0) return null;
  const anyNonProf = attacks.some((a) => !a.isProficient);
  return (
    <section className="panel sheet__block">
      <h3 className="sheet__block-title">Attacks</h3>
      <hr className="rule" />
      {(attacksPerAction ?? 1) > 1 && (
        <p className="sheet__note">Extra Attack — {attacksPerAction} attacks per Attack action.</p>
      )}
      <ul className="prof-list">
        {attacks.map((a) => {
          const w = weaponsById?.get(a.weaponId);
          const propLabels = (w?.properties ?? [])
            .map((p) => WEAPON_PROPERTY_LABELS[p])
            .filter(Boolean);
          return (
            <li
              key={a.weaponId}
              className="prof-list__row tip"
              data-tooltip={attackTip(a, modByName, prof)}
            >
              <span className={"dot" + (a.isProficient ? " dot--on" : "")} />
              <span className="prof-list__name">
                {a.name}
                {!a.isProficient && (
                  <span className="sheet__warn">
                    {" "}
                    ⚠ not proficient
                  </span>
                )}
                {propLabels.length > 0 && (
                  <span className="sheet__weapon-props">
                    {" "}
                    {propLabels.join(" · ")}
                  </span>
                )}
              </span>
              <span className="prof-list__val">
                {fmtMod(a.attackBonus)}
                {a.damageDice && (
                  <span className="text-faint">
                    {" "}
                    · {a.damageDice}
                    {a.damageBonus !== 0 ? fmtMod(a.damageBonus) : ""}
                    {w?.versatileDamage && ` (2H ${w.versatileDamage}${a.damageBonus !== 0 ? fmtMod(a.damageBonus) : ""})`}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {anyNonProf && (
        <p className="text-faint sheet__warn-note">
          ⚠ Non-proficient weapons don't add your proficiency bonus to attack rolls.
        </p>
      )}
    </section>
  );
}

function EquipRow({
  name,
  slot,
  warning,
}: {
  name: string;
  slot: string;
  warning?: string;
}) {
  return (
    <li className="prof-list__row prof-list__row--equip">
      <span className="prof-list__name">{name}</span>
      <span className="sheet__equip-warn">
        {warning && (
          <span className="sheet__warn tip" data-tooltip={warning}>
            ⚠ not proficient
          </span>
        )}
      </span>
      <span className="prof-list__val text-faint">{slot}</span>
    </li>
  );
}

function EquippedBlock({ character }: { character: CharacterResponse }) {
  const c = character;
  const ab = c.armorClassBreakdown;
  // Always render: an unarmored character (e.g. a Monk) still has a derived AC,
  // so the block surfaces its source row instead of self-hiding when no armor
  // is worn. (The unarmed attack itself lives in the Attacks block.)
  return (
    <section className="panel sheet__block">
      <h3 className="sheet__block-title">Equipped</h3>
      <hr className="rule" />
      <ul className="prof-list">
        {c.equippedArmor ? (
          <EquipRow
            name={c.equippedArmor.name}
            slot="armor"
            warning={
              c.equippedArmorProficient === false
                ? "Not proficient with this armor — you can't cast spells and have disadvantage on STR/DEX checks, saves, and attacks while wearing it."
                : undefined
            }
          />
        ) : (
          // No worn armor (Monk/Barbarian/unarmored caster) — show the AC source
          // as a row consistent with the others; the AC math lives in the AC tooltip.
          <EquipRow name={ab?.source ?? "Unarmored"} slot="armor" />
        )}
        {c.equippedShield && (
          <EquipRow
            name={c.equippedShield.name}
            slot="shield"
            warning={
              c.equippedShieldProficient === false
                ? "Not proficient with shields — disadvantage on STR/DEX checks, saves, and attacks while using it."
                : undefined
            }
          />
        )}
        {/* Only real equipped weapons here — the unarmed strike is a proper
            entry in weaponAttacks now (backend 2ecb950), shown under Attacks. */}
        {c.equippedWeapons.map((w) => (
          <EquipRow key={w.id} name={w.name} slot="weapon" />
        ))}
      </ul>
    </section>
  );
}

function ResourcesBlock({
  resources,
}: {
  resources: CharacterResourceResponse[];
}) {
  if (resources.length === 0) return null;
  return (
    <section className="panel sheet__block">
      <h3 className="sheet__block-title">Resources</h3>
      <hr className="rule" />
      <ul className="prof-list">
        {resources.map((r, i) => (
          <li key={`${r.name}-${i}`} className="prof-list__row">
            <span className="prof-list__name">{r.name}</span>
            <span className="prof-list__val">
              {r.max}{" "}
              <span className="text-faint">/ {rechargeLabel(r.recharge)}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Normalized spell combat descriptor. Prefers Tier 2 per-character dice
// (s.scaling) over Tier 1 catalog dice (s.damageDice/healingDice) when available.
// charLevel is the character's total level — used for cantrip tier selection.
type SpellCombat = {
  dice: string | null; // damage or healing dice to display
  isHealing: boolean;
  damageType: string | null;
  mode: "attack" | "save" | null; // spell-attack roll vs saving throw vs neither
  saveAbility: string | null;
  scaling: string | null; // free-text scaling note (tooltip)
};
// Cantrip scaling milestones: 1/5/11/17 (standard 5e breakpoints).
function cantripTier(charLevel: number): string {
  if (charLevel >= 17) return "17";
  if (charLevel >= 11) return "11";
  if (charLevel >= 5) return "5";
  return "1";
}
function spellCombat(s: SpellResponse, charLevel: number): SpellCombat {
  let dice: string | null = null;
  if (s.scaling?.diceByLevel) {
    const key =
      s.scaling.kind === "cantrip"
        ? cantripTier(charLevel)
        : s.level.toString();
    dice = s.scaling.diceByLevel[key] ?? null;
  }
  if (!dice) dice = s.damageDice ?? s.healingDice ?? null;
  return {
    dice,
    isHealing: !s.damageDice && !!s.healingDice,
    damageType: s.damageType?.name ?? null,
    mode: s.usesSpellAttack ? "attack" : s.saveStatId ? "save" : null,
    saveAbility: s.saveAbility ?? null,
    scaling: s.scalingDice ?? null,
  };
}
// Compact summary, e.g. "dmg 8d6 Fire · DEX save · ↑ upcasts". The scaling marker
// reads "scales" for cantrips (char-level) and "upcasts" for levelled spells.
function spellInline(c: SpellCombat, level: number): string {
  const parts: string[] = [];
  if (c.dice)
    parts.push(
      `${c.isHealing ? "heal" : "dmg"} ${c.dice}${c.damageType ? ` ${c.damageType}` : ""}`,
    );
  if (c.mode === "attack") parts.push("spell attack");
  else if (c.mode === "save") parts.push(`${c.saveAbility ?? "save"} save`);
  if (c.scaling) parts.push(level === 0 ? "↑ scales" : "↑ upcasts");
  return parts.join(" · ");
}
function spellTip(s: SpellResponse, c: SpellCombat): string {
  const lines: string[] = [];
  if (c.dice)
    lines.push(
      `${c.isHealing ? "Healing" : "Damage"} ${c.dice}${c.damageType ? ` ${c.damageType}` : ""}`,
    );
  if (c.mode === "attack") lines.push("Spell attack roll");
  else if (c.mode === "save") lines.push(`${c.saveAbility ?? "ability"} saving throw`);
  if (c.scaling)
    lines.push(`${s.level === 0 ? "Scales" : "Upcast"}: ${c.scaling}`);
  if (s.range) lines.push(`Range ${s.range}`);
  if (s.castingTime) lines.push(`Cast ${s.castingTime}`);
  return lines.join("\n");
}

function SpellcastingBlock({
  spellcasting,
  spells,
  racialSpells,
  spellsById,
  modByName,
  prof,
  charLevel,
}: {
  spellcasting: SpellcastingResponse[];
  spells: SpellRef[];
  racialSpells: RacialSpellResponse[];
  spellsById: Map<string, SpellResponse>;
  modByName: Map<string, number>;
  prof: number;
  charLevel: number;
}) {
  if (spellcasting.length === 0 && spells.length === 0 && racialSpells.length === 0) return null;

  // PHB multiclass combined slots: all non-pact casters share one pool.
  // Their spellSlots arrays are identical — take from the first; don't sum.
  const standardCasters = spellcasting.filter((s) => !s.isPactMagic);
  const pactCasters = spellcasting.filter((s) => s.isPactMagic);
  const sharedSlots = standardCasters[0]?.spellSlots ?? [];

  const slotsByLevel = new Map<number, number>();
  for (const slot of sharedSlots) slotsByLevel.set(slot.level, slot.count);
  // Pact magic slots are separate (short-rest) — include them for level-group display.
  for (const sc of pactCasters)
    for (const slot of sc.spellSlots)
      slotsByLevel.set(slot.level, (slotsByLevel.get(slot.level) ?? 0) + slot.count);

  const multiclass = standardCasters.length > 1;

  // INCOMING #20: resolve which caster's DC governs a spell. Tagged → that class
  // (join by name); untagged + single caster → that sole caster; untagged + multiple
  // → null (we can't guess, so show no class/DC). A tag naming a class that's no
  // longer a caster falls through to the single/null rule (treated as untagged).
  const casterByName = new Map(spellcasting.map((sc) => [sc.class, sc]));
  const resolveCaster = (s: SpellRef): SpellcastingResponse | null => {
    if (s.sourceClass) {
      const tagged = casterByName.get(s.sourceClass);
      if (tagged) return tagged;
    }
    return spellcasting.length === 1 ? spellcasting[0] : null;
  };

  return (
    <section className="panel sheet__block">
      <h3 className="sheet__block-title">Spellcasting</h3>
      <hr className="rule" />

      {/* Shared slot pool (shown first when multiclassing) */}
      {multiclass && sharedSlots.length > 0 && (
        <div className="sheet__caster">
          <p className="prof-list__name text-faint">Spell Slots (shared)</p>
          <p className="text-faint">
            {sharedSlots.map((s) => `L${s.level}: ${s.count}`).join("  ")}
          </p>
        </div>
      )}

      {/* Standard casters: per-class stats */}
      {standardCasters.map((sc, i) => (
        <div
          key={`${sc.class}-${i}`}
          className="sheet__caster tip"
          data-tooltip={casterTip(sc, modByName, prof)}
        >
          <p className="prof-list__name">{sc.class}</p>
          <p className="text-faint">
            {sc.ability} · save DC {sc.saveDc} · spell atk{" "}
            {fmtMod(sc.spellAttackBonus)}
            {sc.cantripsKnown != null && ` · cantrips ${sc.cantripsKnown}`}
            {sc.spellsKnown != null && ` · spells ${sc.spellsKnown}`}
          </p>
        </div>
      ))}

      {/* Pact magic: separate short-rest pool */}
      {pactCasters.map((sc, i) => (
        <div
          key={`pact-${sc.class}-${i}`}
          className="sheet__caster tip"
          data-tooltip={casterTip(sc, modByName, prof)}
        >
          <p className="prof-list__name">
            {sc.class}{" "}
            <span className="badge">Pact Magic</span>
          </p>
          <p className="text-faint">
            {sc.ability} · save DC {sc.saveDc} · spell atk{" "}
            {fmtMod(sc.spellAttackBonus)}
            {sc.cantripsKnown != null && ` · cantrips ${sc.cantripsKnown}`}
            {sc.spellsKnown != null && ` · spells ${sc.spellsKnown}`}
          </p>
          {sc.spellSlots.length > 0 && (
            <p className="text-faint">
              {sc.spellSlots.map((s) => `L${s.level}: ${s.count}`).join("  ")}
              {" · short rest"}
            </p>
          )}
        </div>
      ))}

      {spellLevelGroups(spells, slotsByLevel).map((g) => (
        <div key={g.level} className="sheet__spell-group">
          <h4 className="sheet__spell-level">
            {g.level === 0 ? "Cantrips" : `Level ${g.level}`}
            {!multiclass && slotsByLevel.has(g.level) && (
              <span className="text-faint">
                {" "}
                · {slotsByLevel.get(g.level)} slot
                {slotsByLevel.get(g.level) === 1 ? "" : "s"}
              </span>
            )}
          </h4>
          {g.spells.length === 0 ? (
            <p className="text-faint sheet__spell-empty">No spells prepared.</p>
          ) : (
            <ul className="sheet__spells">
              {g.spells.map((s) => {
                const cat = spellsById.get(s.id);
                const combat = cat ? spellCombat(cat, charLevel) : null;
                const inline = combat ? spellInline(combat, s.level) : "";
                // Multiclass: attribute the spell to its governing caster so the
                // reader sees WHICH class's DC applies (the point of INCOMING #20).
                // Single-caster sheets stay clean (the one header DC is unambiguous).
                const caster = multiclass ? resolveCaster(s) : null;
                const sourceLine = caster
                  ? `${caster.class}: save DC ${caster.saveDc} · spell atk ${fmtMod(caster.spellAttackBonus)}`
                  : null;
                // Combat spells get the mechanics summary on hover; utility spells
                // (no dice/save) fall back to the spell's description. Prepend the
                // governing-class line when multiclass.
                const base =
                  inline && cat
                    ? spellTip(cat, combat!)
                    : (cat?.description ?? "");
                const tooltip =
                  [sourceLine, base].filter(Boolean).join("\n") || undefined;
                return (
                  <li
                    key={s.id}
                    className={"sheet__spell-row" + (tooltip ? " tip" : "")}
                    data-tooltip={tooltip}
                  >
                    <span className="sheet__spell-name">{s.name}</span>
                    {caster && (
                      <span className="sheet__spell-source">{caster.class}</span>
                    )}
                    {inline && (
                      <span className="sheet__spell-info">{inline}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ))}

      {racialSpells.length > 0 && (
        <div className="sheet__spell-group">
          <h4 className="sheet__spell-level">Racial Spells</h4>
          <ul className="sheet__spells">
            {racialSpells.map((s) => {
              const levelLabel = s.level === 0 ? "cantrip" : `level ${s.level}`;
              const dcLine =
                s.saveDc !== null && s.saveDc !== undefined
                  ? `save DC ${s.saveDc} · spell atk ${fmtMod(s.spellAttackBonus ?? 0)}`
                  : null;
              const abilityLine = s.spellcastingAbility
                ? `${s.spellcastingAbility} spellcasting`
                : null;
              const tooltip =
                [abilityLine, dcLine].filter(Boolean).join(" · ") || undefined;
              return (
                <li
                  key={s.id}
                  className={"sheet__spell-row" + (tooltip ? " tip" : "")}
                  data-tooltip={tooltip}
                >
                  <span className="sheet__spell-name">{s.name}</span>
                  <span className="sheet__spell-source">racial</span>
                  <span className="sheet__spell-info">{levelLabel}</span>
                  {dcLine && (
                    <span className="sheet__spell-info">{dcLine}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

// Spell-level groups (ascending): every level the character has unlocked (a slot
// for) plus any level that has known spells, so an unlocked-but-empty level still
// shows (with a "no spells prepared" note). Cantrips (0) appear only when known.
function spellLevelGroups(
  spells: SpellRef[],
  slotsByLevel: Map<number, number>,
): { level: number; spells: SpellRef[] }[] {
  const levelSet = new Set<number>([
    ...spells.map((s) => s.level),
    ...slotsByLevel.keys(),
  ]);
  return [...levelSet]
    .sort((a, b) => a - b)
    .map((level) => ({
      level,
      spells: spells
        .filter((s) => s.level === level)
        .sort((a, b) => a.name.localeCompare(b.name)),
    }));
}

function FeaturesBlock({ features }: { features: CharacterFeatureResponse[] }) {
  if (features.length === 0) return null;
  return (
    <section className="panel sheet__block">
      <h3 className="sheet__block-title">Features</h3>
      <hr className="rule" />
      <ul className="sheet__features">
        {features.map((f, i) => (
          <li key={`${f.name}-${i}`}>
            {f.description ? (
              // Collapsed by default — the descriptions make this block very long,
              // so show just the name/source and let the DM expand on demand.
              <details className="disclosure">
                <summary className="disclosure__head">
                  <span className="prof-list__name">{f.name}</span>{" "}
                  <span className="text-faint">
                    · {f.source} L{f.level}
                  </span>
                </summary>
                <p className="text-muted sheet__feature-desc">{f.description}</p>
              </details>
            ) : (
              <>
                <span className="prof-list__name">{f.name}</span>{" "}
                <span className="text-faint">
                  · {f.source} L{f.level}
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

// Chosen sub-features (Fighting Styles / Metamagic / Eldritch Invocations) from
// level-up or creation. Expertise is NOT here — it appears in Skills as doubled bonus.
function SubFeaturesBlock({
  fightingStyles,
  metamagics,
  eldritchInvocations,
}: {
  fightingStyles: NamedRef[];
  metamagics: NamedRef[];
  eldritchInvocations: NamedRef[];
}) {
  if (
    fightingStyles.length === 0 &&
    metamagics.length === 0 &&
    eldritchInvocations.length === 0
  )
    return null;
  return (
    <section className="panel sheet__block">
      <h3 className="sheet__block-title">Sub-features</h3>
      <hr className="rule" />
      <dl className="sheet__traits">
        {fightingStyles.length > 0 && (
          <>
            <dt>Fighting Styles</dt>
            <dd>{fightingStyles.map((f) => f.name).join(", ")}</dd>
          </>
        )}
        {metamagics.length > 0 && (
          <>
            <dt>Metamagic</dt>
            <dd>{metamagics.map((m) => m.name).join(", ")}</dd>
          </>
        )}
        {eldritchInvocations.length > 0 && (
          <>
            <dt>Eldritch Invocations</dt>
            <dd>{eldritchInvocations.map((e) => e.name).join(", ")}</dd>
          </>
        )}
      </dl>
    </section>
  );
}

function TraitsBlock({ character }: { character: CharacterResponse }) {
  const c = character;
  const speeds = [
    `walk ${c.walkingSpeed}ft`,
    c.swimSpeed > 0 ? `swim ${c.swimSpeed}ft` : null,
    c.climbSpeed > 0 ? `climb ${c.climbSpeed}ft` : null,
    c.flySpeed > 0 ? `fly ${c.flySpeed}ft` : null,
  ].filter(Boolean);
  return (
    <section className="panel sheet__block">
      <h3 className="sheet__block-title">Traits</h3>
      <hr className="rule" />
      <dl className="sheet__traits">
        <dt>Speeds</dt>
        <dd>{speeds.join(" · ")}</dd>
        {c.darkvisionRange > 0 && (
          <>
            <dt>Darkvision</dt>
            <dd>{c.darkvisionRange}ft</dd>
          </>
        )}
        {c.languages.length > 0 && (
          <>
            <dt>Languages</dt>
            <dd>{c.languages.map((l) => l.name).join(", ")}</dd>
          </>
        )}
        {c.damageResistances.length > 0 && (
          <>
            <dt>Resistances</dt>
            <dd>
              {c.damageResistances
                .map((r) => `${r.damageType} (${resistanceLabel(r.kind)})`)
                .join(", ")}
            </dd>
          </>
        )}
      </dl>
    </section>
  );
}

function EncumbranceBlock({
  encumbrance,
}: {
  encumbrance: EncumbranceResponse;
}) {
  const e = encumbrance;
  return (
    <section className="panel sheet__block">
      <h3 className="sheet__block-title">Encumbrance</h3>
      <hr className="rule" />
      <p className="prof-list__name">
        {encumbranceLabel(e.level)}
        {e.isOverCapacity && (
          <span className="badge badge--accent"> over capacity</span>
        )}
      </p>
      <p className="text-faint">
        {e.carriedWeight} / {e.carryingCapacity} lb
        {e.speedPenalty !== 0 && <> · speed {e.speedPenalty}ft</>}
      </p>
    </section>
  );
}

// Surface ASP.NET problem-details field errors from a failed inventory op.
function describeOpError(err: unknown): string {
  if (err instanceof ApiError) {
    const body = err.body as { errors?: Record<string, string[]> } | undefined;
    const msgs = body?.errors ? Object.values(body.errors).flat() : [];
    return msgs.length
      ? `${err.status}: ${msgs.join("; ")}`
      : `${err.status}: ${err.message}`;
  }
  return "Backend unreachable.";
}

// The inventory panel with live add/consume/attune controls. Each op posts to the
// matching endpoint and swaps in the returned (re-derived) character — weight,
// currency-in-gold, attunement count, and encumbrance all update with it.
// readOnly (DM popup): render the item list with NO mutation controls and no
// add search — onMutated isn't wired in that mode.
function InventoryBlock({
  character,
  items,
  onMutated,
  readOnly,
}: {
  character: CharacterResponse;
  items: ItemResponse[];
  onMutated?: (updated: CharacterResponse) => void;
  readOnly: boolean;
}) {
  const c = character;
  const [busy, setBusy] = useState(false);
  const [opError, setOpError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const owned = useMemo(
    () => new Set(c.inventory.map((i) => i.itemId)),
    [c.inventory],
  );
  // Catalog search for adding new items (the catalog is large — match on demand).
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return items
      .filter((i) => i.name.toLowerCase().startsWith(q) && !owned.has(i.id))
      .slice(0, 20);
  }, [query, items, owned]);

  async function run(fn: () => Promise<CharacterResponse>) {
    if (!onMutated) return;
    setBusy(true);
    setOpError(null);
    try {
      onMutated(await fn());
    } catch (err) {
      setOpError(describeOpError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel sheet__block">
      <h3 className="sheet__block-title">Inventory</h3>
      <hr className="rule" />
      <p className="text-faint sheet__weight">
        {c.totalCarriedWeight} lb · {c.totalCurrencyInGold} gp ·{" "}
        {c.attunedItemCount} attuned
      </p>
      {opError && <p className="sheet__op-error">{opError}</p>}
      <ul className="prof-list">
        {c.inventory.map((it) => (
          <li
            key={it.itemId}
            className="prof-list__row sheet__inv-row tip"
            data-tooltip={[
              `${it.weight} lb`,
              `${it.cost} gp`,
              it.isMagic ? "magic" : null,
              it.requiresAttunement ? "requires attunement" : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          >
            <span className="prof-list__name sheet__inv-name">
              {it.name}
              {it.quantity > 1 && (
                <span className="text-faint"> ×{it.quantity}</span>
              )}
            </span>
            {it.requiresAttunement &&
              (readOnly ? (
                <span
                  className={
                    "badge sheet__attune" + (it.isAttuned ? " badge--accent" : "")
                  }
                >
                  {it.isAttuned ? "attuned" : "not attuned"}
                </span>
              ) : (
                <button
                  type="button"
                  className={
                    "badge sheet__attune" + (it.isAttuned ? " badge--accent" : "")
                  }
                  disabled={busy}
                  onClick={() =>
                    run(() =>
                      characters.setAttunement(c.id, it.itemId, {
                        isAttuned: !it.isAttuned,
                      }),
                    )
                  }
                >
                  {it.isAttuned ? "attuned" : "attune"}
                </button>
              ))}
            {!readOnly && (
              <span className="sheet__inv-qty">
                <button
                  type="button"
                  className="btn sheet__qty-btn"
                  disabled={busy}
                  title="Use one"
                  onClick={() =>
                    run(() =>
                      characters.inventoryConsume(c.id, {
                        itemId: it.itemId,
                        quantity: 1,
                      }),
                    )
                  }
                >
                  −
                </button>
                <button
                  type="button"
                  className="btn sheet__qty-btn"
                  disabled={busy}
                  title="Add one"
                  onClick={() =>
                    run(() =>
                      characters.inventoryAdd(c.id, {
                        itemId: it.itemId,
                        quantity: 1,
                      }),
                    )
                  }
                >
                  +
                </button>
              </span>
            )}
          </li>
        ))}
        {c.inventory.length === 0 && <li className="text-faint">Empty pack.</li>}
      </ul>

      {!readOnly && items.length > 0 && (
        <div className="sheet__inv-add">
          <input
            className="input"
            placeholder="Search items to add…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query.trim() && (
            <div className="sheet__inv-matches">
              {matches.length === 0 ? (
                <span className="text-faint">No matches.</span>
              ) : (
                matches.map((it) => (
                  <button
                    key={it.id}
                    type="button"
                    className="btn sheet__inv-match"
                    disabled={busy}
                    onClick={() =>
                      run(() =>
                        characters.inventoryAdd(c.id, {
                          itemId: it.id,
                          quantity: 1,
                        }),
                      ).then(() => setQuery(""))
                    }
                  >
                    + {it.name}
                    {it.isMagic && <span className="text-faint"> · magic</span>}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function StatusEffectsBlock({
  effects,
  rollModifiers,
  rollAdvantages,
  statNameById,
}: {
  effects: CharacterStatusEffectResponse[];
  rollModifiers: RollModifierResponse[];
  rollAdvantages: RollAdvantageResponse[];
  statNameById: Map<string, string>;
}) {
  if (effects.length === 0) return null;
  // Dice riders only (advantage/disadvantage are surfaced in their own list below).
  const diceRiders = rollModifiers.filter((m) => m.kind === RollModifierKind.Dice);
  const hasRollTime = diceRiders.length > 0 || rollAdvantages.length > 0;
  return (
    <section className="panel sheet__block">
      <h3 className="sheet__block-title">Status Effects</h3>
      <hr className="rule" />
      <ul className="prof-list">
        {effects.map((s) => (
          <li key={s.statusEffectId} className="prof-list__row">
            <span className="prof-list__name">{s.name}</span>
            <span
              className={
                "badge" + (s.isBeneficial ? " badge--accent" : "")
              }
            >
              {s.isBeneficial ? "buff" : "debuff"}
            </span>
          </li>
        ))}
      </ul>
      {hasRollTime && (
        <div className="sheet__roll-riders">
          {/* Roll-time riders: apply these when you roll (they can't be folded into
              the static bonuses, unlike flat modifiers — which already are). */}
          <h4 className="sheet__roll-riders-title">At roll time</h4>
          <ul className="sheet__roll-riders-list">
            {diceRiders.map((m, i) => (
              <li key={`d${i}`}>
                <span className="sheet__rider-dice">
                  {riderLine(m, m.appliesToStatId ? (statNameById.get(m.appliesToStatId) ?? null) : null)}
                </span>
                <span className="text-faint"> · {m.source}</span>
              </li>
            ))}
            {rollAdvantages.map((a, i) => (
              <li
                key={`a${i}`}
                className={
                  a.state === AdvantageState.Disadvantage
                    ? "sheet__rider-disadv"
                    : a.state === AdvantageState.Cancelled
                      ? "text-faint"
                      : "sheet__rider-adv"
                }
              >
                {advantageLine(a, a.appliesToStatId ? (statNameById.get(a.appliesToStatId) ?? null) : null)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function SavesBlock({
  savingThrows,
  modByStatId,
  prof,
}: {
  savingThrows: SavingThrowResponse[];
  modByStatId: Map<string, number>;
  prof: number;
}) {
  return (
    <section className="panel sheet__block">
      <h3 className="sheet__block-title">Saving Throws</h3>
      <hr className="rule" />
      <ul className="prof-list">
        {savingThrows.map((s) => {
          const m = modByStatId.get(s.statId) ?? 0;
          const tip = s.isProficient
            ? `ability mod ${fmtMod(m)} + proficiency ${fmtMod(prof)} = ${fmtMod(s.modifier)}`
            : `ability mod ${fmtMod(m)} (not proficient) = ${fmtMod(s.modifier)}`;
          return (
            <li key={s.statId} className="prof-list__row tip" data-tooltip={tip}>
              <span className={"dot" + (s.isProficient ? " dot--on" : "")} />
              <span className="prof-list__name">{s.name}</span>
              <span className="prof-list__val">{fmtMod(s.modifier)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SkillsBlock({
  skills,
  modByName,
  prof,
  hasJackOfAllTrades,
}: {
  skills: SkillBonusResponse[];
  modByName: Map<string, number>;
  prof: number;
  hasJackOfAllTrades: boolean;
}) {
  return (
    <section className="panel sheet__block">
      <h3 className="sheet__block-title">Skills</h3>
      <hr className="rule" />
      <ul className="prof-list">
        {skills.map((s) => {
          const m = modByName.get(s.ability) ?? 0;
          const expertise = s.level === SkillProficiencyLevel.Expertise;
          const parts = [`${s.ability} mod ${fmtMod(m)}`];
          if (s.isProficient)
            parts.push(`proficiency ${fmtMod(prof)}${expertise ? " ×2 (expertise)" : ""}`);
          else if (hasJackOfAllTrades)
            parts.push("½ proficiency (Jack of All Trades)");
          const tip = `${parts.join(" + ")} = ${fmtMod(s.bonus)}`;
          return (
            <li key={s.skillId} className="prof-list__row tip" data-tooltip={tip}>
              <span className={"dot" + (s.isProficient ? " dot--on" : "")} />
              <span className="prof-list__name">{s.name}</span>
              <span className="prof-list__val">{fmtMod(s.bonus)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
