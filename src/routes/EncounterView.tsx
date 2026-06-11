import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { campaigns, characters as charApi } from "../api/endpoints";
import type {
  EncounterResponse,
  CampaignCharacterResponse,
  CampaignMemberResponse,
  CombatantResponse,
  UpdateCombatantRequest,
} from "../api/types";
import { CampaignMemberStatus, CombatantDisposition, EncounterStatus } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../api/client";
import { useEncounterHub, HubStatus } from "../hooks/useEncounterHub";
import PlayerEncounterView from "./PlayerEncounterView";
import DeathSaveTrack from "../components/DeathSaveTrack";
import Modal from "../components/Modal";
import "./EncounterView.css";

type Side = "ally" | "enemy";
const SIDES_KEY = (eid: string) => `dmtool-enc-sides-${eid}`;

// Combatants view mode: split by side (default) vs. a single initiative-sorted
// turn-order list (DM-only, see the toggle in the Combatants section header).
type ViewMode = "sides" | "initiative";
const VIEW_KEY = (eid: string) => `dmtool-enc-view-${eid}`;

function loadView(encounterId: string): ViewMode {
  return localStorage.getItem(VIEW_KEY(encounterId)) === "initiative"
    ? "initiative"
    : "sides";
}

function loadSides(encounterId: string): Record<string, Side> {
  try {
    return JSON.parse(
      localStorage.getItem(SIDES_KEY(encounterId)) ?? "{}",
    ) as Record<string, Side>;
  } catch {
    return {};
  }
}

function saveSides(encounterId: string, map: Record<string, Side>) {
  localStorage.setItem(SIDES_KEY(encounterId), JSON.stringify(map));
}

