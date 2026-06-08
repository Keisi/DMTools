import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { characters, reference } from "../api/endpoints";
import { ApiError } from "../api/client";
import type {
  CharacterResponse,
  SpellcastingResponse,
  SpellRef,
  SpellResponse,
} from "../api/types";
import "./ManageSpellsDialog.css";

/**
 * Quick spell editor opened from the sheet — a lighter path than the full Edit
 * wizard for changing a character's cantrips / prepared spells. Persists via
 * PUT /api/character/{id}/spells (backend 827c50d), which replaces the whole
 * known/prepared list with exactly the ids sent and returns the updated
 * character (existence-checked only, no count/class gate — a DM may pick freely).
 *
 * The pool is the spells available to the character's caster classes (from
 * spellcasting[].class), split into cantrips (level 0) and levelled spells.
 * Selections are uncapped: for prepared casters this is "which spells are
 * prepared", for known casters it's the known list — either way the DM owns it.
 */
export default function ManageSpellsDialog({
  characterId,
  spells: current,
  spellcasting,
  onClose,
  onApplied,
}: {
  characterId: string;
  spells: SpellRef[];
  spellcasting: SpellcastingResponse[];
  onClose: () => void;
  onApplied: (updated: CharacterResponse) => void;
}) {
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

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Pool = catalog spells castable by any of the character's caster classes,
  // matched case-insensitively against SpellResponse.classes — plus any spell the
  // character already has (even if off-class), so an existing pick is always
  // visible and removable rather than a hidden-but-counted selection.
  const { cantripPool, spellPool } = useMemo(() => {
    const casters = new Set(spellcasting.map((sc) => sc.class.toLowerCase()));
    const owned = new Set(current.map((s) => s.id));
    const include = (s: SpellResponse) =>
      owned.has(s.id) || s.classes.some((c) => casters.has(c.toLowerCase()));
    const cantrips: SpellResponse[] = [];
    const levelled: SpellResponse[] = [];
    for (const s of catalog) {
      if (!include(s)) continue;
      (s.level === 0 ? cantrips : levelled).push(s);
    }
    cantrips.sort((a, b) => a.name.localeCompare(b.name));
    levelled.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
    return { cantripPool: cantrips, spellPool: levelled };
  }, [catalog, spellcasting, current]);

  // Advisory cantrip target (sum of cantripsKnown across caster classes), shown
  // as guidance only — selection isn't capped.
  const cantripTarget = spellcasting.reduce(
    (sum, sc) => sum + (sc.cantripsKnown ?? 0),
    0,
  );

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

  return createPortal(
    <div className="mng-backdrop" onClick={onClose}>
      <div
        className="mng panel anim-pop-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Manage spells"
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
              Selections aren't capped — prepared casters prepare from their full
              list, so pick whatever's prepared. Saving replaces the whole list.
            </p>

            <SpellList
              title="Cantrips"
              pool={cantripPool}
              selected={cantripIds}
              onToggle={(id) => toggle(setCantripIds, id)}
              target={cantripTarget > 0 ? cantripTarget : undefined}
            />
            <SpellList
              title="Spells"
              pool={spellPool}
              selected={spellIds}
              onToggle={(id) => toggle(setSpellIds, id)}
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
      </div>
    </div>,
    document.body,
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

// A searchable, uncapped toggle list for one spell tier.
function SpellList({
  title,
  pool,
  selected,
  onToggle,
  target,
}: {
  title: string;
  pool: SpellResponse[];
  selected: string[];
  onToggle: (id: string) => void;
  target?: number;
}) {
  const [query, setQuery] = useState("");
  if (pool.length === 0) return null;
  const q = query.trim().toLowerCase();
  // Keep selected entries visible regardless of the filter so a search can't hide a pick.
  const shown = q
    ? pool.filter(
        (s) => selected.includes(s.id) || s.name.toLowerCase().startsWith(q),
      )
    : pool;
  return (
    <section className="mng__block">
      <h3 className="mng__block-title">
        {title} <span className="text-faint">({selected.length} selected</span>
        {target !== undefined && (
          <span className="text-faint"> · {target} known</span>
        )}
        <span className="text-faint">)</span>
      </h3>
      {pool.length > 8 && (
        <input
          className="input mng__search"
          placeholder={`Search ${pool.length} ${title.toLowerCase()}…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}
      <div className="mng__options">
        {shown.map((s) => {
          const on = selected.includes(s.id);
          return (
            <button
              key={s.id}
              type="button"
              className={"mng__option" + (on ? " mng__option--on" : "")}
              onClick={() => onToggle(s.id)}
            >
              {s.name}
              {s.level > 0 && <span className="text-faint"> · L{s.level}</span>}
            </button>
          );
        })}
        {shown.length === 0 && <span className="text-faint">No matches.</span>}
      </div>
    </section>
  );
}
