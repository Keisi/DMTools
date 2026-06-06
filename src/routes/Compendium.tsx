import { useEffect, useState, type CSSProperties } from "react";
import { reference } from "../api/endpoints";
import "./Compendium.css";

type Tab = "spells" | "items" | "races" | "classes";

const TABS: { key: Tab; label: string }[] = [
  { key: "spells", label: "Spells" },
  { key: "items", label: "Items" },
  { key: "races", label: "Races" },
  { key: "classes", label: "Classes" },
];

const LOADERS: Record<Tab, () => Promise<{ id: string; name: string }[]>> = {
  spells: reference.spells,
  items: reference.items,
  races: reference.races,
  classes: reference.classes,
};

/** Reference-data browser. Loads each catalog from the open reference routes. */
export default function Compendium() {
  const [tab, setTab] = useState<Tab>("spells");
  const [rows, setRows] = useState<{ id: string; name: string }[] | null>(null);
  // The tab `rows` currently holds data for; while it lags `tab` we're loading.
  const [loadedTab, setLoadedTab] = useState<Tab | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    let active = true;
    const settle = (r: { id: string; name: string }[]) => {
      if (!active) return;
      setRows(r);
      setLoadedTab(tab);
    };
    LOADERS[tab]()
      .then(settle)
      .catch(() => settle([]));
    return () => {
      active = false;
    };
  }, [tab]);

  const loading = loadedTab !== tab;
  const shown = (rows ?? []).filter((r) =>
    r.name.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div className="container compendium">
      <h1>Compendium</h1>
      <div className="compendium__tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={
              "compendium__tab" + (tab === t.key ? " compendium__tab--active" : "")
            }
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <input
        className="input compendium__search"
        placeholder={`Search ${tab}...`}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />

      {loading ? (
        <div className="stack">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 40 }} />
          ))}
        </div>
      ) : (
        <ul className="compendium__list stagger">
          {shown.map((r, i) => (
            <li
              key={r.id}
              className="compendium__row"
              style={{ "--stagger-i": Math.min(i, 12) } as CSSProperties}
            >
              {r.name}
            </li>
          ))}
          {shown.length === 0 && (
            <li className="text-faint">Nothing here (is the API running?).</li>
          )}
        </ul>
      )}
    </div>
  );
}
