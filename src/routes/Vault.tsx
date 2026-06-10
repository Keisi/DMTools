import { useEffect, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { characters } from "../api/endpoints";
import type { CharacterResponse } from "../api/types";
import { ApiError } from "../api/client";
import "./Vault.css";

export default function Vault() {
  const [list, setList] = useState<CharacterResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRetired, setShowRetired] = useState(false);
  const [retiring, setRetiring] = useState<string | null>(null);

  useEffect(() => {
    characters
      .list()
      .then(setList)
      .catch((err) => {
        setList([]);
        setError(
          err instanceof ApiError
            ? `${err.status}: ${err.message}`
            : "Backend unreachable — start the DMTool API.",
        );
      });
  }, []);

  async function handleRetire(id: string, isRetired: boolean) {
    setRetiring(id);
    try {
      const updated = await characters.retire(id, { isRetired });
      setList((prev) => prev?.map((c) => (c.id === id ? updated : c)) ?? prev);
    } finally {
      setRetiring(null);
    }
  }

  const retiredCount = list?.filter((c) => c.isRetired).length ?? 0;
  const visible = list
    ? showRetired
      ? list
      : list.filter((c) => !c.isRetired)
    : null;

  return (
    <div className="container vault">
      <div className="vault__head">
        <h1>The Vault</h1>
        <div className="vault__head-actions">
          {retiredCount > 0 && (
            <button
              className="btn"
              onClick={() => setShowRetired((v) => !v)}
            >
              {showRetired ? "Hide retired" : `Show retired (${retiredCount})`}
            </button>
          )}
          <Link to="/character/new" className="btn btn--primary">
            + New Character
          </Link>
        </div>
      </div>
      <hr className="rule" />

      {error && <p className="vault__notice text-faint">{error}</p>}

      {visible === null ? (
        <div className="vault__grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton vault__skel" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="vault__empty panel anim-rise-in">
          <p className="text-muted">No heroes yet.</p>
          <Link to="/character/new" className="btn btn--primary">
            Create your first character
          </Link>
        </div>
      ) : (
        <div className="vault__grid stagger">
          {visible.map((c, i) => (
            <div
              key={c.id}
              className={`vault__card-wrap${c.isRetired ? " vault__card-wrap--retired" : ""}`}
              style={{ "--stagger-i": i } as CSSProperties}
            >
              <Link to={`/character/${c.id}`} className="vault__card panel">
                <div className="vault__card-level">{c.level}</div>
                <div className="vault__card-body">
                  <h3 className="vault__card-name">{c.name}</h3>
                  <p className="text-muted vault__card-meta">
                    {c.race?.name ?? "Unknown race"} ·{" "}
                    {c.classes.map((cl) => cl.name).join(" / ") || "Classless"}
                  </p>
                </div>
              </Link>
              <button
                className="vault__card-retire btn"
                disabled={retiring === c.id}
                onClick={() => handleRetire(c.id, !c.isRetired)}
              >
                {c.isRetired ? "Unretire" : "Retire"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