export default function EncounterView() {
  const { id: campaignId = "", encounterId = "" } = useParams<{
    id: string;
    encounterId: string;
  }>();
  const { userId } = useAuth();
  const navigate = useNavigate();

  const [encounter, setEncounter] = useState<EncounterResponse | null>(null);
  const [campChars, setCampChars] = useState<CampaignCharacterResponse[]>([]);
  const [members, setMembers] = useState<CampaignMemberResponse[]>([]);
  const [dmUserId, setDmUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Side map: combatantId → 'ally' | 'enemy', persisted to localStorage
  const [sideMap, setSideMap] = useState<Record<string, Side>>({});

  // Per-combatant initiative inputs
  const [initInputs, setInitInputs] = useState<Record<string, string>>({});
  // Per-combatant HP delta
  const [deltaInputs, setDeltaInputs] = useState<Record<string, string>>({});
  // Per-combatant direct set HP
  const [setHpInputs, setSetHpInputs] = useState<Record<string, string>>({});
  // Per-combatant direct set Temp HP
  const [tempHpInputs, setTempHpInputs] = useState<Record<string, string>>({});
  // Per-combatant stat edits (unlinked combatants only)
  const [nameInputs, setNameInputs] = useState<Record<string, string>>({});
  const [maxHpInputs, setMaxHpInputs] = useState<Record<string, string>>({});
  const [acInputs, setAcInputs] = useState<Record<string, string>>({});

  // Ally add form
  const [allyName, setAllyName] = useState("");
  const [allyMaxHp, setAllyMaxHp] = useState("");
  const [allyAc, setAllyAc] = useState("");
  const [allyCharId, setAllyCharId] = useState("");
  const [allyAdding, setAllyAdding] = useState(false);

  // Enemy add form
  const [enemyName, setEnemyName] = useState("");
  const [enemyMaxHp, setEnemyMaxHp] = useState("");
  const [enemyAc, setEnemyAc] = useState("");
  const [enemyAdding, setEnemyAdding] = useState(false);

  const [actionBusy, setActionBusy] = useState(false);
  const [busyCombatant, setBusyCombatant] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  // Combatants view mode (DM-only toggle): 'sides' = ally/enemy split;
  // 'initiative' = single turn-order-sorted list, no add forms.
  const [viewMode, setViewMode] = useState<ViewMode>(() => loadView(encounterId));
  const [endConfirm, setEndConfirm] = useState(false);
  const [initiativeWarning, setInitiativeWarning] = useState<string[] | null>(null);

  // Set when a live EncounterArchived push arrives for a viewer who didn't
  // trigger the delete (the DM who archives navigates away in handleDelete).
  const [archived, setArchived] = useState(false);

  const isDm = dmUserId === userId;
  const activeMemberIds = new Set(
    members.filter((m) => m.status === CampaignMemberStatus.Active).map((m) => m.userId),
  );
  const activeCampChars = campChars.filter(
    (cc) => cc.ownerId === dmUserId || activeMemberIds.has(cc.ownerId),
  );
  const status = encounter?.status ?? EncounterStatus.Pending;
  const isPending = status === EncounterStatus.Pending;
  const isActive = status === EncounterStatus.Active;
  const isEnded = status === EncounterStatus.Ended;

  function syncInitInputs(enc: EncounterResponse) {
    setInitInputs((prev) => {
      const next: Record<string, string> = {};
      enc.combatants.forEach((c) => {
        next[c.id] =
          c.id in prev
            ? prev[c.id]
            : c.initiative !== null
              ? String(c.initiative)
              : "";
      });
      return next;
    });
  }

  function applyUpdate(enc: EncounterResponse) {
    setEncounter(enc);
    syncInitInputs(enc);
    // Clear per-combatant edit buffers so inputs reflect the authoritative server value.
    const ids = new Set(enc.combatants.map((c) => c.id));
    setNameInputs((p) => Object.fromEntries(Object.entries(p).filter(([k]) => !ids.has(k))));
    setMaxHpInputs((p) => Object.fromEntries(Object.entries(p).filter(([k]) => !ids.has(k))));
    setAcInputs((p) => Object.fromEntries(Object.entries(p).filter(([k]) => !ids.has(k))));
    setError(null);
  }

  // Live sync: hub pushes flow through the same applyUpdate as REST responses,
  // so the DM's own mutations and any other observer's view stay identical.
  // Connect only after the initial REST load (enabled=!loading) to avoid a push
  // landing before `encounter` exists.
  const hubStatus = useEncounterHub({
    encounterId,
    enabled: !loading,
    onUpdated: applyUpdate,
    onArchived: () => setArchived(true),
  });

  // After a mutation, find the newly added combatant (id not previously in encounter)
  // and assign it the given side.
  function assignNewCombatantSide(
    prevCombatants: CombatantResponse[],
    enc: EncounterResponse,
    side: Side,
  ) {
    const oldIds = new Set(prevCombatants.map((c) => c.id));
    const newC = enc.combatants.find((c) => !oldIds.has(c.id));
    if (newC) {
      setSideMap((prev) => {
        const next = { ...prev, [newC.id]: side };
        saveSides(encounterId, next);
        return next;
      });
    }
  }

  useEffect(() => {
    let active = true;
    Promise.all([
      campaigns.getEncounter(campaignId, encounterId),
      campaigns.get(campaignId),
      campaigns.characters(campaignId),
      campaigns.members(campaignId),
    ])
      .then(([enc, camp, chars, mems]) => {
        if (!active) return;
        setError(null);
        setEncounter(enc);
        syncInitInputs(enc);
        setDmUserId(camp.dmUserId);
        setCampChars(chars);
        setMembers(mems);

        const stored = loadSides(encounterId);
        const defaulted: Record<string, Side> = {};
        enc.combatants.forEach((c) => {
          defaulted[c.id] = stored[c.id] ?? (c.characterId ? "ally" : "enemy");
        });
        setSideMap(defaulted);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(
          err instanceof ApiError ? err.message : "Failed to load encounter.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [campaignId, encounterId]);

  async function handleStart() {
    const missing = (encounter?.combatants ?? [])
      .filter((c) => c.initiative === null || c.initiative === undefined)
      .map((c) => c.name);
    if (missing.length > 0) {
      setInitiativeWarning(missing);
      return;
    }
    setActionBusy(true);
    try {
      const enc = await campaigns.startEncounter(campaignId, encounterId);
      setEncounter(enc);
      const freshInputs: Record<string, string> = {};
      enc.combatants.forEach((c) => {
        freshInputs[c.id] = c.initiative !== null ? String(c.initiative) : "";
      });
      setInitInputs(freshInputs);
      setError(null);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to start encounter.",
      );
    }
    setActionBusy(false);
  }

  async function handleNextTurn() {
    setActionBusy(true);
    try {
      applyUpdate(await campaigns.nextTurn(campaignId, encounterId));
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to advance turn.",
      );
    }
    setActionBusy(false);
  }

  // Undo an accidental Next Turn — steps the active-combatant pointer back one
  // (and back a round when stepping past the top of the order). Backend support
  // pending; see FRONTEND-REQUEST-encounter-combat-controls.md (item 1).
  async function handleUndoTurn() {
    setActionBusy(true);
    try {
      applyUpdate(await campaigns.prevTurn(campaignId, encounterId));
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Failed to undo turn. The backend endpoint may not be live yet (see FRONTEND-REQUEST-encounter-combat-controls.md).",
      );
    }
    setActionBusy(false);
  }

  async function handleEnd() {
    setActionBusy(true);
    try {
      applyUpdate(await campaigns.endEncounter(campaignId, encounterId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to end combat.");
    }
    setActionBusy(false);
  }

  async function handleDelete() {
    if (!confirm("Archive this encounter? This cannot be undone.")) return;
    setActionBusy(true);
    try {
      await campaigns.deleteEncounter(campaignId, encounterId);
      navigate(`/campaigns/${campaignId}`);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to archive encounter.",
      );
      setActionBusy(false);
    }
  }

  async function handleRandomizeInitiatives() {
    const combatants = encounter?.combatants ?? [];
    if (combatants.length === 0) return;
    setActionBusy(true);
    try {
      // Server-side roll (backend 92eadf8): d20 + the linked character's
      // initiative bonus per combatant (flat d20 for NPCs), one round-trip.
      const enc = await campaigns.rollInitiatives(campaignId, encounterId);
      applyUpdate(enc);
      // syncInitInputs preserves existing inputs; force-overwrite after a roll
      // so the fields reflect the server's authoritative values immediately.
      const rolled: Record<string, string> = {};
      enc.combatants.forEach((c) => {
        rolled[c.id] = c.initiative !== null ? String(c.initiative) : "";
      });
      setInitInputs(rolled);
      setInitiativeWarning(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to set initiatives.");
    }
    setActionBusy(false);
  }

  async function handleSetInitiative(c: CombatantResponse) {
    const val = parseInt(initInputs[c.id] ?? "", 10);
    if (isNaN(val)) return;
    setBusyCombatant(c.id);
    try {
      applyUpdate(
        await campaigns.setInitiative(campaignId, encounterId, c.id, {
          initiative: val,
        }),
      );
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to set initiative.",
      );
    }
    setBusyCombatant(null);
  }

  async function handleApplyDelta(c: CombatantResponse, heal: boolean) {
    const raw = parseInt(deltaInputs[c.id] ?? "", 10);
    if (isNaN(raw) || raw === 0) return;
    const delta = heal ? Math.abs(raw) : -Math.abs(raw);
    setBusyCombatant(c.id);
    try {
      applyUpdate(
        await campaigns.updateCombatantHp(campaignId, encounterId, c.id, {
          delta,
        }),
      );
      setDeltaInputs((prev) => ({ ...prev, [c.id]: "" }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update HP.");
    }
    setBusyCombatant(null);
  }

  async function handleSetHp(c: CombatantResponse) {
    const val = parseInt(setHpInputs[c.id] ?? "", 10);
    if (isNaN(val)) return;
    setBusyCombatant(c.id);
    try {
      applyUpdate(
        await campaigns.updateCombatantHp(campaignId, encounterId, c.id, {
          setCurrentHp: val,
        }),
      );
      setSetHpInputs((prev) => ({ ...prev, [c.id]: "" }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to set HP.");
    }
    setBusyCombatant(null);
  }

  async function handleSetTempHp(c: CombatantResponse) {
    const val = parseInt(tempHpInputs[c.id] ?? "", 10);
    if (isNaN(val) || val < 0) return;
    setBusyCombatant(c.id);
    try {
      applyUpdate(
        await campaigns.updateCombatantHp(campaignId, encounterId, c.id, {
          setTempHp: val,
        }),
      );
      setTempHpInputs((prev) => ({ ...prev, [c.id]: "" }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to set temp HP.");
    }
    setBusyCombatant(null);
  }

  function changeView(mode: ViewMode) {
    setViewMode(mode);
    localStorage.setItem(VIEW_KEY(encounterId), mode);
  }

  async function handleRemove(id: string) {
    setBusyCombatant(id);
    try {
      applyUpdate(await campaigns.removeCombatant(campaignId, encounterId, id));
      setSideMap((prev) => {
        const next = { ...prev };
        delete next[id];
        saveSides(encounterId, next);
        return next;
      });
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to remove combatant.",
      );
    }
    setBusyCombatant(null);
  }

  async function handleAddAlly(e: React.FormEvent) {
    e.preventDefault();
    const maxHp = parseInt(allyMaxHp, 10);
    const ac = parseInt(allyAc, 10);
    if (!allyName.trim() || isNaN(maxHp) || isNaN(ac)) return;
    setAllyAdding(true);
    const prev = encounter?.combatants ?? [];
    try {
      const enc = await campaigns.addCombatant(campaignId, encounterId, {
        name: allyName.trim(),
        maxHp,
        armorClass: ac,
        characterId: allyCharId || null,
      });
      assignNewCombatantSide(prev, enc, "ally");
      applyUpdate(enc);
      setAllyName("");
      setAllyMaxHp("");
      setAllyAc("");
      setAllyCharId("");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to add combatant.",
      );
    }
    setAllyAdding(false);
  }

  async function handleAddEnemy(e: React.FormEvent) {
    e.preventDefault();
    const maxHp = parseInt(enemyMaxHp, 10);
    const ac = parseInt(enemyAc, 10);
    if (!enemyName.trim() || isNaN(maxHp) || isNaN(ac)) return;
    setEnemyAdding(true);
    const prev = encounter?.combatants ?? [];
    try {
      const enc = await campaigns.addCombatant(campaignId, encounterId, {
        name: enemyName.trim(),
        maxHp,
        armorClass: ac,
        characterId: null,
      });
      assignNewCombatantSide(prev, enc, "enemy");
      applyUpdate(enc);
      setEnemyName("");
      setEnemyMaxHp("");
      setEnemyAc("");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to add combatant.",
      );
    }
    setEnemyAdding(false);
  }

  function handleAllyCharSelect(charId: string) {
    setAllyCharId(charId);
    if (!charId) return;
    const ch = campChars.find((c) => c.characterId === charId);
    if (ch && !allyName) setAllyName(ch.characterName);
    charApi
      .get(charId)
      .then((sheet) => {
        setAllyMaxHp(String(sheet.maxHitPoints));
        setAllyAc(String(sheet.armorClass));
      })
      .catch((e) => {
        // Best-effort stat prefill; the DM can still enter HP/AC by hand.
        console.warn("[EncounterView] ally stat prefill failed:", e);
      });
  }

  async function handleClone(c: CombatantResponse) {
    const prev = encounter?.combatants ?? [];
    setBusyCombatant(c.id);
    try {
      const enc = await campaigns.addCombatant(campaignId, encounterId, {
        name: c.name,
        maxHp: c.maxHp,
        armorClass: c.armorClass,
        characterId: null,
      });
      assignNewCombatantSide(prev, enc, "enemy");
      applyUpdate(enc);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Clone failed.");
    } finally {
      setBusyCombatant(null);
    }
  }

  async function handleUpdateCombatant(c: CombatantResponse, patch: UpdateCombatantRequest) {
    setBusyCombatant(c.id);
    try {
      const enc = await campaigns.updateCombatant(campaignId, encounterId, c.id, patch);
      applyUpdate(enc);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Update failed.");
    } finally {
      setBusyCombatant(null);
    }
  }

  // Shared combatant row renderer. `rank` (1-based) is supplied by the
  // initiative view to show the turn-order position; omitted in the sides view.
  function renderCombatant(c: CombatantResponse, rank?: number) {
    const isTurn = c.id === encounter!.activeCombatantId;
    const isBusy = busyCombatant === c.id;
    const isEnemy = sideOf(c) === "enemy";
    const isUnlinked = c.characterId === null;
    // Two phases of DM controls:
    //  - editing: building/configuring the encounter (pending, or the Edit toggle) —
    //    initiative, stat edits, side/visibility, clone, remove, add forms.
    //  - combatActive: running the fight (active, not editing) — only HP actions.
    const editing = isPending || editMode;
    const combatActive = isActive && !editMode;
    // HP bar scaled by (maxHp + tempHp) so current HP, missing HP, and temp HP
    // segments are all proportional within one bar.
    const hpScale = c.maxHp + c.tempHp;
    const hpPct = hpScale > 0 ? Math.max(0, (c.currentHp / hpScale) * 100) : 0;
    const tempPct = hpScale > 0 ? Math.max(0, (c.tempHp / hpScale) * 100) : 0;
    return (
      <li
        key={c.id}
        className={`enc__combatant${isTurn ? " enc__combatant--active" : ""}${!c.isActive ? " enc__combatant--inactive" : ""}`}
      >
        <div className="enc__comb-left">
          {rank !== undefined ? (
            <span
              className={`enc__rank tip${isTurn ? " enc__rank--active" : ""}`}
              data-tooltip={isTurn ? "Acting now" : "Turn order"}
            >
              {isTurn ? "⚔" : rank}
            </span>
          ) : (
            <span className="enc__turn-dot" aria-hidden="true">
              {isTurn ? "⚔" : "·"}
            </span>
          )}
          <div className="enc__comb-info">
            <span className="enc__comb-name">{c.name}</span>
            <span className="text-muted enc__comb-ac">AC&nbsp;{c.armorClass}</span>
          </div>
          <div className="enc__hp-wrap">
            <div className="enc__hp-bar">
              <div className="enc__hp-fill" style={{ width: `${hpPct}%` }} />
              {c.tempHp > 0 && (
                <div
                  className="enc__hp-temp-fill"
                  style={{ width: `${tempPct}%` }}
                />
              )}
            </div>
            <span className="enc__hp-text">
              {c.currentHp}&thinsp;/&thinsp;{c.maxHp}
              {c.tempHp > 0 && (
                <span className="enc__hp-temp"> +{c.tempHp}&thinsp;tmp</span>
              )}
            </span>
          </div>
        </div>

        {isDm && !isEnded && (
          <div className="enc__comb-controls">
            {editing && (
              <div className="enc__ctrl-grp">
                <span className="enc__ctrl-label">Initiative</span>
                <div className="enc__ctrl-row">
                  <input
                    type="number"
                    className="input enc__init-inp"
                    value={initInputs[c.id] ?? ""}
                    onChange={(e) =>
                      setInitInputs((prev) => ({
                        ...prev,
                        [c.id]: e.target.value,
                      }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSetInitiative(c);
                    }}
                    disabled={isBusy}
                    placeholder="—"
                  />
                  <button
                    className="btn enc__set-btn"
                    disabled={isBusy}
                    onClick={() => handleSetInitiative(c)}
                  >
                    Set
                  </button>
                </div>
              </div>
            )}

            {combatActive && (
              <div className="enc__ctrl-grp">
                <span className="enc__ctrl-label">Damage / Heal</span>
                <div className="enc__ctrl-row">
                  <input
                    type="number"
                    className="input enc__delta-inp"
                    value={deltaInputs[c.id] ?? ""}
                    onChange={(e) =>
                      setDeltaInputs((prev) => ({
                        ...prev,
                        [c.id]: e.target.value,
                      }))
                    }
                    disabled={isBusy}
                    placeholder="Amt"
                    min="0"
                  />
                  <button
                    className="btn enc__dmg-btn"
                    disabled={isBusy}
                    onClick={() => handleApplyDelta(c, false)}
                  >
                    Dmg
                  </button>
                  <button
                    className="btn enc__heal-btn"
                    disabled={isBusy}
                    onClick={() => handleApplyDelta(c, true)}
                  >
                    Heal
                  </button>
                </div>
              </div>
            )}

            {combatActive && (
              <div className="enc__ctrl-grp">
                <span className="enc__ctrl-label">Set HP</span>
                <div className="enc__ctrl-row">
                  <input
                    type="number"
                    className="input enc__sethp-inp"
                    value={setHpInputs[c.id] ?? ""}
                    onChange={(e) =>
                      setSetHpInputs((prev) => ({
                        ...prev,
                        [c.id]: e.target.value,
                      }))
                    }
                    disabled={isBusy}
                    placeholder="Value"
                  />
                  <button
                    className="btn enc__set-btn"
                    disabled={isBusy}
                    onClick={() => handleSetHp(c)}
                  >
                    Set
                  </button>
                </div>
              </div>
            )}

            {combatActive && (
              <div className="enc__ctrl-grp">
                <span className="enc__ctrl-label">Temp HP</span>
                <div className="enc__ctrl-row">
                  <input
                    type="number"
                    className="input enc__sethp-inp"
                    value={tempHpInputs[c.id] ?? ""}
                    onChange={(e) =>
                      setTempHpInputs((prev) => ({
                        ...prev,
                        [c.id]: e.target.value,
                      }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSetTempHp(c);
                    }}
                    disabled={isBusy}
                    placeholder="Temp"
                    min="0"
                  />
                  <button
                    className="btn enc__temphp-btn"
                    disabled={isBusy}
                    onClick={() => handleSetTempHp(c)}
                  >
                    Set
                  </button>
                </div>
              </div>
            )}

            {/* Death saves — a downed PC (linked, 0 HP) rolls each turn; the DM
                records the result the player calls out. */}
            {combatActive && !isUnlinked && c.currentHp === 0 && (
              <div className="enc__ctrl-grp enc__ctrl-grp--death">
                <span className="enc__ctrl-label">Death Saves</span>
                <DeathSaveTrack
                  successes={c.deathSaveSuccesses ?? 0}
                  failures={c.deathSaveFailures ?? 0}
                  onChange={(s, f) =>
                    handleUpdateCombatant(c, {
                      deathSaveSuccesses: s,
                      deathSaveFailures: f,
                    })
                  }
                />
              </div>
            )}

            {isUnlinked && (isPending || editMode) && (
              <div className="enc__ctrl-grp">
                <span className="enc__ctrl-label">Name</span>
                <div className="enc__ctrl-row">
                  <input
                    className="input enc__edit-name-inp"
                    value={nameInputs[c.id] ?? c.name}
                    onChange={(e) => setNameInputs((p) => ({ ...p, [c.id]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const name = (nameInputs[c.id] ?? c.name).trim();
                        if (name && name !== c.name) handleUpdateCombatant(c, { name });
                      }
                    }}
                    onBlur={() => {
                      const name = (nameInputs[c.id] ?? c.name).trim();
                      if (name && name !== c.name) handleUpdateCombatant(c, { name });
                    }}
                    disabled={isBusy}
                  />
                </div>
              </div>
            )}

            {isUnlinked && (isPending || editMode) && (
              <div className="enc__ctrl-grp">
                <span className="enc__ctrl-label">Max HP</span>
                <div className="enc__ctrl-row">
                  <input
                    type="number"
                    className="input enc__add-num"
                    value={maxHpInputs[c.id] ?? String(c.maxHp)}
                    onChange={(e) => setMaxHpInputs((p) => ({ ...p, [c.id]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const v = parseInt(maxHpInputs[c.id] ?? "", 10);
                        if (!isNaN(v) && v >= 1 && v !== c.maxHp) handleUpdateCombatant(c, { maxHp: v });
                      }
                    }}
                    onBlur={() => {
                      const v = parseInt(maxHpInputs[c.id] ?? "", 10);
                      if (!isNaN(v) && v >= 1 && v !== c.maxHp) handleUpdateCombatant(c, { maxHp: v });
                    }}
                    disabled={isBusy}
                    min="1"
                  />
                </div>
              </div>
            )}

            {isUnlinked && (isPending || editMode) && (
              <div className="enc__ctrl-grp">
                <span className="enc__ctrl-label">AC</span>
                <div className="enc__ctrl-row">
                  <input
                    type="number"
                    className="input enc__add-num"
                    value={acInputs[c.id] ?? String(c.armorClass)}
                    onChange={(e) => setAcInputs((p) => ({ ...p, [c.id]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const v = parseInt(acInputs[c.id] ?? "", 10);
                        if (!isNaN(v) && v >= 0 && v !== c.armorClass) handleUpdateCombatant(c, { armorClass: v });
                      }
                    }}
                    onBlur={() => {
                      const v = parseInt(acInputs[c.id] ?? "", 10);
                      if (!isNaN(v) && v >= 0 && v !== c.armorClass) handleUpdateCombatant(c, { armorClass: v });
                    }}
                    disabled={isBusy}
                    min="0"
                  />
                </div>
              </div>
            )}

            {/* Friend/foe shown to players (unlinked combatants only — linked
                ones are always Player Characters). Combat mode. */}
            {combatActive && isUnlinked && (
              <div className="enc__ctrl-grp enc__ctrl-grp--disp">
                <span className="enc__ctrl-label">Side</span>
                <div className="enc__ctrl-row">
                  <button
                    className={`btn tip enc__disp-btn enc__disp-btn--${
                      c.disposition === CombatantDisposition.FriendlyNpc
                        ? "ally"
                        : "enemy"
                    }`}
                    disabled={isBusy}
                    onClick={() =>
                      handleUpdateCombatant(c, {
                        disposition:
                          c.disposition === CombatantDisposition.FriendlyNpc
                            ? CombatantDisposition.Enemy
                            : CombatantDisposition.FriendlyNpc,
                      })
                    }
                    data-tooltip="Toggle how players label this combatant: friendly NPC vs enemy"
                  >
                    {c.disposition === CombatantDisposition.FriendlyNpc
                      ? "Ally"
                      : "Enemy"}
                  </button>
                </div>
              </div>
            )}

            {/* Per-enemy, per-item player visibility. Each toggle is independent;
                "hidden" removes the enemy from the player view entirely. Combat mode. */}
            {combatActive && isEnemy && (
              <div className="enc__ctrl-grp enc__ctrl-grp--vis">
                <span className="enc__ctrl-label">Hide</span>
                <div className="enc__ctrl-row">
                  <button
                    className={`btn tip enc__vis-btn${c.isHiddenFromPlayers ? " enc__vis-btn--on" : ""}`}
                    disabled={isBusy}
                    aria-pressed={!!c.isHiddenFromPlayers}
                    onClick={() =>
                      handleUpdateCombatant(c, {
                        isHiddenFromPlayers: !c.isHiddenFromPlayers,
                      })
                    }
                    data-tooltip={
                      c.isHiddenFromPlayers
                        ? "Hidden from players — click to reveal"
                        : "Hide this enemy from the player view entirely"
                    }
                  >
                    {c.isHiddenFromPlayers ? "🚫" : "👁"}
                  </button>
                  <button
                    className={`btn tip enc__vis-btn${c.hpHiddenFromPlayers ? " enc__vis-btn--on" : ""}`}
                    disabled={isBusy || !!c.isHiddenFromPlayers}
                    aria-pressed={!!c.hpHiddenFromPlayers}
                    onClick={() =>
                      handleUpdateCombatant(c, {
                        hpHiddenFromPlayers: !c.hpHiddenFromPlayers,
                      })
                    }
                    data-tooltip="Hide this enemy's HP from players"
                  >
                    HP
                  </button>
                  <button
                    className={`btn tip enc__vis-btn${c.acHiddenFromPlayers ? " enc__vis-btn--on" : ""}`}
                    disabled={isBusy || !!c.isHiddenFromPlayers}
                    aria-pressed={!!c.acHiddenFromPlayers}
                    onClick={() =>
                      handleUpdateCombatant(c, {
                        acHiddenFromPlayers: !c.acHiddenFromPlayers,
                      })
                    }
                    data-tooltip="Hide this enemy's AC from players"
                  >
                    AC
                  </button>
                </div>
              </div>
            )}

            {/* Clone — edit mode only. */}
            {editing && isEnemy && (
              <div className="enc__ctrl-grp enc__ctrl-grp--clone">
                <span className="enc__ctrl-label">Clone</span>
                <div className="enc__ctrl-row">
                  <button
                    className="btn tip enc__clone-btn"
                    disabled={isBusy}
                    onClick={() => handleClone(c)}
                    data-tooltip={`Add another ${c.name} (${c.maxHp} HP, AC ${c.armorClass})`}
                  >
                    ⧉
                  </button>
                </div>
              </div>
            )}

            <div className="enc__ctrl-grp enc__ctrl-grp--remove">
              <span className="enc__ctrl-label">Remove</span>
              <div className="enc__ctrl-row">
                <button
                  className="btn enc__remove-btn"
                  disabled={isBusy}
                  onClick={() => handleRemove(c.id)}
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        )}

        {(isEnded || !isDm) && (
          <div className="enc__comb-readonly">
            <span className="text-muted enc__init-val">
              init&nbsp;{c.initiative ?? "—"}
            </span>
          </div>
        )}
      </li>
    );
  }

  if (loading) {
    return (
      <div className="container enc">
        <div className="skeleton enc__skel-head" />
        <div className="skeleton enc__skel-body" />
      </div>
    );
  }

  if (!encounter) {
    return (
      <div className="container enc">
        <p className="enc__error">{error ?? "Encounter not found."}</p>
        <Link to={`/campaigns/${campaignId}`} className="enc__back text-muted">
          ← Back to campaign
        </Link>
      </div>
    );
  }

  if (archived) {
    return (
      <div className="container enc">
        <div className="enc__archived panel">
          <h1 className="enc__title">Encounter ended</h1>
          <p className="text-muted">
            The DM archived this encounter. Combat is over.
          </p>
          <Link to={`/campaigns/${campaignId}`} className="btn btn--primary">
            ← Back to campaign
          </Link>
        </div>
      </div>
    );
  }

  const statusLabel = isPending ? "Pending" : isActive ? "Active" : "Ended";
  const statusMod = isPending
    ? "enc__status--pending"
    : isActive
      ? "enc__status--active"
      : "enc__status--ended";

  const ordered = isActive
    ? [...encounter.combatants].sort((a, b) => a.sortOrder - b.sortOrder)
    : encounter.combatants;
  // Side defaults by link when no explicit choice is recorded: a character-linked
  // combatant is an ally, an unlinked one an enemy. Covers hub-pushed combatants
  // (added in another client) that have no local sideMap entry.
  const sideOf = (c: CombatantResponse) =>
    sideMap[c.id] ?? (c.characterId ? "ally" : "enemy");
  const allies = ordered.filter((c) => sideOf(c) === "ally");
  const enemies = ordered.filter((c) => sideOf(c) === "enemy");

  // Initiative (turn-order) view: a single list, no ally/enemy split. During
  // Active combat sortOrder is the authoritative turn sequence; otherwise sort by
  // initiative DESC with un-rolled (null) combatants pushed to the end.
  const initiativeOrdered = [...encounter.combatants].sort((a, b) => {
    if (isActive) return a.sortOrder - b.sortOrder;
    if (a.initiative === null && b.initiative === null) return 0;
    if (a.initiative === null) return 1;
    if (b.initiative === null) return -1;
    return b.initiative - a.initiative;
  });
  // The toggle is DM-only; players always see the sides view.
  const showInitiativeView = isDm && viewMode === "initiative";

  const linkedCharIds = new Set(
    encounter.combatants.flatMap((c) => (c.characterId ? [c.characterId] : [])),
  );
  const unlinkableCampChars = activeCampChars.filter(
    (cc) => !linkedCharIds.has(cc.characterId),
  );

  const hubLabel =
    hubStatus === HubStatus.Connected
      ? "Live"
      : hubStatus === HubStatus.Reconnecting
        ? "Reconnecting…"
        : hubStatus === HubStatus.Connecting
          ? "Connecting…"
          : "Offline";

  // Players get the dedicated combat view (their character sheet + turn order);
  // the sides / initiative tracker below is the DM's control surface.
  if (!isDm) {
    return (
      <PlayerEncounterView
        encounter={encounter}
        campaignId={campaignId}
        userId={userId}
        campChars={campChars}
        hubStatus={hubStatus}
        hubLabel={hubLabel}
      />
    );
  }

  return (
    <div className="container enc">
      {/* Header */}
      <div className="enc__head">
        <div className="enc__head-left">
          <Link to={`/campaigns/${campaignId}`} className="enc__back text-muted">
            ← Campaign
          </Link>
          <h1 className="enc__title">{encounter.name}</h1>
          <div className="enc__meta">
            <span className={`badge ${statusMod}`}>{statusLabel}</span>
            {encounter.roundNumber > 0 && (
              <span className="enc__round">Round {encounter.roundNumber}</span>
            )}
            <span
              className={`enc__hub tip enc__hub--${hubStatus}`}
              data-tooltip={`Live updates: ${hubLabel}`}
            >
              <span className="enc__hub-dot" aria-hidden="true" />
              {hubLabel}
            </span>
          </div>
        </div>
        {isDm && (
          <div className="enc__head-right">
            {isPending && (
              <>
                <button
                  className="btn tip"
                  disabled={actionBusy || encounter.combatants.length === 0}
                  onClick={handleRandomizeInitiatives}
                  data-tooltip="Roll d20 for every combatant"
                >
                  {actionBusy ? "Rolling…" : "Roll Initiatives"}
                </button>
                <button
                  className="btn btn--primary"
                  disabled={actionBusy || encounter.combatants.length === 0}
                  onClick={handleStart}
                >
                  {actionBusy ? "Starting…" : "Start Combat"}
                </button>
              </>
            )}
            {isActive && (
              <>
                <button
                  className="btn tip"
                  disabled={
                    actionBusy ||
                    (encounter.roundNumber <= 1 &&
                      encounter.activeCombatantId ===
                        [...encounter.combatants].sort(
                          (a, b) => a.sortOrder - b.sortOrder,
                        )[0]?.id)
                  }
                  onClick={handleUndoTurn}
                  data-tooltip="Undo the last Next Turn"
                >
                  ↩ Undo Turn
                </button>
                <button
                  className="btn btn--primary"
                  disabled={actionBusy}
                  onClick={handleNextTurn}
                >
                  {actionBusy ? "…" : "Next Turn"}
                </button>
                <button
                  className={`btn${editMode ? " enc__edit-mode-btn--active" : ""}`}
                  onClick={() => { setEditMode((v) => !v); setEndConfirm(false); }}
                >
                  {editMode ? "Exit Edit" : "Edit"}
                </button>
                {endConfirm ? (
                  <div className="enc__end-confirm">
                    <span className="enc__end-confirm-label">End combat?</span>
                    <button
                      className="btn enc__end-confirm-yes"
                      disabled={actionBusy}
                      onClick={() => { setEndConfirm(false); handleEnd(); }}
                    >
                      End
                    </button>
                    <button
                      className="btn"
                      onClick={() => setEndConfirm(false)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    className="btn"
                    disabled={actionBusy}
                    onClick={() => setEndConfirm(true)}
                  >
                    End Combat
                  </button>
                )}
              </>
            )}
            {isEnded && (
              <button
                className="btn enc__delete-btn"
                disabled={actionBusy}
                onClick={handleDelete}
              >
                Archive
              </button>
            )}
          </div>
        )}
      </div>

      {error && <p className="enc__error">{error}</p>}

      {/* Combatants — sides split (default) or DM-only initiative turn order */}
      <section className="enc__section panel">
        <div className="enc__section-head">
          <h2 className="enc__section-title enc__section-title--inline">
            {showInitiativeView ? "Turn Order" : "Combatants"}
          </h2>
          {isDm && (
            <div
              className="enc__view-toggle"
              role="group"
              aria-label="Combatants view"
            >
              <button
                className={`enc__view-btn tip${!showInitiativeView ? " enc__view-btn--active" : ""}`}
                onClick={() => changeView("sides")}
                aria-pressed={!showInitiativeView}
                data-tooltip="Group by allies and enemies"
              >
                Sides
              </button>
              <button
                className={`enc__view-btn tip${showInitiativeView ? " enc__view-btn--active" : ""}`}
                onClick={() => changeView("initiative")}
                aria-pressed={showInitiativeView}
                data-tooltip="Single list sorted by initiative (turn order)"
              >
                Initiative
              </button>
            </div>
          )}
        </div>

        {isActive && encounter.activeCombatantId && (() => {
          const acting = encounter.combatants.find((c) => c.id === encounter.activeCombatantId);
          const side = acting ? sideOf(acting) : null;
          return acting ? (
            <div className={`enc__now-acting enc__now-acting--${side}`}>
              <span className="enc__now-acting-sword" aria-hidden="true">⚔</span>
              <span className="enc__now-acting-label">Now acting</span>
              <span className="enc__now-acting-name">{acting.name}</span>
              <span className="enc__now-acting-meta">
                {acting.initiative !== null ? `Initiative ${acting.initiative}` : "No initiative"}
                {" · "}
                {acting.currentHp}&thinsp;/&thinsp;{acting.maxHp}&thinsp;HP
              </span>
            </div>
          ) : null;
        })()}

        {showInitiativeView ? (
          /* Initiative (turn-order) view — single sorted list, no add forms */
          <div className="enc__subsection">
            {initiativeOrdered.length > 0 ? (
              <ul className="enc__list enc__list--aligned">
                {initiativeOrdered.map((c, i) => renderCombatant(c, i + 1))}
              </ul>
            ) : (
              <p className="text-muted enc__subsection-empty">
                No combatants yet. Switch to “Sides” to add allies and enemies.
              </p>
            )}
          </div>
        ) : (
          <>
        {/* Players & Allies */}
        <div className="enc__subsection enc__subsection--ally">
          <h3 className="enc__subsection-head">Players &amp; Allies</h3>
          {allies.length > 0 ? (
            <ul className="enc__list">{allies.map((c) => renderCombatant(c))}</ul>
          ) : (
            <p className="text-muted enc__subsection-empty">No allies yet.</p>
          )}
          {isDm && (isPending || editMode) && (
            <form className="enc__add-form" onSubmit={handleAddAlly}>
              <div className="enc__add-field enc__add-field--name">
                <label className="enc__add-label">Name</label>
                <input
                  className="input"
                  value={allyName}
                  onChange={(e) => setAllyName(e.target.value)}
                  required
                />
              </div>
              <div className="enc__add-field">
                <label className="enc__add-label">Max HP</label>
                <input
                  type="number"
                  className="input enc__add-num"
                  value={allyMaxHp}
                  onChange={(e) => setAllyMaxHp(e.target.value)}
                  required
                  min="1"
                />
              </div>
              <div className="enc__add-field">
                <label className="enc__add-label">AC</label>
                <input
                  type="number"
                  className="input enc__add-num"
                  value={allyAc}
                  onChange={(e) => setAllyAc(e.target.value)}
                  required
                  min="0"
                />
              </div>
              {unlinkableCampChars.length > 0 && (
                <div className="enc__add-field enc__add-field--char">
                  <label className="enc__add-label">Link character</label>
                  <select
                    className="input"
                    value={allyCharId}
                    onChange={(e) => handleAllyCharSelect(e.target.value)}
                  >
                    <option value="">— optional —</option>
                    {unlinkableCampChars.map((cc) => (
                      <option key={cc.characterId} value={cc.characterId}>
                        {cc.characterName} ({cc.ownerUsername})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <button
                className="btn btn--primary enc__add-submit"
                type="submit"
                disabled={
                  allyAdding || !allyName.trim() || !allyMaxHp || !allyAc
                }
              >
                {allyAdding ? "Adding…" : "+ Add Ally"}
              </button>
            </form>
          )}
        </div>

        {/* Enemies & Monsters */}
        <div className="enc__subsection enc__subsection--enemy">
          <h3 className="enc__subsection-head">Enemies &amp; Monsters</h3>
          {enemies.length > 0 ? (
            <ul className="enc__list">{enemies.map((c) => renderCombatant(c))}</ul>
          ) : (
            <p className="text-muted enc__subsection-empty">No enemies yet.</p>
          )}
          {isDm && (isPending || editMode) && (
            <form className="enc__add-form" onSubmit={handleAddEnemy}>
              <div className="enc__add-field enc__add-field--name">
                <label className="enc__add-label">Name</label>
                <input
                  className="input"
                  value={enemyName}
                  onChange={(e) => setEnemyName(e.target.value)}
                  required
                />
              </div>
              <div className="enc__add-field">
                <label className="enc__add-label">Max HP</label>
                <input
                  type="number"
                  className="input enc__add-num"
                  value={enemyMaxHp}
                  onChange={(e) => setEnemyMaxHp(e.target.value)}
                  required
                  min="1"
                />
              </div>
              <div className="enc__add-field">
                <label className="enc__add-label">AC</label>
                <input
                  type="number"
                  className="input enc__add-num"
                  value={enemyAc}
                  onChange={(e) => setEnemyAc(e.target.value)}
                  required
                  min="0"
                />
              </div>
              <button
                className="btn enc__add-submit enc__add-submit--enemy"
                type="submit"
                disabled={
                  enemyAdding || !enemyName.trim() || !enemyMaxHp || !enemyAc
                }
              >
                {enemyAdding ? "Adding…" : "+ Add Enemy"}
              </button>
            </form>
          )}
        </div>
          </>
        )}
      </section>

      {initiativeWarning && (
        <Modal
          onClose={() => setInitiativeWarning(null)}
          ariaLabel="Set initiatives before starting"
          backdropClassName="enc__modal-backdrop"
          className="enc__modal panel"
        >
            <p className="enc__modal-heading">Set initiatives before starting</p>
            <p className="enc__modal-body">
              These combatants still need an initiative value:
            </p>
            <ul className="enc__modal-list">
              {initiativeWarning.map((name) => (
                <li key={name} className="enc__modal-list-item">{name}</li>
              ))}
            </ul>
            <div className="enc__modal-footer">
              <button
                className="btn"
                disabled={actionBusy}
                onClick={handleRandomizeInitiatives}
              >
                Roll all (d20)
              </button>
              <button
                className="btn btn--primary"
                onClick={() => setInitiativeWarning(null)}
              >
                Got it
              </button>
            </div>
        </Modal>
      )}
    </div>
  );
}
