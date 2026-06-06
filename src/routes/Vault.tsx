import { useEffect, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { characters } from "../api/endpoints";
import type { CharacterResponse } from "../api/types";
import { ApiError } from "../api/client";
import "./Vault.css";

export default function Vault() {
  const [list, setList] = useState<CharacterResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="container vault">
      <div className="vault__head">
        <h1>The Vault</h1>
        <Link to="/character/new" className="btn btn--primary">
          + New Character
        </Link>
      </div>
      <hr className="rule" />

      {error && <p className="vault__notice text-faint">{error}</p>}

      {list === null ? (
        <div className="vault__grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton vault__skel" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="vault__empty panel anim-rise-in">
          <p className="text-muted">No heroes yet.</p>
          <Link to="/character/new" className="btn btn--primary">
            Create your first character
          </Link>
        </div>
      ) : (
        <div className="vault__grid stagger">
          {list.map((c, i) => (
            <Link
              key={c.id}
              to={`/character/${c.id}`}
              className="vault__card panel"
              style={{ "--stagger-i": i } as CSSProperties}
            >
              <div className="vault__card-level">{c.level}</div>
              <div className="vault__card-body">
                <h3 className="vault__card-name">{c.name}</h3>
                <p className="text-muted vault__card-meta">
                  {c.race?.name ?? "Unknown race"} ·{" "}
                  {c.classes.map((cl) => cl.name).join(" / ") || "Classless"}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
