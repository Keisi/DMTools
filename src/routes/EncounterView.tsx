import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { campaigns, characters as charApi } from "../api/endpoints";
import type {
  EncounterResponse,
  CampaignCharacterResponse,
  CombatantResponse,
} from "../api/types";
import { EncounterStatus } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../api/client";
import "./EncounterView.css";

type Side = "ally" | "enemy";
const SIDES_KEY = (eid: string) => `dmtool-enc-sides-${eid}`;

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

  const isDm = dmUserId === userId;
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
    setError(null);
  }

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
    ])
      .then(([enc, camp, chars]) => {
        if (!active) return;
        setError(null);
        setEncounter(enc);
        syncInitInputs(enc);
        setDmUserId(camp.dmUserId);
        setCampChars(chars);

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
      .catch(() => {});
  }

  // Shared combatant row renderer
  function renderCombatant(c: CombatantResponse) {
    const isTurn = c.id === encounter!.activeCombatantId;
    const isBusy = busyCombatant === c.id;
    const hpPct =
      c.maxHp > 0
        ? Math.max(0, Math.round((c.currentHp / c.maxHp) * 100))
        : 0;
    return (
      <li
        key={c.id}
        className={`enc__combatant${isTurn ? " enc__combatant--active" : ""}${!c.isActive ? " enc__combatant--inactive" : ""}`}
      >
        <div className="enc__comb-left">
          <span className="enc__turn-dot" aria-hidden="true">
            {isTurn ? "▶" : "·"}
          </span>
          <div className="enc__comb-info">
            <span className="enc__comb-name">{c.name}</span>
            <span className="text-muted enc__comb-ac">AC&nbsp;{c.armorClass}</span>
          </div>
          <div className="enc__hp-wrap">
            <div className="enc__hp-bar">
              <div className="enc__hp-fill" style={{ width: `${hpPct}%` }} />
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

            <div className="enc__ctrl-grp">
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

  const statusLabel = isPending ? "Pending" : isActive ? "Active" : "Ended";
  const statusMod = isPending
    ? "enc__status--pending"
    : isActive
      ? "enc__status--active"
      : "enc__status--ended";

  const ordered = isActive
    ? [...encounter.combatants].sort((a, b) => a.sortOrder - b.sortOrder)
    : encounter.combatants;
  const allies = ordered.filter((c) => (sideMap[c.id] ?? "enemy") === "ally");
  const enemies = ordered.filter((c) => (sideMap[c.id] ?? "enemy") === "enemy");

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
          </div>
        </div>
        {isDm && (
          <div className="enc__head-right">
            {isPending && (
              <button
                className="btn btn--primary"
                disabled={actionBusy || encounter.combatants.length === 0}
                onClick={handleStart}
              >
                {actionBusy ? "Starting…" : "Start Combat"}
              </button>
            )}
            {isActive && (
              <>
                <button
                  className="btn btn--primary"
                  disabled={actionBusy}
                  onClick={handleNextTurn}
                >
                  {actionBusy ? "…" : "Next Turn"}
                </button>
                <button
                  className="btn"
                  disabled={actionBusy}
                  onClick={handleEnd}
                >
                  End Combat
                </button>
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

      {/* Combatants — split into ally and enemy sub-sections */}
      <section className="enc__section panel">
        <h2 className="enc__section-title">Combatants</h2>

        {/* Players & Allies */}
        <div className="enc__subsection enc__subsection--ally">
          <h3 className="enc__subsection-head">Players &amp; Allies</h3>
          {allies.length > 0 ? (
            <ul className="enc__list">{allies.map(renderCombatant)}</ul>
          ) : (
            <p className="text-muted enc__subsection-empty">No allies yet.</p>
          )}
          {isDm && !isEnded && (
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
              {campChars.length > 0 && (
                <div className="enc__add-field enc__add-field--char">
                  <label className="enc__add-label">Link character</label>
                  <select
                    className="input"
                    value={allyCharId}
                    onChange={(e) => handleAllyCharSelect(e.target.value)}
                  >
                    <option value="">— optional —</option>
                    {campChars.map((cc) => (
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
            <ul className="enc__list">{enemies.map(renderCombatant)}</ul>
          ) : (
            <p className="text-muted enc__subsection-empty">No enemies yet.</p>
          )}
          {isDm && !isEnded && (
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
      </section>
    </div>
  );
}
