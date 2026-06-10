import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { campaigns } from "../api/endpoints";
import type {
  EncounterResponse,
  CampaignCharacterResponse,
  CombatantResponse,
} from "../api/types";
import { EncounterStatus } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../api/client";
import "./EncounterView.css";

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

  // Per-combatant initiative inputs (controlled)
  const [initInputs, setInitInputs] = useState<Record<string, string>>({});
  // Per-combatant HP delta (absolute value; Dmg negates, Heal keeps positive)
  const [deltaInputs, setDeltaInputs] = useState<Record<string, string>>({});
  // Per-combatant direct "set HP" inputs
  const [setHpInputs, setSetHpInputs] = useState<Record<string, string>>({});

  // Add combatant form
  const [addName, setAddName] = useState("");
  const [addMaxHp, setAddMaxHp] = useState("");
  const [addAc, setAddAc] = useState("");
  const [addCharId, setAddCharId] = useState("");
  const [adding, setAdding] = useState(false);

  const [actionBusy, setActionBusy] = useState(false);
  const [busyCombatant, setBusyCombatant] = useState<string | null>(null);

  const isDm = dmUserId === userId;
  const status = encounter?.status ?? EncounterStatus.Pending;
  const isPending = status === EncounterStatus.Pending;
  const isActive = status === EncounterStatus.Active;
  const isEnded = status === EncounterStatus.Ended;

  // Sync initiative inputs after any encounter update, preserving in-progress edits
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

  // After any mutation, replace full encounter state
  function applyUpdate(enc: EncounterResponse) {
    setEncounter(enc);
    syncInitInputs(enc);
    setError(null);
  }

  async function handleStart() {
    setActionBusy(true);
    try {
      const enc = await campaigns.startEncounter(campaignId, encounterId);
      // After start the server re-sorts combatants; reset initiative inputs to confirmed values
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
      applyUpdate(
        await campaigns.removeCombatant(campaignId, encounterId, id),
      );
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to remove combatant.",
      );
    }
    setBusyCombatant(null);
  }

  async function handleAddCombatant(e: React.FormEvent) {
    e.preventDefault();
    const maxHp = parseInt(addMaxHp, 10);
    const ac = parseInt(addAc, 10);
    if (!addName.trim() || isNaN(maxHp) || isNaN(ac)) return;
    setAdding(true);
    try {
      applyUpdate(
        await campaigns.addCombatant(campaignId, encounterId, {
          name: addName.trim(),
          maxHp,
          armorClass: ac,
          characterId: addCharId || null,
        }),
      );
      setAddName("");
      setAddMaxHp("");
      setAddAc("");
      setAddCharId("");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to add combatant.",
      );
    }
    setAdding(false);
  }

  function handleCharSelect(charId: string) {
    setAddCharId(charId);
    if (charId && !addName) {
      const ch = campChars.find((c) => c.characterId === charId);
      if (ch) setAddName(ch.characterName);
    }
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

  const sortedCombatants = isActive
    ? [...encounter.combatants].sort((a, b) => a.sortOrder - b.sortOrder)
    : encounter.combatants;

  return (
    <div className="container enc">
      {/* Header */}
      <div className="enc__head">
        <div className="enc__head-left">
          <Link
            to={`/campaigns/${campaignId}`}
            className="enc__back text-muted"
          >
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

      {/* Combatant list */}
      <section className="enc__section panel">
        <h2 className="enc__section-title">Combatants</h2>

        {sortedCombatants.length === 0 ? (
          <p className="text-muted">
            No combatants yet. Add participants below.
          </p>
        ) : (
          <ul className="enc__list">
            {sortedCombatants.map((c) => {
              const isTurn = c.id === encounter.activeCombatantId;
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
                      <span className="text-muted enc__comb-ac">
                        AC&nbsp;{c.armorClass}
                      </span>
                    </div>
                    <div className="enc__hp-wrap">
                      <div className="enc__hp-bar">
                        <div
                          className="enc__hp-fill"
                          style={{ width: `${hpPct}%` }}
                        />
                      </div>
                      <span className="enc__hp-text">
                        {c.currentHp}&thinsp;/&thinsp;{c.maxHp}
                        {c.tempHp > 0 && (
                          <span className="enc__hp-temp">
                            {" "}
                            +{c.tempHp}&thinsp;tmp
                          </span>
                        )}
                      </span>
                    </div>
                  </div>

                  {isDm && !isEnded && (
                    <div className="enc__comb-controls">
                      <div className="enc__ctrl-grp">
                        <span className="enc__ctrl-label">Init</span>
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
                            if (e.key === "Enter")
                              handleSetInitiative(c);
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

                      <div className="enc__ctrl-grp">
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
                          placeholder="N"
                          min="0"
                        />
                        <button
                          className="btn enc__dmg-btn"
                          disabled={isBusy}
                          onClick={() => handleApplyDelta(c, false)}
                          title="Apply damage"
                        >
                          Dmg
                        </button>
                        <button
                          className="btn enc__heal-btn"
                          disabled={isBusy}
                          onClick={() => handleApplyDelta(c, true)}
                          title="Apply healing"
                        >
                          Heal
                        </button>
                      </div>

                      <div className="enc__ctrl-grp">
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
                          placeholder="Set HP"
                        />
                        <button
                          className="btn enc__set-btn"
                          disabled={isBusy}
                          onClick={() => handleSetHp(c)}
                          title="Set HP directly"
                        >
                          =
                        </button>
                      </div>

                      <button
                        className="btn enc__remove-btn"
                        disabled={isBusy}
                        onClick={() => handleRemove(c.id)}
                        title="Remove from encounter"
                      >
                        ✕
                      </button>
                    </div>
                  )}

                  {/* Read-only view for ended encounters or non-DM */}
                  {(isEnded || !isDm) && (
                    <div className="enc__comb-readonly">
                      <span className="text-muted enc__init-val">
                        init&nbsp;{c.initiative ?? "—"}
                      </span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Add combatant form (DM only, not Ended) */}
      {isDm && !isEnded && (
        <section className="enc__section panel">
          <h2 className="enc__section-title">Add Combatant</h2>
          <form className="enc__add-form" onSubmit={handleAddCombatant}>
            <input
              className="input enc__add-name"
              placeholder="Name"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              required
            />
            <input
              type="number"
              className="input enc__add-num"
              placeholder="Max HP"
              value={addMaxHp}
              onChange={(e) => setAddMaxHp(e.target.value)}
              required
              min="1"
            />
            <input
              type="number"
              className="input enc__add-num"
              placeholder="AC"
              value={addAc}
              onChange={(e) => setAddAc(e.target.value)}
              required
              min="0"
            />
            {campChars.length > 0 && (
              <select
                className="input enc__add-char"
                value={addCharId}
                onChange={(e) => handleCharSelect(e.target.value)}
              >
                <option value="">— link to campaign character (optional) —</option>
                {campChars.map((cc) => (
                  <option key={cc.characterId} value={cc.characterId}>
                    {cc.characterName} ({cc.ownerUsername})
                  </option>
                ))}
              </select>
            )}
            <button
              className="btn btn--primary"
              type="submit"
              disabled={adding || !addName.trim() || !addMaxHp || !addAc}
            >
              {adding ? "Adding…" : "+ Add"}
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
