/* CampaignCharacterPanel — per-campaign character runtime state (INCOMING #31).
   Shows one character's campaign-scoped HP, inspiration, exhaustion, spell slots,
   class resources, and status effects. Plain REST — no SignalR. Every mutation
   returns the full CampaignCharacterSheetResponse; all state flows through the
   single applySheet path (mirrors EncounterView.applyUpdate discipline). */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Modal from "./Modal";
import { campaignCharacterState, reference } from "../api/endpoints";
import { ApiError } from "../api/client";
import type {
  CampaignCharacterSheetResponse,
  CampaignSpellSlotState,
  CampaignResourceState,
  CampaignStatusEffectState,
  CampaignHitDiceState,
  StatusEffectResponse,
} from "../api/types";
import { ResourceRecharge } from "../api/types";
import "./CampaignCharacterPanel.css";

// ---- Pip track (spell slots — interactive; resources — display-only) ----
function PipTrack({
  remaining,
  max,
  disabled,
  interactive,
  onMinus,
  onPlus,
}: {
  remaining: number;
  max: number;
  disabled: boolean;
  interactive: boolean;
  onMinus: () => void;
  onPlus: () => void;
}) {
  const usePips = max <= 8;
  return (
    <span className="ccp__pip-group">
      {interactive && (
        <button
          type="button"
          className="ccp__adj"
          disabled={disabled || remaining <= 0}
          onClick={onMinus}
          aria-label="Spend one"
        >
          −
        </button>
      )}
      {usePips ? (
        <span className="ccp__pips" aria-label={`${remaining} of ${max}`}>
          {Array.from({ length: max }, (_, i) => (
            <span
              key={i}
              className={`ccp__pip${i < remaining ? " ccp__pip--on" : ""}`}
              aria-hidden="true"
            />
          ))}
        </span>
      ) : (
        <span className="ccp__count">{remaining}/{max}</span>
      )}
      {interactive && (
        <button
          type="button"
          className="ccp__adj"
          disabled={disabled || remaining >= max}
          onClick={onPlus}
          aria-label="Restore one"
        >
          +
        </button>
      )}
    </span>
  );
}

// ---- Recharge hint label ----
function rechargeHint(recharge: number): string {
  if (recharge === ResourceRecharge.ShortRest) return "recharges on short rest";
  if (recharge === ResourceRecharge.LongRest) return "recharges on long rest";
  return "";
}

// ---- Props ----
interface CampaignCharacterPanelProps {
  campaignId: string;
  characterId: string;
  characterName: string; // for the header before the fetch resolves
  isDm: boolean;         // gate inspiration/grant
  canManage: boolean;    // isDm || ownerId === userId — caller passes this
  onClose: () => void;
}

