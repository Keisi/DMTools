import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { campaigns, characters as charApi } from "../api/endpoints";
import type {
  CampaignCharacterResponse,
  CharacterResponse,
  CombatantResponse,
  EncounterResponse,
} from "../api/types";
import { CombatantDisposition, EncounterStatus } from "../api/types";
import { ApiError } from "../api/client";
import { HubStatus } from "../hooks/useEncounterHub";
import DeathSaveTrack from "../components/DeathSaveTrack";
import "./CharacterSheet.css";
import "./EncounterView.css";
import "./PlayerEncounterView.css";

const fmtMod = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

// Friend/foe shown to players. Falls back to the link when the DM hasn't set a
// disposition: character-linked ⇒ Player Character, unlinked ⇒ Enemy.
function dispositionOf(c: CombatantResponse): CombatantDisposition {
  if (c.disposition != null) return c.disposition;
  return c.characterId !== null
    ? CombatantDisposition.PlayerCharacter
    : CombatantDisposition.Enemy;
}
const DISPOSITION_META: Record<
  CombatantDisposition,
  { label: string; mod: string }
> = {
  [CombatantDisposition.PlayerCharacter]: { label: "Player", mod: "pc" },
  [CombatantDisposition.FriendlyNpc]: { label: "Ally", mod: "ally" },
  [CombatantDisposition.Enemy]: { label: "Enemy", mod: "enemy" },
};

