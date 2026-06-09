import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { characters, reference } from "../api/endpoints";
import {
  EncumbranceLevel,
  ResistanceKind,
  ResourceRecharge,
  SkillProficiencyLevel,
  type AbilityScoreResponse,
  type CharacterFeatureResponse,
  type CharacterResourceResponse,
  type CharacterResponse,
  type CharacterStatusEffectResponse,
  type ClassResponse,
  type EncumbranceResponse,
  type SavingThrowResponse,
  type SkillBonusResponse,
  type ItemResponse,
  type NamedRef,
  type SpellRef,
  type SpellResponse,
  type SpellcastingResponse,
  type WeaponAttackResponse,
} from "../api/types";
import { ApiError } from "../api/client";
import LevelUpDialog from "./LevelUpDialog";
import ManageSpellsDialog from "./ManageSpellsDialog";
import EditHpDialog from "./EditHpDialog";
import { MAX_TOTAL_LEVEL } from "./CharacterBuilder.steps";
import "./CharacterSheet.css";

const fmtMod = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
// The API returns effective ability scores but NOT their modifier — derive it
// (pure 5e formula, not server state).
const abilityMod = (effective: number) => Math.floor((effective - 10) / 2);
// Exact composition of an effective ability score (all parts are in the response).
const abilityBreakdown = (a: AbilityScoreResponse) =>
  `Base ${a.base} · racial ${fmtMod(a.racialModifier)} · feat ${fmtMod(
    a.featModifier,
  )} · ASI ${fmtMod(a.improvementModifier)}  =  ${a.effective} (mod ${fmtMod(
    abilityMod(a.effective),
  )})`;

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

const BLOCK_KEYS = [
  "saves", "skills", "inventory", "equipped", "attacks",
  "resources", "spellcasting", "features", "subfeatures",
  "traits", "encumbrance", "status",
] as const;
type BlockKey = (typeof BLOCK_KEYS)[number];

function useSheetOrder(charId: string) {
  const storageKey = `dmtool.sheet.order.${charId}`;
  const [order, setOrder] = useState<BlockKey[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as string[];
        const known = new Set<string>(BLOCK_KEYS);
        const filtered = saved.filter((k): k is BlockKey => known.has(k));
        const added = BLOCK_KEYS.filter((k) => !filtered.includes(k));
        return [...filtered, ...added];
      }
    } catch {}
    return [...BLOCK_KEYS];
  });
  const dragIdx = useRef<number | null>(null);
  function onDragStart(idx: number) {
    dragIdx.current = idx;
  }
  function onDrop(toIdx: number) {
    const from = dragIdx.current;
    dragIdx.current = null;
    if (from === null || from === toIdx) return;
    setOrder((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(toIdx, 0, item);
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
      return next;
    });
  }
  return { order, onDragStart, onDrop };
}

function DraggableBlock({
  idx,
  onDragStart,
  onDrop,
  children,
}: {
  idx: number;
  onDragStart: (idx: number) => void;
  onDrop: (toIdx: number) => void;
  children: ReactNode;
}) {
  const [over, setOver] = useState(false);
  return (
    <div
      className={"sheet__draggable" + (over ? " sheet__draggable--over" : "")}
      draggable
      onDragStart={(e) => {
        onDragStart(idx);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onDrop(idx);
      }}
      onDragEnd={() => setOver(false)}
    >
      <span className="sheet__drag-handle" aria-hidden="true">⠿</span>
      {children}
    </div>
  );
}

