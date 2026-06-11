import { useEffect, useMemo, useState } from "react";
import { characters, reference } from "../api/endpoints";
import { ApiError } from "../api/client";
import Modal from "../components/Modal";
import type { CharacterResponse, SpellResponse } from "../api/types";
import "./ManageSpellsDialog.css";

const abilityMod = (effective: number) => Math.floor((effective - 10) / 2);

/**
 * Quick spell editor opened from the sheet — a lighter path than the full Edit
 * wizard for changing a character's cantrips / prepared spells. Persists via
 * PUT /api/character/{id}/spells (backend 827c50d), which replaces the whole
 * known/prepared list with exactly the ids sent and returns the updated
 * character (existence-checked only, no count/class gate — a DM may pick freely).
 *
 * Selection is uncapped (DM tool), but we surface the rules-as-written target per
 * tier so the player knows how many they "should" have: cantrips = cantripsKnown;
 * levelled = spellsKnown for known casters, or (casting mod + class level) for
 * prepared casters (Cleric/Druid/Wizard). Exceeding it shows a soft warning, not
 * a block. The levelled list is grouped by spell level to tame its length.
 */
export default function ManageSpellsDialog({
  character,
  onClose,
  onApplied,
}: {
  character: CharacterResponse;
  onClose: () => void;
  onApplied: (updated: CharacterResponse) => void;
}) {
  const { id: characterId, spells: current, spellcasting } = character;
  const [catalog, setCatalog] = useState<SpellResponse[]>([]);
  const [cantripIds, setCantripIds] = useState<string[]>(
    current.filter((s) => s.level === 0).map((s) => s.id),
  );
  const [spellIds, setSpellIds] = useState<string[]>(
    current.filter((s) => s.level > 0).map((s) => s.id),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    reference.spells().then(setCatalog).catch(() => setCatalog([]));
  }, []);


  // Pool = catalog spells castable by any of the character's caster classes,
  // matched case-insensitively against SpellResponse.classes — plus any spell the
  // character already has (even if off-class), so an existing pick is always
  // visible and removable rather than a hidden-but-counted selection.
  const { cantripPool, spellPool, maxSpellLevel } = useMemo(() => {
    const casters = new Set(spellcasting.map((sc) => sc.class.toLowerCase()));
    const owned = new Set(current.map((s) => s.id));
    // Highest castable spell level = highest slot level the character has. 5e
    // doesn't cap how MANY spells you can have per level, but you can't prepare/
    // know a spell above your highest slot — so don't offer those.
    let maxLevel = 0;
    for (const sc of spellcasting)
      for (const slot of sc.spellSlots)
        if (slot.level > maxLevel) maxLevel = slot.level;
    const inClass = (s: SpellResponse) =>
      s.classes.some((c) => casters.has(c.toLowerCase()));
    const cantrips: SpellResponse[] = [];
    const levelled: SpellResponse[] = [];
    for (const s of catalog) {
      const isOwned = owned.has(s.id);
      if (!isOwned && !inClass(s)) continue;
      if (s.level === 0) cantrips.push(s);
      // Offer levelled spells only up to the max castable level; always keep an
      // already-known spell visible (even if over-level) so it can be removed.
      else if (isOwned || s.level <= maxLevel) levelled.push(s);
    }
    cantrips.sort((a, b) => a.name.localeCompare(b.name));
    levelled.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
    return { cantripPool: cantrips, spellPool: levelled, maxSpellLevel: maxLevel };
  }, [catalog, spellcasting, current]);

  // Rules-as-written targets (advisory; selection isn't capped). Cantrips are
  // KNOWN for every caster. Levelled: known casters expose spellsKnown; prepared
  // casters prepare (casting-ability mod + class level), which the API doesn't
  // return, so derive it from the character's scores + caster levels.
  const { cantripTarget, spellTarget, spellTargetLabel } = useMemo(() => {
    const modByName = new Map(
      character.abilityScores.map((a) => [a.name, abilityMod(a.effective)]),
    );
    const levelByClass = new Map(
      character.classes.map((c) => [c.name, c.level]),
    );
    let cantrips = 0;
    let spells = 0;
    let anyPrepared = false;
    let anyKnown = false;
    for (const sc of spellcasting) {
      cantrips += sc.cantripsKnown ?? 0;
      const known = sc.spellsKnown;
      if (known === null || known === undefined) {
        // Prepared caster: prepares (mod + class level), minimum 1.
        const mod = modByName.get(sc.ability) ?? 0;
        const lvl = levelByClass.get(sc.class) ?? 0;
        spells += Math.max(1, mod + lvl);
        anyPrepared = true;
      } else {
        spells += known;
        anyKnown = true;
      }
    }
    const label =
      anyPrepared && !anyKnown
        ? "prepared"
        : anyKnown && !anyPrepared
          ? "known"
          : "suggested";
    return {
      cantripTarget: cantrips,
      spellTarget: spells,
      spellTargetLabel: label,
    };
  }, [character.abilityScores, character.classes, spellcasting]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const updated = await characters.updateSpells(characterId, {
        cantripIds,
        spellIds,
      });
      onApplied(updated);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `${err.status}: ${err.message}`
          : "Could not reach the server.",
      );
      setBusy(false);
    }
  }

  return (
    <Modal
      onClose={onClose}
      ariaLabel="Manage spells"
      backdropClassName="mng-backdrop"
      className="mng panel anim-pop-in"
    >
        <header className="mng__head">
          <h2>Manage Spells</h2>
          <button className="btn btn--ghost" onClick={onClose}>
            Close
          </button>
        </header>

        {spellcasting.length === 0 ? (
          <p className="text-faint">This character has no spellcasting.</p>
        ) : (
          <>
            <p className="text-faint mng__hint">
              Editing spells for {spellcasting.map((sc) => sc.class).join(", ")}.
              The counts below are what 5e suggests; selection isn't capped, so a
              DM can prepare/swap freely.
              {maxSpellLevel > 0 &&
                ` Levelled spells are offered up to level ${maxSpellLevel} (your highest slot). 5e sets no per-level count limit — only the total and the max castable level.`}{" "}
              Saving replaces the whole list.
            </p>

            <SpellList
              title="Cantrips"
              pool={cantripPool}
              selected={cantripIds}
              onToggle={(id) => toggle(setCantripIds, id)}
              target={cantripTarget > 0 ? cantripTarget : undefined}
              targetLabel="known"
              groupByLevel={false}
            />
            <SpellList
              title="Spells"
              pool={spellPool}
              selected={spellIds}
              onToggle={(id) => toggle(setSpellIds, id)}
              target={spellTarget > 0 ? spellTarget : undefined}
              targetLabel={spellTargetLabel}
              groupByLevel
            />

            {error && <p className="mng__error">{error}</p>}
            <div className="mng__actions">
              <button
                className="btn btn--primary"
                disabled={busy}
                onClick={save}
              >
                {busy ? "Saving..." : "Save spells"}
              </button>
            </div>
          </>
        )}
    </Modal>
  );
}