export default function CampaignCharacterPanel({
  campaignId,
  characterId,
  characterName,
  isDm,
  canManage,
  onClose,
}: CampaignCharacterPanelProps) {
  const [sheet, setSheet] = useState<CampaignCharacterSheetResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mutError, setMutError] = useState<string | null>(null);

  // Status-effect catalog (loaded once for the add-effect palette)
  const [catalog, setCatalog] = useState<StatusEffectResponse[]>([]);
  const [showPalette, setShowPalette] = useState(false);
  const [paletteRounds, setPaletteRounds] = useState("");

  // HP stepper local input
  const [hpAmt, setHpAmt] = useState("1");
  const [setHpVal, setSetHpVal] = useState("");
  const [setTempVal, setSetTempVal] = useState("");

  // ---- Single state-write path ----
  function applySheet(s: CampaignCharacterSheetResponse) {
    setSheet(s);
  }

  // ---- Load sheet on mount ----
  useEffect(() => {
    let active = true;
    campaignCharacterState
      .get(campaignId, characterId)
      .then((s) => { if (active) applySheet(s); })
      .catch((err: unknown) => {
        if (!active) return;
        setLoadError(
          err instanceof ApiError ? err.message : "Failed to load character state.",
        );
      });
    return () => { active = false; };
  }, [campaignId, characterId]);

  // Load status-effect catalog once (needed even before palette opens, so it's ready)
  useEffect(() => {
    reference.statusEffects().then(setCatalog).catch(() => { /* non-fatal */ });
  }, []);

  // ---- Mutation helper ----
  async function mutate(fn: () => Promise<CampaignCharacterSheetResponse>) {
    setBusy(true);
    setMutError(null);
    try {
      const s = await fn();
      applySheet(s);
    } catch (err) {
      setMutError(err instanceof ApiError ? err.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  // ---- HP actions ----
  function handleHeal() {
    if (!sheet) return;
    const amt = parseInt(hpAmt, 10);
    if (isNaN(amt) || amt <= 0) return;
    const newCurrent = Math.min(sheet.maxHp, sheet.currentHp + amt);
    void mutate(() =>
      campaignCharacterState.updateHp(campaignId, characterId, {
        currentHp: newCurrent,
        tempHp: sheet.tempHp,
      }),
    );
  }

  function handleDamage() {
    if (!sheet) return;
    const amt = parseInt(hpAmt, 10);
    if (isNaN(amt) || amt <= 0) return;
    let newCurrent = sheet.currentHp;
    let newTemp = sheet.tempHp;
    if (amt <= newTemp) {
      newTemp -= amt;
    } else {
      const rem = amt - newTemp;
      newTemp = 0;
      newCurrent = Math.max(0, newCurrent - rem);
    }
    void mutate(() =>
      campaignCharacterState.updateHp(campaignId, characterId, {
        currentHp: newCurrent,
        tempHp: newTemp,
      }),
    );
  }

  function handleSetHp() {
    if (!sheet) return;
    const val = parseInt(setHpVal, 10);
    if (isNaN(val)) return;
    void mutate(() =>
      campaignCharacterState.updateHp(campaignId, characterId, {
        currentHp: val,
        tempHp: sheet.tempHp,
      }),
    );
    setSetHpVal("");
  }

  function handleSetTemp() {
    if (!sheet) return;
    const val = parseInt(setTempVal, 10);
    if (isNaN(val) || val < 0) return;
    void mutate(() =>
      campaignCharacterState.updateHp(campaignId, characterId, {
        currentHp: sheet.currentHp,
        tempHp: val,
      }),
    );
    setSetTempVal("");
  }

  // ---- Spell slot actions ----
  function handleSlotChange(s: CampaignSpellSlotState, delta: number) {
    void mutate(() =>
      campaignCharacterState.updateSpellSlot(campaignId, characterId, {
        slotLevel: s.level,
        isPact: s.isPact,
        remaining: s.remaining + delta,
      }),
    );
  }

  // ---- Class resource actions (INCOMING #32) ----
  function handleResourceChange(r: CampaignResourceState, delta: number) {
    void mutate(() =>
      campaignCharacterState.updateResource(campaignId, characterId, r.key, {
        remaining: r.remaining + delta,
      }),
    );
  }

  // ---- Exhaustion actions (INCOMING #32) ----
  function handleExhaustionChange(delta: number) {
    if (!sheet) return;
    const level = Math.max(0, Math.min(6, sheet.exhaustionLevel + delta));
    if (level === sheet.exhaustionLevel) return; // no-op at the clamp edges
    void mutate(() =>
      campaignCharacterState.updateExhaustion(campaignId, characterId, { level }),
    );
  }

  // ---- Hit-dice actions (INCOMING #33) ----
  // Spend decrements the pool AND heals (server rolls the average + CON); the returned
  // sheet reflects both. Restore is a DM override of `remaining` with no HP change.
  function handleSpendHitDie(h: CampaignHitDiceState) {
    void mutate(() =>
      campaignCharacterState.spendHitDice(campaignId, characterId, {
        dieType: h.dieType,
        count: 1,
      }),
    );
  }

  function handleRestoreHitDie(h: CampaignHitDiceState) {
    void mutate(() =>
      campaignCharacterState.updateHitDice(campaignId, characterId, h.dieType, {
        remaining: h.remaining + 1,
      }),
    );
  }

  // ---- Inspiration actions ----
  function handleGrantInspiration() {
    void mutate(() => campaignCharacterState.grantInspiration(campaignId, characterId));
  }

  function handleSpendInspiration() {
    void mutate(() => campaignCharacterState.spendInspiration(campaignId, characterId));
  }

  // ---- Status-effect actions ----
  function handleRemoveStatusEffect(e: CampaignStatusEffectState) {
    void mutate(() =>
      campaignCharacterState.removeStatusEffect(campaignId, characterId, e.statusEffectId),
    );
  }

  function handleAddStatusEffect(catalogEntry: StatusEffectResponse) {
    const rounds = parseInt(paletteRounds, 10);
    void mutate(() =>
      campaignCharacterState.addStatusEffect(campaignId, characterId, {
        statusEffectId: catalogEntry.id,
        remainingRounds: !isNaN(rounds) && rounds > 0 ? rounds : null,
      }),
    );
    setShowPalette(false);
    setPaletteRounds("");
  }

  // ---- Rest actions ----
  function handleShortRest() {
    void mutate(() => campaignCharacterState.shortRest(campaignId, characterId));
  }

  function handleLongRest() {
    if (
      !confirm(
        "Take a Long Rest? This restores all spell slots, class resources, and HP to maximum, clears temp HP, and reduces exhaustion by 1.",
      )
    )
      return;
    void mutate(() => campaignCharacterState.longRest(campaignId, characterId));
  }

  // ---- Status effect palette helpers ----
  const appliedIds = new Set(sheet?.statusEffects.map((e) => e.statusEffectId) ?? []);
  const sortedCatalog = [...catalog].sort((a, b) => a.name.localeCompare(b.name));
  const beneficialCatalog = sortedCatalog.filter((s) => s.isBeneficial);
  const harmfulCatalog = sortedCatalog.filter((s) => !s.isBeneficial);

  // ---- Render ----
  const displayName = sheet?.character.name ?? characterName;

  return (
    <Modal
      onClose={onClose}
      ariaLabel={`${displayName} — campaign state`}
      className="ccp panel"
      backdropClassName="ccp-backdrop"
    >
      {/* ---- Header ---- */}
      <div className="ccp__head">
        <div className="ccp__head-left">
          <h2 className="ccp__title">
            <Link to={`/character/${characterId}`} onClick={onClose}>
              {displayName}
            </Link>
          </h2>
          {sheet && (
            <div className="ccp__derived-strip">
              <span className="ccp__derived-item">
                <span className="ccp__derived-label">AC</span>
                <span className="ccp__derived-val">{sheet.character.armorClass}</span>
              </span>
              <span className="ccp__derived-item">
                <span className="ccp__derived-label">Init</span>
                <span className="ccp__derived-val">
                  {sheet.character.initiative >= 0 ? "+" : ""}{sheet.character.initiative}
                </span>
              </span>
              <span className="ccp__derived-item">
                <span className="ccp__derived-label">Speed</span>
                <span className="ccp__derived-val">{sheet.character.walkingSpeed} ft</span>
              </span>
            </div>
          )}
        </div>
        <button
          type="button"
          className="ccp__close"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
      </div>

      {/* ---- Loading / load error ---- */}
      {!sheet && !loadError && (
        <p className="ccp__loading">Loading…</p>
      )}
      {loadError && (
        <p className="ccp__error">{loadError}</p>
      )}

      {/* ---- Mutation error ---- */}
      {mutError && <p className="ccp__error">{mutError}</p>}

      {sheet && (
        <>
          {/* ---- HP section ---- */}
          <div className="ccp__section">
            <p className="ccp__section-title">Hit Points</p>
            <div className="ccp__hp-display">
              <span className="ccp__hp-current">{sheet.currentHp}</span>
              <span className="ccp__hp-max">/ {sheet.maxHp}</span>
              {sheet.tempHp > 0 && (
                <span className="ccp__hp-temp">+{sheet.tempHp} temp</span>
              )}
            </div>

            {canManage && (
              <div className="ccp__hp-controls">
                {/* Heal / Damage stepper */}
                <div className="ccp__hp-row">
                  <input
                    type="number"
                    className="input ccp__hp-input"
                    min={1}
                    value={hpAmt}
                    onChange={(e) => setHpAmt(e.target.value)}
                    disabled={busy}
                    aria-label="HP amount"
                  />
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={busy}
                    onClick={handleHeal}
                  >
                    Heal
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={handleDamage}
                  >
                    Damage
                  </button>
                </div>

                {/* Direct set HP */}
                <div className="ccp__hp-row">
                  <span className="ccp__hp-label">Set HP</span>
                  <input
                    type="number"
                    className="input ccp__hp-input"
                    min={0}
                    max={sheet.maxHp}
                    value={setHpVal}
                    onChange={(e) => setSetHpVal(e.target.value)}
                    disabled={busy}
                    aria-label="Set current HP"
                    placeholder={String(sheet.currentHp)}
                  />
                  <button
                    type="button"
                    className="btn"
                    disabled={busy || setHpVal === ""}
                    onClick={handleSetHp}
                  >
                    Set
                  </button>
                </div>

                {/* Set temp HP */}
                <div className="ccp__hp-row">
                  <span className="ccp__hp-label">Set Temp HP</span>
                  <input
                    type="number"
                    className="input ccp__hp-input"
                    min={0}
                    value={setTempVal}
                    onChange={(e) => setSetTempVal(e.target.value)}
                    disabled={busy}
                    aria-label="Set temp HP"
                    placeholder={String(sheet.tempHp)}
                  />
                  <button
                    type="button"
                    className="btn"
                    disabled={busy || setTempVal === ""}
                    onClick={handleSetTemp}
                  >
                    Set
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ---- Inspiration ---- */}
          <div className="ccp__section">
            <p className="ccp__section-title">Inspiration</p>
            <div className="ccp__inspiration-row">
              {Array.from({ length: Math.max(1, sheet.inspiration) }, (_, i) => (
                <span key={i} className={`ccp__insp-star${i < sheet.inspiration ? "" : " ccp__insp-star--empty"}`}>
                  ★
                </span>
              ))}
              <span className="ccp__insp-count">{sheet.inspiration}</span>
              {isDm && (
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={busy || sheet.inspiration >= 1}
                  title="Grant inspiration (DM only)"
                  onClick={handleGrantInspiration}
                >
                  Grant
                </button>
              )}
              {canManage && (
                <button
                  type="button"
                  className="btn"
                  disabled={busy || sheet.inspiration <= 0}
                  title="Spend inspiration"
                  onClick={handleSpendInspiration}
                >
                  Spend
                </button>
              )}
            </div>
          </div>

          {/* ---- Exhaustion (INCOMING #32: canManage-gated stepper) ---- */}
          <div className="ccp__section">
            <p className="ccp__section-title">Exhaustion</p>
            <div className="ccp__exhaustion-row">
              {canManage && (
                <button
                  type="button"
                  className="ccp__adj"
                  disabled={busy || sheet.exhaustionLevel <= 0}
                  onClick={() => handleExhaustionChange(-1)}
                  aria-label="Reduce exhaustion"
                >
                  −
                </button>
              )}
              <span className="ccp__exhaustion-val">{sheet.exhaustionLevel} / 6</span>
              {canManage && (
                <button
                  type="button"
                  className="ccp__adj"
                  disabled={busy || sheet.exhaustionLevel >= 6}
                  onClick={() => handleExhaustionChange(1)}
                  aria-label="Increase exhaustion"
                >
                  +
                </button>
              )}
              {sheet.exhaustionLevel === 0 && <span className="ccp__exhaustion-hint">None</span>}
              {sheet.exhaustionLevel === 6 && (
                <span className="ccp__exhaustion-dead" title="Exhaustion level 6 is death (5e).">
                  Dead (exhaustion)
                </span>
              )}
              {sheet.exhaustionLevel > 0 && sheet.exhaustionLevel < 6 && (
                <span className="ccp__exhaustion-hint">
                  Penalties applied — the sheet's rolls, speed, and max HP below reflect exhaustion.
                </span>
              )}
              <span className="ccp__exhaustion-hint" title="Also reduced by 1 on a Long Rest.">
                (reduced by Long Rest)
              </span>
            </div>
          </div>

          {/* ---- Spell slots ---- */}
          {sheet.spellSlots.length > 0 && (
            <div className="ccp__section">
              <p className="ccp__section-title">Spell Slots</p>
              {sheet.spellSlots.map((s) => (
                <div
                  key={`${s.isPact ? "pact" : "slot"}-${s.level}`}
                  className={`ccp__pool-row${s.isPact ? " ccp__pool-row--pact" : ""}`}
                  title={`${s.remaining}/${s.max} ${s.isPact ? "pact" : "level " + s.level} spell slots`}
                >
                  <span className={`ccp__pool-label${s.isPact ? " ccp__pool-label--pact" : ""}`}>
                    {s.isPact ? `Pact L${s.level}` : `L${s.level}`}
                  </span>
                  <PipTrack
                    remaining={s.remaining}
                    max={s.max}
                    disabled={busy}
                    interactive={canManage}
                    onMinus={() => handleSlotChange(s, -1)}
                    onPlus={() => handleSlotChange(s, 1)}
                  />
                </div>
              ))}
            </div>
          )}

          {/* ---- Class resources (interactive for DM/owner — INCOMING #32) ---- */}
          {sheet.resources.length > 0 && (
            <div className="ccp__section">
              <p className="ccp__section-title">Class Resources</p>
              {sheet.resources.map((r: CampaignResourceState) => {
                const hint = rechargeHint(r.recharge);
                return (
                  <div
                    key={r.key}
                    className="ccp__pool-row"
                    title={[`${r.remaining}/${r.max}`, r.name, hint].filter(Boolean).join(" · ")}
                  >
                    <span className="ccp__pool-label">{r.name}</span>
                    <PipTrack
                      remaining={r.remaining}
                      max={r.max}
                      disabled={busy}
                      interactive={canManage}
                      onMinus={() => handleResourceChange(r, -1)}
                      onPlus={() => handleResourceChange(r, 1)}
                    />
                    {hint && <span className="ccp__pool-hint">{hint}</span>}
                  </div>
                );
              })}
            </div>
          )}

          {/* ---- Hit dice (INCOMING #33) ---- */}
          {sheet.hitDice.length > 0 && (
            <div className="ccp__section">
              <p className="ccp__section-title">Hit Dice</p>
              {sheet.hitDice.map((h: CampaignHitDiceState) => (
                <div
                  key={h.dieType}
                  className="ccp__pool-row"
                  title={`${h.remaining}/${h.max} d${h.dieType} hit dice · Spend 1 to heal (the server rolls the die average + CON); recovered on a long rest`}
                >
                  <span className="ccp__pool-label">d{h.dieType}</span>
                  <PipTrack
                    remaining={h.remaining}
                    max={h.max}
                    disabled
                    interactive={false}
                    onMinus={() => {}}
                    onPlus={() => {}}
                  />
                  {canManage && (
                    <span className="ccp__hd-controls">
                      <button
                        type="button"
                        className="btn ccp__hd-spend"
                        disabled={busy || h.remaining <= 0}
                        onClick={() => handleSpendHitDie(h)}
                      >
                        Spend
                      </button>
                      <button
                        type="button"
                        className="ccp__adj"
                        disabled={busy || h.remaining >= h.max}
                        aria-label={`Restore one d${h.dieType} (no healing)`}
                        title="DM restore — adds one die back, no HP change"
                        onClick={() => handleRestoreHitDie(h)}
                      >
                        +
                      </button>
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ---- Status effects ---- */}
          <div className="ccp__section">
            <p className="ccp__section-title">Status Effects</p>
            <p className="ccp__fx-caveat">
              This panel tracks campaign-session effects only — permanent effects on the base character sheet are separate.
            </p>

            {sheet.statusEffects.length === 0 ? (
              <p className="ccp__fx-none">None active.</p>
            ) : (
              <div className="ccp__fx-list">
                {sheet.statusEffects.map((e: CampaignStatusEffectState) => (
                  <div key={e.statusEffectId} className="ccp__fx-row">
                    <span
                      className={`ccp__fx-name${e.isBeneficial ? " ccp__fx-name--beneficial" : " ccp__fx-name--harmful"}`}
                    >
                      {e.name}
                    </span>
                    {e.remainingRounds !== null && (
                      <span className="ccp__fx-meta">{e.remainingRounds}r</span>
                    )}
                    {e.source && (
                      <span className="ccp__fx-meta">from {e.source}</span>
                    )}
                    {canManage && (
                      <button
                        type="button"
                        className="ccp__fx-remove"
                        disabled={busy}
                        aria-label={`Remove ${e.name}`}
                        onClick={() => handleRemoveStatusEffect(e)}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {canManage && (
              <div className="ccp__fx-add">
                <div className="ccp__fx-add-row">
                  <button
                    type="button"
                    className="btn ccp__fx-toggle"
                    disabled={busy}
                    onClick={() => setShowPalette((p) => !p)}
                  >
                    {showPalette ? "− Cancel" : "+ Add Condition"}
                  </button>
                  {showPalette && (
                    <div className="ccp__fx-rounds-row">
                      <label htmlFor="ccp-rounds">Rounds (optional):</label>
                      <input
                        id="ccp-rounds"
                        type="number"
                        className="input ccp__fx-rounds-input"
                        min={1}
                        value={paletteRounds}
                        onChange={(e) => setPaletteRounds(e.target.value)}
                        placeholder="∞"
                      />
                    </div>
                  )}
                </div>

                {showPalette && catalog.length > 0 && (
                  <div className="ccp__fx-palette">
                    {beneficialCatalog.length > 0 && (
                      <div>
                        <p className="ccp__fx-palette-group-title">Beneficial</p>
                        <div className="ccp__fx-chips">
                          {beneficialCatalog.map((s) => {
                            const on = appliedIds.has(s.id);
                            return (
                              <button
                                key={s.id}
                                type="button"
                                className={`ccp__fx-chip ccp__fx-chip--beneficial${on ? " ccp__fx-chip--on" : ""}`}
                                disabled={on || busy}
                                title={s.description ?? undefined}
                                onClick={() => handleAddStatusEffect(s)}
                              >
                                {on ? "✓ " : ""}{s.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {harmfulCatalog.length > 0 && (
                      <div>
                        <p className="ccp__fx-palette-group-title">Harmful</p>
                        <div className="ccp__fx-chips">
                          {harmfulCatalog.map((s) => {
                            const on = appliedIds.has(s.id);
                            return (
                              <button
                                key={s.id}
                                type="button"
                                className={`ccp__fx-chip ccp__fx-chip--harmful${on ? " ccp__fx-chip--on" : ""}`}
                                disabled={on || busy}
                                title={s.description ?? undefined}
                                onClick={() => handleAddStatusEffect(s)}
                              >
                                {on ? "✓ " : ""}{s.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {catalog.length === 0 && (
                      <p className="ccp__fx-none">No conditions in the catalog.</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ---- Rests ---- */}
          {canManage && (
            <div className="ccp__section">
              <p className="ccp__section-title">Rests</p>
              <div className="ccp__rest-row">
                <button
                  type="button"
                  className="btn ccp__rest-btn"
                  disabled={busy}
                  title="Short Rest: pact slots and short-rest resources restored; HP unchanged"
                  onClick={handleShortRest}
                >
                  Short Rest
                </button>
                <button
                  type="button"
                  className="btn ccp__rest-btn"
                  disabled={busy}
                  title="Long Rest: all slots and resources restored, HP to max, temp HP cleared, exhaustion −1"
                  onClick={handleLongRest}
                >
                  Long Rest
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