export default function PlayerEncounterView({
  encounter,
  campaignId,
  userId,
  campChars,
  hubStatus,
  hubLabel,
  onUpdate,
}: {
  encounter: EncounterResponse;
  campaignId: string;
  userId: string | null;
  campChars: CampaignCharacterResponse[];
  hubStatus: HubStatus;
  hubLabel: string;
  // Replace parent encounter state with a mutation's returned EncounterResponse
  // (the parent's applyUpdate — same path as REST + hub pushes).
  onUpdate: (enc: EncounterResponse) => void;
}) {
  const isActive = encounter.status === EncounterStatus.Active;
  const isPending = encounter.status === EncounterStatus.Pending;
  const isEnded = encounter.status === EncounterStatus.Ended;

  // Which combatants are the viewer's own characters? Linked combatants whose
  // character is owned by this user (the ownership signal everyone can see).
  const myCharIds = useMemo(
    () =>
      new Set(
        campChars.filter((cc) => cc.ownerId === userId).map((cc) => cc.characterId),
      ),
    [campChars, userId],
  );
  const myCombatants = useMemo(
    () =>
      encounter.combatants.filter(
        (c) => c.characterId !== null && myCharIds.has(c.characterId),
      ),
    [encounter.combatants, myCharIds],
  );

  // When the player fields more than one character, let them pick which sheet to show.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    myCombatants.find((c) => c.id === selectedId) ?? myCombatants[0] ?? null;

  const [sheet, setSheet] = useState<CharacterResponse | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);

  useEffect(() => {
    // No character of our own in this fight → spectator; the parent renders the
    // Spectating panel instead of the card, so a stale sheet is never shown.
    const charId = selected?.characterId;
    if (!charId) return;
    let active = true;
    charApi
      .get(charId)
      .then((s) => {
        if (active) {
          setSheet(s);
          setSheetError(null);
        }
      })
      .catch((err: unknown) => {
        if (active)
          setSheetError(
            err instanceof ApiError ? err.message : "Failed to load your character.",
          );
      });
    return () => {
      active = false;
    };
  }, [selected?.characterId]);

  // Turn order: sortOrder is authoritative during Active combat; otherwise sort by
  // initiative DESC with un-rolled combatants pushed last.
  const order = useMemo(() => {
    return [...encounter.combatants].sort((a, b) => {
      if (isActive) return a.sortOrder - b.sortOrder;
      if (a.initiative === null && b.initiative === null) return 0;
      if (a.initiative === null) return 1;
      if (b.initiative === null) return -1;
      return b.initiative - a.initiative;
    });
  }, [encounter.combatants, isActive]);

  // DM-controlled per-combatant visibility (default visible until the backend ships
  // the flags). A combatant flagged hidden is dropped from the player view entirely.
  const visibleOrder = order.filter((c) => !c.isHiddenFromPlayers);

  const acting = encounter.activeCombatantId
    ? encounter.combatants.find((c) => c.id === encounter.activeCombatantId) ?? null
    : null;
  const myTurn =
    !!acting && myCombatants.some((c) => c.id === acting.id);
  // The active combatant is hidden from players — don't reveal its name.
  const actingHidden = !!acting && !!acting.isHiddenFromPlayers;

  const statusLabel = isPending ? "Pending" : isActive ? "Active" : "Ended";
  const statusMod = isPending
    ? "enc__status--pending"
    : isActive
      ? "enc__status--active"
      : "enc__status--ended";

  return (
    <div className="container penc anim-rise-in">
      {/* ---- Header ---- */}
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
              className={`enc__hub enc__hub--${hubStatus}`}
              title={`Live updates: ${hubLabel}`}
            >
              <span className="enc__hub-dot" aria-hidden="true" />
              {hubLabel}
            </span>
          </div>
        </div>
        {myCombatants.length > 1 && (
          <div className="penc__char-switch">
            <label className="penc__switch-label">Your character</label>
            <select
              className="input"
              value={selected?.id ?? ""}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              {myCombatants.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* ---- Turn banner ---- */}
      {isActive && acting && (
        <div className={`penc__turn-banner${myTurn ? " penc__turn-banner--mine" : ""}`}>
          {myTurn ? (
            <span className="penc__turn-headline">⚔ Your turn — {acting.name}!</span>
          ) : actingHidden ? (
            <span className="penc__turn-headline">A hidden enemy is acting…</span>
          ) : (
            <span className="penc__turn-headline">
              Now acting: <strong>{acting.name}</strong>
            </span>
          )}
          <span className="penc__turn-sub">
            Round {encounter.roundNumber}
            {!actingHidden && acting.initiative !== null
              ? ` · initiative ${acting.initiative}`
              : ""}
          </span>
        </div>
      )}
      {isPending && (
        <div className="penc__turn-banner">
          <span className="penc__turn-headline">Waiting for the DM to start combat…</span>
          <span className="penc__turn-sub">
            {selected?.initiative != null
              ? `Your initiative: ${selected.initiative}`
              : "Your initiative hasn't been set yet."}
          </span>
        </div>
      )}
      {isEnded && (
        <div className="penc__turn-banner penc__turn-banner--ended">
          <span className="penc__turn-headline">Combat has ended.</span>
        </div>
      )}

      <div className="penc__grid">
        {/* ---- Your character (combat card) ---- */}
        <div className="penc__main">
          {!selected ? (
            <section className="panel penc__spectate">
              <h2 className="enc__title">Spectating</h2>
              <p className="text-muted">
                You have no character in this encounter. You can follow the turn
                order on the right.
              </p>
            </section>
          ) : (
            <CombatCard
              combatant={selected}
              sheet={sheet}
              error={sheetError}
              campaignId={campaignId}
              encounterId={encounter.id}
              onUpdate={onUpdate}
            />
          )}
        </div>

        {/* ---- Turn order tracker ---- */}
        <aside className="penc__tracker panel">
          <h3 className="sheet__block-title">Turn Order</h3>
          <hr className="rule" />
          <ul className="penc__track-list">
            {visibleOrder.map((c, i) => (
              <TrackerRow
                key={c.id}
                combatant={c}
                rank={i + 1}
                isActive={c.id === encounter.activeCombatantId}
                isMine={myCombatants.some((m) => m.id === c.id)}
              />
            ))}
            {visibleOrder.length === 0 && (
              <li className="text-faint">No combatants to show.</li>
            )}
          </ul>
        </aside>
      </div>
    </div>
  );
}

function TrackerRow({
  combatant: c,
  rank,
  isActive,
  isMine,
}: {
  combatant: CombatantResponse;
  rank: number;
  isActive: boolean;
  isMine: boolean;
}) {
  // Everyone shows exact HP + a bar and AC; the DM can hide an individual enemy's
  // HP and/or AC (per-item flags).
  const disp = DISPOSITION_META[dispositionOf(c)];
  // A downed PC (linked, 0 HP) shows death-save pips instead of an empty HP bar.
  const dying = c.characterId !== null && c.currentHp === 0;
  // Scale by maxHp + tempHp so current/temp segments are proportional in one bar.
  const hpScale = c.maxHp + c.tempHp;
  const hpPct = hpScale > 0 ? Math.max(0, (c.currentHp / hpScale) * 100) : 0;
  const tempPct = hpScale > 0 ? Math.max(0, (c.tempHp / hpScale) * 100) : 0;
  return (
    <li
      className={
        "penc__track-row" +
        (isActive ? " penc__track-row--active" : "") +
        (isMine ? " penc__track-row--mine" : "") +
        (!c.isActive ? " penc__track-row--out" : "")
      }
    >
      <div className="penc__track-top">
        <span
          className={"penc__rank" + (isActive ? " penc__rank--active" : "")}
          title={isActive ? "Acting now" : `Turn order #${rank}`}
        >
          {isActive ? "▶" : rank}
        </span>
        <span className="penc__track-name">
          {c.name}
          {isMine && <span className="penc__you-tag"> you</span>}
        </span>
        <span
          className={`penc__disp penc__disp--${disp.mod}`}
          title={`${disp.label} — ${
            disp.mod === "pc"
              ? "player character"
              : disp.mod === "ally"
                ? "friendly NPC"
                : "enemy"
          }`}
        >
          {disp.label}
        </span>
        <span className="penc__track-stat" title="Initiative">
          <span className="penc__stat-label">Init</span>
          <span className="penc__stat-val">{c.initiative ?? "—"}</span>
        </span>
      </div>

      <div className="penc__track-bottom">
        {c.hpHiddenFromPlayers ? (
          <span className="penc__track-hp penc__hidden" title="HP hidden by the DM">
            HP hidden
          </span>
        ) : dying ? (
          <>
            <span className="penc__track-dying">
              <DeathSaveTrack
                compact
                successes={c.deathSaveSuccesses ?? 0}
                failures={c.deathSaveFailures ?? 0}
              />
            </span>
            <span className="penc__track-hp">
              <span className="penc__stat-label">HP</span>
              <span className="penc__stat-val">0/{c.maxHp}</span>
            </span>
          </>
        ) : (
          <>
            <div
              className="enc__hp-bar penc__track-hpbar"
              title={`${c.currentHp} of ${c.maxHp} hit points${c.tempHp > 0 ? ` (+${c.tempHp} temp)` : ""}`}
            >
              <div className="enc__hp-fill" style={{ width: `${hpPct}%` }} />
              {c.tempHp > 0 && (
                <div className="enc__hp-temp-fill" style={{ width: `${tempPct}%` }} />
              )}
            </div>
            <span className="penc__track-hp">
              <span className="penc__stat-label">HP</span>
              <span className="penc__stat-val">
                {c.currentHp}/{c.maxHp}
                {c.tempHp > 0 && <span className="enc__hp-temp"> +{c.tempHp}</span>}
              </span>
            </span>
          </>
        )}
        {/* AC — shown for every combatant; the DM can hide an enemy's AC. */}
        <span
          className={
            "penc__track-stat penc__track-ac" +
            (c.acHiddenFromPlayers ? " penc__hidden" : "")
          }
          title={c.acHiddenFromPlayers ? "AC hidden by the DM" : "Armor Class"}
        >
          <span className="penc__stat-label">AC</span>
          <span className="penc__stat-val">
            {c.acHiddenFromPlayers ? "?" : c.armorClass}
          </span>
        </span>
      </div>
    </li>
  );
}

function CombatCard({
  combatant,
  sheet,
  error,
  campaignId,
  encounterId,
  onUpdate,
}: {
  combatant: CombatantResponse;
  sheet: CharacterResponse | null;
  error: string | null;
  campaignId: string;
  encounterId: string;
  onUpdate: (enc: EncounterResponse) => void;
}) {
  // Players may damage/heal their OWN combatant any time (backend authorizes by
  // ownership, not turn — AuthorizeCombatantWriteAsync). HP math + death-save reset
  // are server-side; we send a delta and render the returned EncounterResponse.
  const [hpDelta, setHpDelta] = useState("");
  const [hpBusy, setHpBusy] = useState(false);
  const [hpError, setHpError] = useState<string | null>(null);

  async function applyHpDelta(heal: boolean) {
    const raw = parseInt(hpDelta, 10);
    if (isNaN(raw) || raw === 0) return;
    const delta = heal ? Math.abs(raw) : -Math.abs(raw);
    setHpBusy(true);
    setHpError(null);
    try {
      onUpdate(
        await campaigns.updateCombatantHp(campaignId, encounterId, combatant.id, {
          delta,
        }),
      );
      setHpDelta("");
    } catch (err) {
      setHpError(err instanceof ApiError ? err.message : "Failed to update HP.");
    }
    setHpBusy(false);
  }

  // Record this dying PC's own death saves (backend is owner-scoped + validates the
  // dying/linked gate; 3 successes ⇒ Stable, 3 failures ⇒ Dead are derived server-side).
  async function recordDeathSaves(successes: number, failures: number) {
    setHpError(null);
    try {
      onUpdate(
        await campaigns.recordDeathSaves(campaignId, encounterId, combatant.id, {
          successes,
          failures,
        }),
      );
    } catch (err) {
      setHpError(
        err instanceof ApiError ? err.message : "Failed to record death saves.",
      );
    }
  }

  if (error) {
    return (
      <section className="panel penc__spectate">
        <h2 className="enc__title">{combatant.name}</h2>
        <p className="enc__error">{error}</p>
      </section>
    );
  }
  if (!sheet) {
    return (
      <section className="panel">
        <div className="skeleton" style={{ height: 120 }} />
        <div className="skeleton" style={{ height: 200, marginTop: 16 }} />
      </section>
    );
  }

  const c = sheet;
  // Scale by maxHp + tempHp so current/temp segments are proportional in one bar.
  const hpScale = combatant.maxHp + combatant.tempHp;
  const hpPct = hpScale > 0 ? Math.max(0, (combatant.currentHp / hpScale) * 100) : 0;
  const tempPct = hpScale > 0 ? Math.max(0, (combatant.tempHp / hpScale) * 100) : 0;
  // Combined (PHB) spell slot pool: non-pact casters share one pool; pact is separate.
  const standardCasters = c.spellcasting.filter((s) => !s.isPactMagic);
  const pactCasters = c.spellcasting.filter((s) => s.isPactMagic);
  const slotsByLevel = new Map<number, number>();
  for (const s of standardCasters[0]?.spellSlots ?? [])
    slotsByLevel.set(s.level, s.count);
  for (const sc of pactCasters)
    for (const s of sc.spellSlots)
      slotsByLevel.set(s.level, (slotsByLevel.get(s.level) ?? 0) + s.count);
  const spellLevels = [
    ...new Set([...c.spells.map((s) => s.level), ...slotsByLevel.keys()]),
  ].sort((a, b) => a - b);

  return (
    <section className="penc__card">
      {/* Header + live combat vitals */}
      <header className="panel penc__card-head">
        <div>
          <h2 className="sheet__name">{combatant.name}</h2>
          <p className="text-muted">
            {c.race?.name}
            {c.subrace ? ` (${c.subrace.name})` : ""} ·{" "}
            {c.classes.map((cl) => `${cl.name} ${cl.level}`).join(" / ")} · Level{" "}
            {c.level}
          </p>
        </div>

        {/* Live combat HP (from the combatant, not the static sheet max). */}
        <div className="penc__hp-block">
          <div className="penc__hp-row">
            <span className="penc__hp-big">
              {combatant.currentHp}
              <span className="text-faint">/{combatant.maxHp}</span>
            </span>
            {combatant.tempHp > 0 && (
              <span className="penc__hp-temp">+{combatant.tempHp} temp</span>
            )}
          </div>
          <div className="enc__hp-bar penc__hp-bar">
            <div className="enc__hp-fill" style={{ width: `${hpPct}%` }} />
            {combatant.tempHp > 0 && (
              <div className="enc__hp-temp-fill" style={{ width: `${tempPct}%` }} />
            )}
          </div>

          {/* Self-service damage/heal on your own combatant. */}
          <div className="enc__ctrl-grp penc__hp-controls">
            <span className="enc__ctrl-label">Damage / Heal</span>
            <div className="enc__ctrl-row">
              <input
                type="number"
                className="input enc__delta-inp"
                value={hpDelta}
                onChange={(e) => setHpDelta(e.target.value)}
                disabled={hpBusy}
                placeholder="Amt"
                min="0"
                aria-label="HP amount"
              />
              <button
                className="btn enc__dmg-btn"
                disabled={hpBusy}
                onClick={() => applyHpDelta(false)}
              >
                Dmg
              </button>
              <button
                className="btn enc__heal-btn"
                disabled={hpBusy}
                onClick={() => applyHpDelta(true)}
              >
                Heal
              </button>
            </div>
            {hpError && <span className="enc__error">{hpError}</span>}
          </div>
        </div>
      </header>

      {combatant.currentHp === 0 && (
        <div className="panel penc__dying">
          <span className="penc__dying-label">⚰ Dying — making death saves</span>
          <DeathSaveTrack
            successes={combatant.deathSaveSuccesses ?? 0}
            failures={combatant.deathSaveFailures ?? 0}
            onChange={recordDeathSaves}
          />
        </div>
      )}

      <div className="sheet__vitals penc__vitals">
        <Vital label="AC" value={c.armorClass} />
        <Vital
          label="Init"
          value={combatant.initiative != null ? combatant.initiative : fmtMod(c.initiative)}
        />
        <Vital label="Speed" value={`${c.walkingSpeed}ft`} />
        <Vital label="Prof" value={fmtMod(c.proficiencyBonus)} />
        <Vital label="Pass. Perc" value={c.passivePerception} />
      </div>

      {/* Abilities */}
      <section className="sheet__abilities penc__abilities">
        {c.abilityScores.map((a) => (
          <div key={a.statId} className="ability panel">
            <div className="ability__code">{a.name}</div>
            <div className="ability__mod">{fmtMod(a.modifier)}</div>
            <div className="ability__score">{a.effective}</div>
          </div>
        ))}
      </section>

      <div className="penc__blocks">
        {/* Conditions first — they change what you can do this turn. */}
        {c.statusEffects.length > 0 && (
          <section className="panel sheet__block">
            <h3 className="sheet__block-title">Conditions</h3>
            <hr className="rule" />
            <ul className="prof-list">
              {c.statusEffects.map((s) => (
                <li key={s.statusEffectId} className="prof-list__row">
                  <span className="prof-list__name">{s.name}</span>
                  <span className={"badge" + (s.isBeneficial ? " badge--accent" : "")}>
                    {s.isBeneficial ? "buff" : "debuff"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Attacks */}
        {c.weaponAttacks.length > 0 && (
          <section className="panel sheet__block">
            <h3 className="sheet__block-title">Attacks</h3>
            <hr className="rule" />
            <ul className="prof-list">
              {c.weaponAttacks.map((a) => (
                <li key={a.weaponId} className="prof-list__row">
                  <span className={"dot" + (a.isProficient ? " dot--on" : "")} />
                  <span className="prof-list__name">{a.name}</span>
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
          </section>
        )}

        {/* Saving throws */}
        <section className="panel sheet__block">
          <h3 className="sheet__block-title">Saving Throws</h3>
          <hr className="rule" />
          <ul className="prof-list">
            {c.savingThrows.map((s) => (
              <li key={s.statId} className="prof-list__row">
                <span className={"dot" + (s.isProficient ? " dot--on" : "")} />
                <span className="prof-list__name">{s.name}</span>
                <span className="prof-list__val">{fmtMod(s.modifier)}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Resources */}
        {c.resources.length > 0 && (
          <section className="panel sheet__block">
            <h3 className="sheet__block-title">Resources</h3>
            <hr className="rule" />
            <ul className="prof-list">
              {c.resources.map((r, i) => (
                <li key={`${r.name}-${i}`} className="prof-list__row">
                  <span className="prof-list__name">{r.name}</span>
                  <span className="prof-list__val">{r.max}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Spellcasting */}
        {(c.spellcasting.length > 0 || c.spells.length > 0) && (
          <section className="panel sheet__block">
            <h3 className="sheet__block-title">Spellcasting</h3>
            <hr className="rule" />
            {c.spellcasting.map((sc, i) => (
              <p key={`${sc.class}-${i}`} className="text-faint penc__caster">
                {sc.class}
                {sc.isPactMagic ? " (Pact)" : ""} · {sc.ability} · save DC {sc.saveDc} ·
                spell atk {fmtMod(sc.spellAttackBonus)}
              </p>
            ))}
            {slotsByLevel.size > 0 && (
              <p className="penc__slots">
                {[...slotsByLevel.entries()]
                  .sort((a, b) => a[0] - b[0])
                  .map(([lvl, n]) => `L${lvl}: ${n}`)
                  .join("   ")}
              </p>
            )}
            {spellLevels.map((lvl) => {
              const at = c.spells
                .filter((s) => s.level === lvl)
                .sort((a, b) => a.name.localeCompare(b.name));
              if (at.length === 0) return null;
              return (
                <div key={lvl} className="penc__spell-group">
                  <h4 className="penc__spell-level">
                    {lvl === 0 ? "Cantrips" : `Level ${lvl}`}
                    {slotsByLevel.has(lvl) && (
                      <span className="text-faint"> · {slotsByLevel.get(lvl)} slots</span>
                    )}
                  </h4>
                  <p className="penc__spell-names">
                    {at.map((s) => s.name).join(", ")}
                  </p>
                </div>
              );
            })}
          </section>
        )}
      </div>
    </section>
  );
}

function Vital({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="vital">
      <div className="vital__value">{value}</div>
      <div className="vital__label">{label}</div>
    </div>
  );
}