function toggle(
  setter: React.Dispatch<React.SetStateAction<string[]>>,
  id: string,
) {
  setter((prev) =>
    prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
  );
}

// A searchable, uncapped toggle list for one spell tier. Shows an advisory
// target + a soft over-selection warning, and (for levelled spells) groups the
// options under per-spell-level headings so a long list stays scannable.
function SpellList({
  title,
  pool,
  selected,
  onToggle,
  target,
  targetLabel,
  groupByLevel,
}: {
  title: string;
  pool: SpellResponse[];
  selected: string[];
  onToggle: (id: string) => void;
  target?: number;
  targetLabel: string;
  groupByLevel: boolean;
}) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  if (pool.length === 0) return null;
  const q = query.trim().toLowerCase();
  // Keep selected entries visible regardless of the filter so a search can't hide a pick.
  const shown = q
    ? pool.filter(
        (s) => selected.includes(s.id) || s.name.toLowerCase().startsWith(q),
      )
    : pool;
  const over = target !== undefined && selected.length > target;

  // Group by spell level for the levelled list; cantrips render as one group.
  const groups = groupByLevel
    ? [...new Map(shown.map((s) => [s.level, true])).keys()]
        .sort((a, b) => a - b)
        .map((lvl) => ({
          label: `Level ${lvl}`,
          items: shown.filter((s) => s.level === lvl),
        }))
    : [{ label: "", items: shown }];

  return (
    <section className="mng__block">
      <div className="mng__block-head">
        <h3 className="mng__block-title">
          {title}{" "}
          <span className="text-faint">
            ({selected.length} selected
            {target !== undefined && ` · ${target} ${targetLabel}`})
          </span>
        </h3>
        <button
          type="button"
          className="btn btn--ghost mng__collapse"
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? "Show" : "Hide"}
        </button>
      </div>
      {!collapsed && (
        <>
          {over && (
            <p className="mng__warn">
              ⚠ {selected.length} selected — more than the {target} {targetLabel}.
              Allowed (DM override), but double-check it's intended.
            </p>
          )}
          {pool.length > 8 && (
            <input
              className="input mng__search"
              placeholder={`Search ${pool.length} ${title.toLowerCase()}…`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          )}
          {shown.length === 0 && <span className="text-faint">No matches.</span>}
          {groups.map((g) => (
            <div key={g.label || "all"} className="mng__group">
              {g.label && <h4 className="mng__group-title">{g.label}</h4>}
              <div className="mng__options">
                {g.items.map((s) => {
                  const on = selected.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className={"mng__option" + (on ? " mng__option--on" : "")}
                      onClick={() => onToggle(s.id)}
                    >
                      {s.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}
    </section>
  );
}
