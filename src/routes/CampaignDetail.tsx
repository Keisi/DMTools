import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { campaigns, characters as charApi } from "../api/endpoints";
import type {
  CampaignResponse,
  CampaignMemberResponse,
  CampaignCharacterResponse,
  SessionResponse,
  CharacterResponse,
  EncounterSummaryResponse,
} from "../api/types";
import { CampaignMemberStatus, EncounterStatus } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../api/client";
import "./CampaignDetail.css";

export default function CampaignDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const { userId } = useAuth();
  const navigate = useNavigate();

  const [campaign, setCampaign] = useState<CampaignResponse | null>(null);
  const [members, setMembers] = useState<CampaignMemberResponse[]>([]);
  const [campChars, setCampChars] = useState<CampaignCharacterResponse[]>([]);
  const [sessions, setSessions] = useState<SessionResponse[]>([]);
  const [myChars, setMyChars] = useState<CharacterResponse[]>([]);
  const [encounters, setEncounters] = useState<EncounterSummaryResponse[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  function reload() { setRefreshKey((k) => k + 1); }

  // Form states
  const [inviteUsername, setInviteUsername] = useState("");
  const [inviting, setInviting] = useState(false);
  const [transferTo, setTransferTo] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [registerCharId, setRegisterCharId] = useState("");
  const [registering, setRegistering] = useState(false);
  const [sessionName, setSessionName] = useState("");
  const [sessionDate, setSessionDate] = useState("");
  const [creatingSession, setCreatingSession] = useState(false);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [copyCharId, setCopyCharId] = useState<string | null>(null);
  const [copyTarget, setCopyTarget] = useState("");
  const [copying, setCopying] = useState(false);
  const [encName, setEncName] = useState("");
  const [encSession, setEncSession] = useState("");
  const [creatingEnc, setCreatingEnc] = useState(false);

  const isDm = !!campaign && campaign.dmUserId === userId;
  const ownMembership = members.find((m) => m.userId === userId);
  const isActive = ownMembership?.status === CampaignMemberStatus.Active;
  const isInvited = ownMembership?.status === CampaignMemberStatus.Invited;
  const activeMembers = members.filter((m) => m.status === CampaignMemberStatus.Active);
  const pendingMembers = members.filter((m) => m.status === CampaignMemberStatus.Requested);
  // DM-initiated invites awaiting the player's accept (status Invited). Without
  // their own list these rows render nowhere, so an invite looks like a no-op.
  const invitedMembers = members.filter((m) => m.status === CampaignMemberStatus.Invited);
  const unregisteredMyChars = myChars.filter(
    (c) => !c.isRetired && !campChars.some((cc) => cc.characterId === c.id),
  );

  useEffect(() => {
    let active = true;
    Promise.all([
      campaigns.get(id),
      campaigns.members(id),
      campaigns.characters(id),
      campaigns.sessions(id),
      charApi.list(),
      campaigns.encounters(id),
    ])
      .then(([camp, mems, chars, sess, mine, encs]) => {
        if (!active) return;
        setError(null);
        setCampaign(camp);
        setMembers(mems);
        setCampChars(chars);
        setSessions(sess);
        setMyChars(mine);
        setEncounters(encs);
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
        else setError(err instanceof ApiError ? err.message : "Failed to load campaign.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, refreshKey]);

  // ---- Actions ----

  async function handleJoin() {
    setJoiningId(id);
    try {
      await campaigns.join(id);
      setNotFound(false);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to join.");
    } finally {
      setJoiningId(null);
    }
  }

  async function handleAcceptOwn() {
    await campaigns.acceptMember(id, userId ?? "");
    reload();
  }

  async function handleRejectOwn() {
    await campaigns.rejectMember(id, userId ?? "");
    navigate("/campaigns");
  }

  async function handleAccept(uid: string) {
    await campaigns.acceptMember(id, uid);
    setMembers(await campaigns.members(id));
  }

  async function handleReject(uid: string) {
    await campaigns.rejectMember(id, uid);
    setMembers(await campaigns.members(id));
  }

  async function handleRemoveMember(uid: string) {
    await campaigns.removeMember(id, uid);
    setMembers(await campaigns.members(id));
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteUsername.trim()) return;
    setInviting(true);
    try {
      await campaigns.invite(id, { username: inviteUsername.trim() });
      setInviteUsername("");
      setMembers(await campaigns.members(id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Invite failed.");
    } finally {
      setInviting(false);
    }
  }

  async function handleTransferDm(e: React.FormEvent) {
    e.preventDefault();
    if (!transferTo) return;
    setTransferring(true);
    try {
      const updated = await campaigns.transferDm(id, { userId: transferTo });
      setCampaign(updated);
      setTransferTo("");
      setMembers(await campaigns.members(id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Transfer failed.");
    } finally {
      setTransferring(false);
    }
  }

  async function handleRegisterChar(e: React.FormEvent) {
    e.preventDefault();
    if (!registerCharId) return;
    setRegistering(true);
    try {
      await campaigns.registerCharacter(id, { characterId: registerCharId });
      setRegisterCharId("");
      setCampChars(await campaigns.characters(id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Register failed.");
    } finally {
      setRegistering(false);
    }
  }

  async function handleUnregister(characterId: string) {
    await campaigns.unregisterCharacter(id, characterId);
    setCampChars(await campaigns.characters(id));
  }

  async function handleCopyChar(e: React.FormEvent, characterId: string) {
    e.preventDefault();
    if (!copyTarget.trim()) return;
    setCopying(true);
    try {
      await charApi.copy(characterId, { targetUsername: copyTarget.trim() });
      setCopyCharId(null);
      setCopyTarget("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Copy failed.");
    }
    setCopying(false);
  }

  async function handleCreateSession(e: React.FormEvent) {
    e.preventDefault();
    if (!sessionName.trim()) return;
    setCreatingSession(true);
    try {
      const s = await campaigns.createSession(id, {
        name: sessionName.trim(),
        date: sessionDate || null,
      });
      setSessions((prev) => [...prev, s]);
      setSessionName("");
      setSessionDate("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Create session failed.");
    } finally {
      setCreatingSession(false);
    }
  }

  async function handleDeleteSession(sessionId: string) {
    await campaigns.deleteSession(id, sessionId);
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    if (expandedSession === sessionId) setExpandedSession(null);
  }

  async function handleRosterAdd(sessionId: string, charId: string) {
    await campaigns.addToRoster(id, sessionId, charId);
    setSessions(await campaigns.sessions(id));
  }

  async function handleRosterRemove(sessionId: string, charId: string) {
    await campaigns.removeFromRoster(id, sessionId, charId);
    setSessions(await campaigns.sessions(id));
  }

  async function handleCreateEncounter(e: React.FormEvent) {
    e.preventDefault();
    if (!encName.trim()) return;
    setCreatingEnc(true);
    try {
      const enc = await campaigns.createEncounter(id, {
        name: encName.trim(),
        sessionId: encSession || null,
      });
      setEncounters((prev) => [enc, ...prev]);
      setEncName("");
      setEncSession("");
      navigate(`/campaigns/${id}/encounters/${enc.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Create encounter failed.");
      setCreatingEnc(false);
    }
  }

  async function handleDeleteCampaign() {
    if (!confirm(`Delete campaign "${campaign?.name}"? This cannot be undone.`)) return;
    await campaigns.remove(id);
    navigate("/campaigns");
  }

  // ---- Render ----

  if (loading) {
    return (
      <div className="container">
        <div className="skeleton" style={{ height: 40, maxWidth: 300, marginTop: 24 }} />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="container camp-join">
        <div className="panel camp-join__panel">
          <h2>Campaign not found or access restricted</h2>
          <p className="text-muted">
            {isInvited
              ? "You have a pending invitation to this campaign."
              : "You don't have access yet. If you have an invite, click below to join."}
          </p>
          <button
            className="btn btn--primary"
            disabled={joiningId === id}
            onClick={handleJoin}
          >
            {joiningId === id ? "Joining…" : "Join Campaign"}
          </button>
          {error && <p className="camp__error">{error}</p>}
        </div>
      </div>
    );
  }

  if (!campaign) return null;

  return (
    <div className="container camp">
      {/* ---- Header ---- */}
      <div className="camp__head">
        <div className="camp__head-left">
          <Link to="/campaigns" className="camp__back text-muted">← Campaigns</Link>
          <h1 className="camp__title">{campaign.name}</h1>
          {campaign.description && (
            <p className="text-muted camp__desc">{campaign.description}</p>
          )}
        </div>
        <div className="camp__head-right">
          <span className={`badge ${isDm ? "badge--accent" : ""}`}>
            {isDm ? "DM" : "Member"}
          </span>
          {isDm && (
            <button className="btn camp__delete" onClick={handleDeleteCampaign}>
              Delete
            </button>
          )}
        </div>
      </div>

      {error && <p className="camp__error">{error}</p>}

      {/* ---- Members ---- */}
      <section className="camp__section panel">
        <h2 className="camp__section-title">Members</h2>

        {isInvited && (
          <div className="camp__invite-notice">
            <span>You have a pending invitation.</span>
            <button className="btn btn--primary" onClick={handleAcceptOwn}>Accept</button>
            <button className="btn" onClick={handleRejectOwn}>Decline</button>
          </div>
        )}

        <ul className="camp__member-list">
          {activeMembers.map((m) => (
            <li key={m.userId} className="camp__member-row">
              <span className="camp__member-name">{m.username}</span>
              <span className={`badge ${campaign.dmUserId === m.userId ? "badge--accent" : ""}`}>
                {campaign.dmUserId === m.userId ? "DM" : "Player"}
              </span>
              {isDm && m.userId !== userId && (
                <button
                  className="btn camp__member-remove"
                  onClick={() => handleRemoveMember(m.userId)}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>

        {isDm && pendingMembers.length > 0 && (
          <div className="camp__pending">
            <p className="camp__pending-label text-muted">Pending requests</p>
            <ul className="camp__member-list">
              {pendingMembers.map((m) => (
                <li key={m.userId} className="camp__member-row">
                  <span className="camp__member-name">{m.username}</span>
                  <button className="btn btn--primary" onClick={() => handleAccept(m.userId)}>Accept</button>
                  <button className="btn" onClick={() => handleReject(m.userId)}>Reject</button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {isDm && invitedMembers.length > 0 && (
          <div className="camp__pending">
            <p className="camp__pending-label text-muted">Invited — awaiting response</p>
            <ul className="camp__member-list">
              {invitedMembers.map((m) => (
                <li key={m.userId} className="camp__member-row">
                  <span className="camp__member-name">{m.username}</span>
                  <span className="badge">Invited</span>
                  <button
                    className="btn camp__member-remove"
                    onClick={() => handleRemoveMember(m.userId)}
                  >
                    Cancel
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {isDm && (
          <>
            <form className="camp__invite-form" onSubmit={handleInvite}>
              <input
                className="input camp__invite-input"
                placeholder="Invite player by username"
                value={inviteUsername}
                onChange={(e) => setInviteUsername(e.target.value)}
              />
              <button className="btn btn--primary" type="submit" disabled={inviting || !inviteUsername.trim()}>
                {inviting ? "Inviting…" : "Invite"}
              </button>
            </form>

            {activeMembers.filter((m) => m.userId !== userId).length > 0 && (
              <form className="camp__transfer-form" onSubmit={handleTransferDm}>
                <span className="camp__transfer-label text-muted">Transfer DM to:</span>
                <select
                  className="input camp__transfer-sel"
                  value={transferTo}
                  onChange={(e) => setTransferTo(e.target.value)}
                >
                  <option value="">— select member —</option>
                  {activeMembers
                    .filter((m) => m.userId !== userId)
                    .map((m) => (
                      <option key={m.userId} value={m.userId}>{m.username}</option>
                    ))}
                </select>
                <button className="btn" type="submit" disabled={transferring || !transferTo}>
                  {transferring ? "Transferring…" : "Transfer DM"}
                </button>
              </form>
            )}
          </>
        )}
      </section>

      {/* ---- Characters ---- */}
      <section className="camp__section panel">
        <h2 className="camp__section-title">Characters</h2>

        {campChars.length === 0 ? (
          <p className="text-muted">No characters registered yet.</p>
        ) : (
          <ul className="camp__char-list">
            {campChars.map((cc) => (
              <li key={cc.characterId} className="camp__char-item">
                <div className="camp__char-row">
                  <Link to={`/character/${cc.characterId}`} className="camp__char-name">
                    {cc.characterName}
                  </Link>
                  <span className="text-muted camp__char-owner">{cc.ownerUsername}</span>
                  {isDm && (
                    <button
                      className="btn camp__char-copy"
                      onClick={() => {
                        setCopyCharId(copyCharId === cc.characterId ? null : cc.characterId);
                        setCopyTarget("");
                      }}
                    >
                      Copy
                    </button>
                  )}
                  {(isDm || cc.ownerId === userId) && (
                    <button
                      className="btn camp__char-remove"
                      onClick={() => handleUnregister(cc.characterId)}
                    >
                      Unregister
                    </button>
                  )}
                </div>
                {isDm && copyCharId === cc.characterId && (
                  <form
                    className="camp__copy-form"
                    onSubmit={(e) => handleCopyChar(e, cc.characterId)}
                  >
                    <input
                      className="input camp__copy-input"
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
              </li>
            ))}
          </ul>
        )}

        {(isDm || isActive) && unregisteredMyChars.length > 0 && (
          <form className="camp__register-form" onSubmit={handleRegisterChar}>
            <select
              className="input camp__register-sel"
              value={registerCharId}
              onChange={(e) => setRegisterCharId(e.target.value)}
            >
              <option value="">— register a character —</option>
              {unregisteredMyChars.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button className="btn btn--primary" type="submit" disabled={registering || !registerCharId}>
              {registering ? "Registering…" : "Register"}
            </button>
          </form>
        )}
      </section>

      {/* ---- Sessions ---- */}
      <section className="camp__section panel">
        <h2 className="camp__section-title">Sessions</h2>

        {sessions.length === 0 ? (
          <p className="text-muted">No sessions yet.</p>
        ) : (
          <ul className="camp__session-list">
            {sessions.map((s) => (
              <li key={s.id} className="camp__session-item">
                <div className="camp__session-row">
                  <div className="camp__session-info">
                    <span className="camp__session-name">{s.name}</span>
                    {s.date && (
                      <span className="text-muted camp__session-date">
                        {new Date(s.date).toLocaleDateString()}
                      </span>
                    )}
                    <span className="text-muted camp__session-roster">
                      {s.characterIds.length} character{s.characterIds.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="camp__session-actions">
                    {isDm && (
                      <button
                        className="btn"
                        onClick={() => setExpandedSession(expandedSession === s.id ? null : s.id)}
                      >
                        {expandedSession === s.id ? "Close" : "Roster"}
                      </button>
                    )}
                    {isDm && (
                      <button className="btn camp__session-del" onClick={() => handleDeleteSession(s.id)}>
                        Delete
                      </button>
                    )}
                  </div>
                </div>

                {isDm && expandedSession === s.id && (
                  <div className="camp__roster">
                    <p className="camp__roster-label text-muted">Session roster</p>
                    <div className="camp__roster-chars">
                      {campChars.map((cc) => {
                        const inRoster = s.characterIds.includes(cc.characterId);
                        return (
                          <div key={cc.characterId} className="camp__roster-chip">
                            <span>{cc.characterName}</span>
                            <button
                              className={`btn ${inRoster ? "camp__roster-remove" : "btn--primary"}`}
                              onClick={() =>
                                inRoster
                                  ? handleRosterRemove(s.id, cc.characterId)
                                  : handleRosterAdd(s.id, cc.characterId)
                              }
                            >
                              {inRoster ? "Remove" : "Add"}
                            </button>
                          </div>
                        );
                      })}
                      {campChars.length === 0 && (
                        <p className="text-muted">No characters registered to campaign yet.</p>
                      )}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {isDm && (
          <form className="camp__session-form" onSubmit={handleCreateSession}>
            <input
              className="input"
              placeholder="Session name"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              required
            />
            <input
              className="input camp__session-date-input"
              type="datetime-local"
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
            />
            <button className="btn btn--primary" type="submit" disabled={creatingSession || !sessionName.trim()}>
              {creatingSession ? "Creating…" : "+ Session"}
            </button>
          </form>
        )}
      </section>

      {/* ---- Encounters ---- */}
      <section className="camp__section panel">
        <h2 className="camp__section-title">Encounters</h2>

        {encounters.length === 0 ? (
          <p className="text-muted">No encounters yet.</p>
        ) : (
          <ul className="camp__enc-list">
            {encounters.map((enc) => (
              <li key={enc.id} className="camp__enc-item">
                <Link to={`/campaigns/${id}/encounters/${enc.id}`} className="camp__enc-row">
                  <span className="camp__enc-name">{enc.name}</span>
                  <span className={`badge camp__enc-status camp__enc-status--${enc.status}`}>
                    {enc.status === EncounterStatus.Pending
                      ? "Pending"
                      : enc.status === EncounterStatus.Active
                        ? "Active"
                        : "Ended"}
                  </span>
                  {enc.roundNumber > 0 && (
                    <span className="text-muted camp__enc-round">Round {enc.roundNumber}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}

        {isDm && (
          <form className="camp__enc-form" onSubmit={handleCreateEncounter}>
            <input
              className="input"
              placeholder="Encounter name"
              value={encName}
              onChange={(e) => setEncName(e.target.value)}
              required
            />
            <select
              className="input camp__enc-session-sel"
              value={encSession}
              onChange={(e) => setEncSession(e.target.value)}
            >
              <option value="">— no session —</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <button className="btn btn--primary" type="submit" disabled={creatingEnc || !encName.trim()}>
              {creatingEnc ? "Creating…" : "+ Encounter"}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
