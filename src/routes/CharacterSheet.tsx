import { useEffect, useMemo, useState, type CSSProperties } from "react";
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
  type EncumbranceResponse,
  type ItemResponse,
  type SpellRef,
  type SpellcastingResponse,
  type WeaponAttackResponse,
} from "../api/types";
import { ApiError } from "../api/client";
import LevelUpDialog from "./LevelUpDialog";
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

export default function CharacterSheet() {
  const { id } = useParams<{ id: string }>();
  const [c, setC] = useState<CharacterResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [levelingUp, setLevelingUp] = useState(false);
  const [items, setItems] = useState<ItemResponse[]>([]);

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

  // The item catalog backs the inventory "add" picker (loaded once, optional).
  useEffect(() => {
    reference.items().then(setItems).catch(() => setItems([]));
  }, []);

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
  const hpTip =
    typeof c.hitPointsOverride === "number"
      ? `Custom override ${c.maxHitPoints} (derived would be ${c.derivedMaxHitPoints})`
      : "Derived from your hit dice + CON modifier per level";
  const acTip =
    typeof c.armorClassOverride === "number"
      ? `Custom override ${c.armorClass} (derived would be ${c.derivedArmorClass})`
      : c.equippedArmor
        ? `From ${c.equippedArmor.name}${c.equippedShield ? ` + ${c.equippedShield.name}` : ""}`
        : "Unarmored: 10 + DEX modifier";
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
  const saveTip = (statId: string, isProficient: boolean, total: number) => {
    const m = modByStatId.get(statId) ?? 0;
    return isProficient
      ? `ability mod ${fmtMod(m)} + proficiency ${fmtMod(prof)} = ${fmtMod(total)}`
      : `ability mod ${fmtMod(m)} (not proficient) = ${fmtMod(total)}`;
  };
  const skillTip = (
    ability: string,
    isProficient: boolean,
    expertise: boolean,
    total: number,
  ) => {
    const m = modByName.get(ability) ?? 0;
    const parts = [`${ability} mod ${fmtMod(m)}`];
    if (isProficient)
      parts.push(`proficiency ${fmtMod(prof)}${expertise ? " ×2 (expertise)" : ""}`);
    else if (c.hasJackOfAllTrades) parts.push("½ proficiency (Jack of All Trades)");
    return `${parts.join(" + ")} = ${fmtMod(total)}`;
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
              className="btn btn--primary sheet__levelup"
              onClick={() => setLevelingUp(true)}
            >
              Level Up
            </button>
            <Link to={`/character/${c.id}/edit`} className="btn">
              Edit
            </Link>
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

      <div className="sheet__cols">
        {/* ---- Saving throws ---- */}
        <section className="panel sheet__block">
          <h3 className="sheet__block-title">Saving Throws</h3>
          <hr className="rule" />
          <ul className="prof-list">
            {c.savingThrows.map((s) => (
              <li
                key={s.statId}
                className="prof-list__row tip"
                data-tooltip={saveTip(s.statId, s.isProficient, s.modifier)}
              >
                <span className={"dot" + (s.isProficient ? " dot--on" : "")} />
                <span className="prof-list__name">{s.name}</span>
                <span className="prof-list__val">{fmtMod(s.modifier)}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* ---- Skills ---- */}
        <section className="panel sheet__block">
          <h3 className="sheet__block-title">Skills</h3>
          <hr className="rule" />
          <ul className="prof-list">
            {c.skills.map((s) => (
              <li
                key={s.skillId}
                className="prof-list__row tip"
                data-tooltip={skillTip(
                  s.ability,
                  s.isProficient,
                  s.level === SkillProficiencyLevel.Expertise,
                  s.bonus,
                )}
              >
                <span className={"dot" + (s.isProficient ? " dot--on" : "")} />
                <span className="prof-list__name">{s.name}</span>
                <span className="prof-list__val">{fmtMod(s.bonus)}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* ---- Inventory ---- */}
        <InventoryBlock character={c} items={items} onMutated={setC} />
      </div>

      {/* ---- Combat / class detail ---- */}
      <div className="sheet__cols">
        <EquippedBlock character={c} />
        <AttacksBlock attacks={c.weaponAttacks} modByName={modByName} prof={prof} />
        <ResourcesBlock resources={c.resources} />
        <SpellcastingBlock
          spellcasting={c.spellcasting}
          spells={c.spells}
          modByName={modByName}
          prof={prof}
        />
      </div>

      <div className="sheet__cols">
        <FeaturesBlock features={c.features} />
        <TraitsBlock character={c} />
      </div>

      <div className="sheet__cols">
        <EncumbranceBlock encumbrance={c.encumbrance} />
        <StatusEffectsBlock effects={c.statusEffects} />
      </div>

      {levelingUp && (
        <LevelUpDialog
          characterId={c.id}
          classes={c.classes}
          abilityScores={c.abilityScores}
          onClose={() => setLevelingUp(false)}
          onApplied={(updated) => {
            setC(updated);
            setLevelingUp(false);
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
  const hasGear =
    !!c.equippedArmor || !!c.equippedShield || c.equippedWeapons.length > 0;
  if (!hasGear) return null;
  return (
    <section className="panel sheet__block">
      <h3 className="sheet__block-title">Equipped</h3>
      <hr className="rule" />
      <ul className="prof-list">
        {c.equippedArmor && (
          <EquipRow
            name={c.equippedArmor.name}
            slot="armor"
            warning={
              c.equippedArmorProficient === false
                ? "Not proficient with this armor — you can't cast spells and have disadvantage on STR/DEX checks, saves, and attacks while wearing it."
                : undefined
            }
          />
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

function SpellcastingBlock({
  spellcasting,
  spells,
  modByName,
  prof,
}: {
  spellcasting: SpellcastingResponse[];
  spells: SpellRef[];
  modByName: Map<string, number>;
  prof: number;
}) {
  if (spellcasting.length === 0 && spells.length === 0) return null;
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
            {sc.ability} · save DC {sc.saveDc} · atk {fmtMod(sc.spellAttackBonus)}
            {sc.spellSlots.length > 0 && (
              <>
                {" "}
                · slots{" "}
                {sc.spellSlots.map((s) => `L${s.level}×${s.count}`).join(", ")}
              </>
            )}
          </p>
        </div>
      ))}
      {spells.length > 0 && (
        <p className="text-muted sheet__spelllist">
          {spells
            .map((s) => (s.level === 0 ? s.name : `${s.name} (L${s.level})`))
            .join(", ")}
        </p>
      )}
    </section>
  );
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
            <span className="prof-list__name">{f.name}</span>{" "}
            <span className="text-faint">
              · {f.source} L{f.level}
            </span>
            {f.description && (
              <p className="text-muted sheet__feature-desc">{f.description}</p>
            )}
          </li>
        ))}
      </ul>
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
      .filter((i) => i.name.toLowerCase().includes(q) && !owned.has(i.id))
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
