// Route wrapper for /character/:id (and /character/:id/edit's parent sheet).
// Owns the data fetch, reference catalogs, the action bar + Copy form, all the
// edit dialogs, and the drag-order persistence. The presentational body lives in
// CharacterSheetView (shared with the DM's read-only combat popup, Phase 3 of
// COMBAT-UX-PLAN); this component renders <CharacterSheetView readOnly={false}>
// and feeds it the action bar (headerActions), dialogs (footer), and drag wiring.
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { characters, reference } from "../api/endpoints";
import type {
  CharacterResponse,
  ClassResponse,
  ItemResponse,
  SpellResponse,
} from "../api/types";
import { ApiError } from "../api/client";
import { useBlockOrder } from "../lib/useBlockOrder";
import { BLOCK_KEYS } from "../lib/sheetBlocks";
import CharacterSheetView from "./CharacterSheetView";
import LevelUpDialog from "./LevelUpDialog";
import ManageSpellsDialog from "./ManageSpellsDialog";
import EditHpDialog from "./EditHpDialog";
import { MAX_TOTAL_LEVEL } from "./CharacterBuilder.steps";
import "./CharacterSheet.css";

export default function CharacterSheet() {
  const { id } = useParams<{ id: string }>();
  const [c, setC] = useState<CharacterResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [levelingUp, setLevelingUp] = useState(false);
  const [addingClass, setAddingClass] = useState(false);
  const [managingSpells, setManagingSpells] = useState(false);
  const [editingHp, setEditingHp] = useState(false);
  const [showCopyForm, setShowCopyForm] = useState(false);
  const [copyTarget, setCopyTarget] = useState("");
  const [copying, setCopying] = useState(false);
  const [copyMsg, setCopyMsg] = useState<{ ok: boolean; text: string } | null>(null);
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
  // Keeps the per-character storage key so users' saved orders survive the refactor.
  const { order, onDragStart, onDrop } = useBlockOrder(
    `dmtool.sheet.order.${id ?? ""}`,
    BLOCK_KEYS,
  );

  async function handleCopy(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !copyTarget.trim()) return;
    setCopying(true);
    setCopyMsg(null);
    try {
      const copy = await characters.copy(id, { targetUsername: copyTarget.trim() });
      setCopyMsg({ ok: true, text: `Copied to ${copyTarget.trim()} as "${copy.name}".` });
      setCopyTarget("");
      setShowCopyForm(false);
    } catch (err) {
      setCopyMsg({
        ok: false,
        text: err instanceof ApiError ? err.message : "Copy failed.",
      });
    }
    setCopying(false);
  }

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

  // Action bar + Copy form + Copy message — rendered inside .sheet__id, after the
  // race/class line (the headerActions slot).
  const headerActions = (
    <>
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
        <button
          className="btn"
          onClick={() => { setShowCopyForm((v) => !v); setCopyMsg(null); }}
        >
          Copy to User
        </button>
      </div>
      {showCopyForm && (
        <form className="sheet__copy-form" onSubmit={handleCopy}>
          <input
            className="input sheet__copy-input"
            placeholder="Target username"
            value={copyTarget}
            onChange={(e) => setCopyTarget(e.target.value)}
            autoFocus
            required
          />
          <button
            className="btn btn--primary"
            type="submit"
            disabled={copying || !copyTarget.trim()}
          >
            {copying ? "Copying…" : "Send Copy"}
          </button>
        </form>
      )}
      {copyMsg && (
        <p className={`sheet__copy-msg${copyMsg.ok ? " sheet__copy-msg--ok" : ""}`}>
          {copyMsg.text}
        </p>
      )}
    </>
  );

  // Dialogs — rendered after the block grid via the footer slot.
  const dialogs = (
    <>
      {levelingUp && (
        <LevelUpDialog
          characterId={c.id}
          classes={c.classes}
          abilityScores={c.abilityScores}
          skills={c.skills}
          currentSpells={c.spells}
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
    </>
  );

  return (
    <CharacterSheetView
      character={c}
      readOnly={false}
      headerActions={headerActions}
      footer={dialogs}
      items={items}
      spellsById={spellsById}
      onMutated={setC}
      dragHandlers={{ order, onDragStart, onDrop }}
    />
  );
}