function isBlockVisible(key: BlockKey, c: CharacterResponse): boolean {
  switch (key) {
    case "attacks": return c.weaponAttacks.length > 0;
    case "resources": return c.resources.length > 0;
    case "spellcasting": return c.spellcasting.length > 0 || c.spells.length > 0;
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

export default function CharacterSheet() {
  const { id } = useParams<{ id: string }>();
  const [c, setC] = useState<CharacterResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [levelingUp, setLevelingUp] = useState(false);
  const [addingClass, setAddingClass] = useState(false);
  const [managingSpells, setManagingSpells] = useState(false);
  const [editingHp, setEditingHp] = useState(false);
  const [items, setItems] = useState<ItemResponse[]>([]);
  const [allClasses, setAllClasses] = useState<ClassResponse[]>([]);
  const [spellCatalog, setSpellCatalog] = useState<SpellResponse[]>([]);

  useEffect(() => {
    if (!id) return;
    characters
      .get(id)
      .then(setC)
      .catch((err) =>
        setError(
          err instanceof ApiError
            ? `${err.status}: ${err.message}`
            : "Backend unreachable.",
        ),
      );
  }, [id]);

  // The item catalog backs the inventory "add" picker; the class catalog backs
  // the Multiclass dialog's "add which class" picker (both loaded once, optional).
  useEffect(() => {
    reference.items().then(setItems).catch(() => setItems([]));
    reference.classes().then(setAllClasses).catch(() => setAllClasses([]));
    // Spell catalog backs the dice/save display in the Spellcasting block (the
    // character's spell refs are thin; we join by id to the catalog's fields).
    reference.spells().then(setSpellCatalog).catch(() => setSpellCatalog([]));
  }, []);

  // Known spells joined to their catalog combat fields (Tier 1). Tier 2 will add
  // per-character computed dice onto the spell refs themselves; consume via the
  // spellCombat() resolver so only that resolver changes, not this wiring.
  const spellsById = useMemo(
    () => new Map(spellCatalog.map((s) => [s.id, s])),
    [spellCatalog],
  );
  // Must be before early returns — id is stable and equals c.id once loaded.
  const { order, onDragStart, onDrop } = useSheetOrder(id ?? "");

  if (error)
    return (
      <div className="container">
        <p className="text-faint">{error}</p>
        <Link to="/vault" className="btn">
          Back to Vault
        </Link>
      </div>
    );

  if (!c)
    return (
      <div className="container sheet__loading">
        <div className="skeleton" style={{ height: 120 }} />
        <div className="skeleton" style={{ height: 200 }} />
      </div>
    );

  const classLine = c.classes
    .map((cl) => `${cl.name} ${cl.level}`)
    .join(" / ");

  // Vital breakdown tooltips (from data already in the response).
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
    ? `Initiative = Dexterity modifier (${fmtMod(abilityMod(dex.effective))})`
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

  // Ability-modifier lookups for derived-number breakdowns (saves/skills/attacks/spells).
  const prof = c.proficiencyBonus;
  const modByStatId = new Map(
    c.abilityScores.map((a) => [a.statId, abilityMod(a.effective)]),
  );
  const modByName = new Map(
    c.abilityScores.map((a) => [a.name, abilityMod(a.effective)]),
  );
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
        return <InventoryBlock character={c} items={items} onMutated={setC} />;
      case "equipped":
        return <EquippedBlock character={c} />;
      case "attacks":
        return (
          <AttacksBlock attacks={c.weaponAttacks} modByName={modByName} prof={prof} />
        );
      case "resources":
        return <ResourcesBlock resources={c.resources} />;
      case "spellcasting":
        return (
          <SpellcastingBlock
            spellcasting={c.spellcasting}
            spells={c.spells}
            spellsById={spellsById}
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
        return <StatusEffectsBlock effects={c.statusEffects} />;
    }
  };

  return (
    <div className="container sheet anim-rise-in">
      {/* ---- Header ---- */}
      <header className="sheet__header panel">
        <div className="sheet__id">
          <h1 className="sheet__name">{c.name}</h1>
          <p className="text-muted">
            {c.race?.name} · {classLine} · Level {c.level}
          </p>
          <div className="sheet__actions">
            <button
              className="btn btn--primary"
              disabled={c.level >= MAX_TOTAL_LEVEL}
              title={
                c.level >= MAX_TOTAL_LEVEL
                  ? `At the level cap (${MAX_TOTAL_LEVEL}).`
                  : undefined
              }
              onClick={() => setLevelingUp(true)}
            >
              Level Up
            </button>
            <Link to={`/character/${c.id}/edit`} className="btn">
              Edit
            </Link>
            <button
              className="btn"
              disabled={c.level >= MAX_TOTAL_LEVEL}
              title={
                c.level >= MAX_TOTAL_LEVEL
                  ? `At the level cap (${MAX_TOTAL_LEVEL}).`
                  : undefined
              }
              onClick={() => setAddingClass(true)}
            >
              Multiclass
            </button>
            {c.spellcasting.length > 0 && (
              <button className="btn" onClick={() => setManagingSpells(true)}>
                Manage Spells
              </button>
            )}
            <button className="btn" onClick={() => setEditingHp(true)}>
              Edit HP
            </button>
          </div>
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
            <div className="ability__mod">{fmtMod(abilityMod(a.effective))}</div>
            <div className="ability__score">{a.effective}</div>
          </div>
        ))}
      </section>

      {/* ---- Reorderable blocks — drag the ⠿ handle to rearrange ---- */}
      <div className="sheet__cols">
        {order.map((key, idx) =>
          isBlockVisible(key, c) ? (
            <DraggableBlock
              key={key}
              idx={idx}
              onDragStart={onDragStart}
              onDrop={onDrop}
            >
              {renderBlock(key)}
            </DraggableBlock>
          ) : null,
        )}
      </div>

      {levelingUp && (
        <LevelUpDialog
          characterId={c.id}
          classes={c.classes}
          abilityScores={c.abilityScores}
          skills={c.skills}
          onClose={() => setLevelingUp(false)}
          onApplied={(updated) => {
            setC(updated);
            setLevelingUp(false);
          }}
        />
      )}

      {addingClass && (
        <LevelUpDialog
          characterId={c.id}
          classes={c.classes}
          abilityScores={c.abilityScores}
          skills={c.skills}
          mode="multiclass"
          addableClasses={allClasses.filter(
            (rc) => !c.classes.some((cc) => cc.classId === rc.id),
          )}
          onClose={() => setAddingClass(false)}
          onApplied={(updated) => {
            setC(updated);
            setAddingClass(false);
          }}
        />
      )}

      {managingSpells && (
        <ManageSpellsDialog
          character={c}
          onClose={() => setManagingSpells(false)}
          onApplied={(updated) => {
            setC(updated);
            setManagingSpells(false);
          }}
        />
      )}

      {editingHp && (
        <EditHpDialog
          character={c}
          onClose={() => setEditingHp(false)}
          onApplied={(updated) => {
            setC(updated);
            setEditingHp(false);
          }}
        />
      )}
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

