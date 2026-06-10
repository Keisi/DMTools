import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { campaigns } from "../api/endpoints";
import type { CampaignResponse } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../api/client";
import "./CampaignList.css";

export default function CampaignList() {
  const { userId } = useAuth();
  const navigate = useNavigate();

  const [list, setList] = useState<CampaignResponse[] | null>(null);
  const [invitations, setInvitations] = useState<CampaignResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([campaigns.list(), campaigns.invitations()])
      .then(([camp, inv]) => {
        setList(camp);
        setInvitations(inv);
      })
      .catch((err) => {
        setList([]);
        setError(
          err instanceof ApiError
            ? `${err.status}: ${err.message}`
            : "Backend unreachable.",
        );
      });
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const c = await campaigns.create({ name: newName.trim(), description: newDesc.trim() || null });
      navigate(`/campaigns/${c.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create campaign.");
      setSaving(false);
    }
  }

  return (
    <div className="container campaigns">
      <div className="campaigns__head">
        <h1>Campaigns</h1>
        <button className="btn btn--primary" onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? "Cancel" : "+ New Campaign"}
        </button>
      </div>
      <hr className="rule" />

      {showCreate && (
        <form className="campaigns__create panel" onSubmit={handleCreate}>
          <h3 className="campaigns__create-title">New Campaign</h3>
          <input
            className="input"
            placeholder="Campaign name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            required
            autoFocus
          />
          <input
            className="input"
            placeholder="Description (optional)"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
          />
          <div className="campaigns__create-actions">
            <button className="btn btn--primary" type="submit" disabled={saving || !newName.trim()}>
              {saving ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      )}

      {error && <p className="campaigns__notice text-faint">{error}</p>}

      {invitations.length > 0 && (
        <div className="campaigns__invitations">
          <h2 className="campaigns__invitations-title">Pending invitations</h2>
          <div className="campaigns__grid">
            {invitations.map((c) => (
              <Link key={c.id} to={`/campaigns/${c.id}`} className="campaigns__card panel">
                <div className="campaigns__card-body">
                  <h3 className="campaigns__card-name">{c.name}</h3>
                  {c.description && (
                    <p className="text-muted campaigns__card-desc">{c.description}</p>
                  )}
                  <p className="text-muted campaigns__card-dm">DM: {c.dmUsername}</p>
                </div>
                <span className="badge campaigns__card-role">Invited</span>
              </Link>
            ))}
          </div>
          <hr className="rule" />
        </div>
      )}

      {list === null ? (
        <div className="campaigns__grid">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton campaigns__skel" />
          ))}
        </div>
      ) : list.length === 0 && !showCreate ? (
        <div className="vault__empty panel anim-rise-in">
          <p className="text-muted">No campaigns yet.</p>
          <button className="btn btn--primary" onClick={() => setShowCreate(true)}>
            Create your first campaign
          </button>
        </div>
      ) : (
        <div className="campaigns__grid">
          {list.map((c) => (
            <Link key={c.id} to={`/campaigns/${c.id}`} className="campaigns__card panel">
              <div className="campaigns__card-body">
                <h3 className="campaigns__card-name">{c.name}</h3>
                {c.description && (
                  <p className="text-muted campaigns__card-desc">{c.description}</p>
                )}
              </div>
              <span className={`badge campaigns__card-role ${c.dmUserId === userId ? "badge--accent" : ""}`}>
                {c.dmUserId === userId ? "DM" : "Member"}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