function AttacksBlock({
  attacks,
  modByName,
  prof,
}: {
  attacks: WeaponAttackResponse[];
  modByName: Map<string, number>;
  prof: number;
}) {
  if (attacks.length === 0) return null;
  const anyNonProf = attacks.some((a) => !a.isProficient);
  const attackTip = (a: WeaponAttackResponse) => {
    const m = modByName.get(a.ability) ?? 0;
    const hit = a.isProficient
      ? `${a.ability} mod ${fmtMod(m)} + proficiency ${fmtMod(prof)}`
      : `${a.ability} mod ${fmtMod(m)} (not proficient)`;
    const dmg = a.damageDice
      ? ` · damage ${a.damageDice}${a.damageBonus !== 0 ? fmtMod(a.damageBonus) : ""}`
      : "";
    return `${hit} = ${fmtMod(a.attackBonus)} to hit${dmg}`;
  };
  return (
    <section className="panel sheet__block">
      <h3 className="sheet__block-title">Attacks</h3>
      <hr className="rule" />
      <ul className="prof-list">
        {attacks.map((a) => (
          <li
            key={a.weaponId}
            className="prof-list__row tip"
            data-tooltip={attackTip(a)}
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
            </span>
            <span className="prof-list__val">
              {fmtMod(a.attackBonus)}
              {a.damageDice && (
                <span className="text-faint">
                  {" "}
                  · {a.damageDice}
                  {a.damageBonus !== 0 ? fmtMod(a.damageBonus) : ""}
                </span>
              )}
            </span>
          </li>
        ))}
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
  spellsById,
  modByName,
  prof,
  charLevel,
}: {
  spellcasting: SpellcastingResponse[];
  spells: SpellRef[];
  spellsById: Map<string, SpellResponse>;
  modByName: Map<string, number>;
  prof: number;
  charLevel: number;
}) {
  if (spellcasting.length === 0 && spells.length === 0) return null;
  // Aggregate slots per spell level across all caster classes — annotated on each
  // level group so the slots stay visible next to that level's spells.
  const slotsByLevel = new Map<number, number>();
  for (const sc of spellcasting)
    for (const slot of sc.spellSlots)
      slotsByLevel.set(slot.level, (slotsByLevel.get(slot.level) ?? 0) + slot.count);
  const casterTip = (sc: SpellcastingResponse) => {
    const m = modByName.get(sc.ability) ?? 0;
    return `Save DC = 8 + proficiency ${fmtMod(prof)} + ${sc.ability} mod ${fmtMod(m)} = ${sc.saveDc}\nSpell attack = proficiency + ability mod = ${fmtMod(sc.spellAttackBonus)}`;
  };
  return (
    <section className="panel sheet__block">
      <h3 className="sheet__block-title">Spellcasting</h3>
      <hr className="rule" />
      {spellcasting.map((sc, i) => (
        <div
          key={`${sc.class}-${i}`}
          className="sheet__caster tip"
          data-tooltip={casterTip(sc)}
        >
          <p className="prof-list__name">{sc.class}</p>
          <p className="text-faint">
            {sc.ability} · save DC {sc.saveDc} · spell atk{" "}
            {fmtMod(sc.spellAttackBonus)}
          </p>
        </div>
      ))}
      {spellLevelGroups(spells, slotsByLevel).map((g) => (
        <div key={g.level} className="sheet__spell-group">
          <h4 className="sheet__spell-level">
            {g.level === 0 ? "Cantrips" : `Level ${g.level}`}
            {slotsByLevel.has(g.level) && (
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
                // Combat spells get the mechanics summary on hover; utility spells
                // (no dice/save) fall back to the spell's description.
                const tooltip =
                  inline && cat
                    ? spellTip(cat, combat!)
                    : (cat?.description ?? undefined);
                return (
                  <li
                    key={s.id}
                    className={"sheet__spell-row" + (tooltip ? " tip" : "")}
                    data-tooltip={tooltip}
                  >
                    <span className="sheet__spell-name">{s.name}</span>
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
function InventoryBlock({
  character,
  items,
  onMutated,
}: {
  character: CharacterResponse;
  items: ItemResponse[];
  onMutated: (updated: CharacterResponse) => void;
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
            {it.requiresAttunement && (
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
            )}
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
          </li>
        ))}
        {c.inventory.length === 0 && <li className="text-faint">Empty pack.</li>}
      </ul>

      {items.length > 0 && (
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
}: {
  effects: CharacterStatusEffectResponse[];
}) {
  if (effects.length === 0) return null;
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
