import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { reference } from "../api/endpoints";
import {
  ResistanceKind,
  Size,
  SpellSchool,
  type ClassResponse,
  type ItemResponse,
  type RaceResponse,
  type SpellResponse,
  type SubraceResponse,
} from "../api/types";
import "./Compendium.css";

type Tab = "spells" | "items" | "races" | "classes";
type Row = SpellResponse | ItemResponse | RaceResponse | ClassResponse;

const TABS: { key: Tab; label: string }[] = [
  { key: "spells", label: "Spells" },
  { key: "items", label: "Items" },
  { key: "races", label: "Races" },
  { key: "classes", label: "Classes" },
];

const LOADERS: Record<Tab, () => Promise<Row[]>> = {
  spells: reference.spells,
  items: reference.items,
  races: reference.races,
  classes: reference.classes,
};

const SPELL_SCHOOL_LABEL: Record<number, string> = {
  [SpellSchool.Abjuration]: "Abjuration",
  [SpellSchool.Conjuration]: "Conjuration",
  [SpellSchool.Divination]: "Divination",
  [SpellSchool.Enchantment]: "Enchantment",
  [SpellSchool.Evocation]: "Evocation",
  [SpellSchool.Illusion]: "Illusion",
  [SpellSchool.Necromancy]: "Necromancy",
  [SpellSchool.Transmutation]: "Transmutation",
};
const SIZE_LABEL: Record<number, string> = {
  [Size.Tiny]: "Tiny",
  [Size.Small]: "Small",
  [Size.Medium]: "Medium",
  [Size.Large]: "Large",
  [Size.Huge]: "Huge",
  [Size.Gargantuan]: "Gargantuan",
};
const RESIST_WORD: Record<number, string> = {
  [ResistanceKind.Resistance]: "resistant to",
  [ResistanceKind.Immunity]: "immune to",
  [ResistanceKind.Vulnerability]: "vulnerable to",
};

const spellLevelLabel = (n: number) => (n === 0 ? "Cantrip" : `Level ${n}`);
const fmtMod = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

const byName = (a: Row, b: Row) =>
  (a as { name: string }).name.localeCompare((b as { name: string }).name);

// Split a catalog into labelled sections so a long flat list reads as scannable
// groups: spells by level, items by magic/mundane. Races/classes are small — one
// unlabelled group (rendered without a header). Empty groups are dropped.
function groupRows(
  tab: Tab,
  rows: Row[],
): { key: string; label: string; rows: Row[] }[] {
  if (tab === "spells") {
    const byLevel = new Map<number, SpellResponse[]>();
    for (const s of rows as SpellResponse[]) {
      const arr = byLevel.get(s.level) ?? [];
      arr.push(s);
      byLevel.set(s.level, arr);
    }
    return [...byLevel.keys()]
      .sort((a, b) => a - b)
      .map((lvl) => ({
        key: `lvl-${lvl}`,
        label: lvl === 0 ? "Cantrips" : `Level ${lvl}`,
        rows: byLevel.get(lvl)!.slice().sort(byName),
      }));
  }
  if (tab === "items") {
    const items = rows as ItemResponse[];
    return [
      { key: "equipment", label: "Equipment", rows: items.filter((i) => !i.isMagic) },
      { key: "magic", label: "Magic Items", rows: items.filter((i) => i.isMagic) },
    ]
      .filter((g) => g.rows.length > 0)
      .map((g) => ({ ...g, rows: g.rows.slice().sort(byName) }));
  }
  return [{ key: "all", label: "", rows: rows.slice().sort(byName) }];
}

/** Reference-data browser. Loads each catalog from the open reference routes and
 *  surfaces the per-entry detail the API already returns (not just the name). */
export default function Compendium() {
  const [tab, setTab] = useState<Tab>("spells");
  const [rows, setRows] = useState<Row[] | null>(null);
  // The tab `rows` currently holds data for; while it lags `tab` we're loading.
  const [loadedTab, setLoadedTab] = useState<Tab | null>(null);
  const [filter, setFilter] = useState("");
  // Collapsed group keys (spells by level, items by magic/mundane). Reset per tab.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    const settle = (r: Row[]) => {
      if (!active) return;
      setRows(r);
      setLoadedTab(tab);
      setCollapsed(new Set()); // new tab's data loaded → start fully expanded
    };
    LOADERS[tab]()
      .then(settle)
      .catch(() => settle([]));
    return () => {
      active = false;
    };
  }, [tab]);

  const loading = loadedTab !== tab;
  const q = filter.trim().toLowerCase();
  const shown = (rows ?? []).filter((r) =>
    (r as { name: string }).name.toLowerCase().startsWith(q),
  );
  const groups = loadedTab ? groupRows(loadedTab, shown) : [];
  // While searching, force every group open so matches can't hide behind a collapse.
  const filtering = filter.trim().length > 0;
  const isOpen = (key: string) => filtering || !collapsed.has(key);
  const toggleGroup = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

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
            <div key={i} className="skeleton" style={{ height: 64 }} />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <p className="text-faint">Nothing here (is the API running?).</p>
      ) : (
        <div className="compendium__groups">
          {groups.map((g) => {
            const open = g.label === "" || isOpen(g.key);
            return (
              <section key={g.key} className="compendium__group">
                {g.label !== "" && (
                  <button
                    type="button"
                    className="compendium__group-head"
                    aria-expanded={open}
                    onClick={() => toggleGroup(g.key)}
                  >
                    <span className="compendium__group-chevron">
                      {open ? "▾" : "▸"}
                    </span>
                    {g.label}
                    <span className="compendium__group-count">{g.rows.length}</span>
                  </button>
                )}
                {open && (
                  <ul className="compendium__list stagger">
                    {g.rows.map((r, i) => (
                      <li
                        key={(r as { id: string }).id}
                        className="compendium__row"
                        style={{ "--stagger-i": Math.min(i, 12) } as CSSProperties}
                      >
                        <Entry tab={loadedTab!} row={r} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---- Per-entry detail rendering ----

function Entry({ tab, row }: { tab: Tab; row: Row }) {
  switch (tab) {
    case "spells":
      return <SpellEntry s={row as SpellResponse} />;
    case "items":
      return <ItemEntry it={row as ItemResponse} />;
    case "races":
      return <RaceEntry r={row as RaceResponse} />;
    case "classes":
      return <ClassEntry c={row as ClassResponse} />;
  }
}

function Header({ name, tags }: { name: string; tags: ReactNode[] }) {
  const real = tags.filter(Boolean);
  return (
    <div className="compendium__row-head">
      <span className="compendium__row-name">{name}</span>
      {real.length > 0 && (
        <span className="compendium__tags">
          {real.map((t, i) => (
            <span key={i} className="compendium__tag">
              {t}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}

function Meta({ children }: { children: ReactNode }) {
  return <p className="compendium__row-meta">{children}</p>;
}
function Desc({ text }: { text?: string | null }) {
  if (!text) return null;
  return <p className="compendium__row-desc text-faint">{text}</p>;
}

// Collapsed-by-default entry: the summary (name + tags + meta) stays visible so
// you can still scan action cost / range / "Cantrip" / school at a glance; the
// long description body expands on click. Entries with no body render flat.
function EntryShell({
  summary,
  body,
}: {
  summary: ReactNode;
  body: ReactNode;
}) {
  if (!body) return <>{summary}</>;
  return (
    <details className="compendium__entry">
      <summary className="compendium__entry-head">{summary}</summary>
      <div className="compendium__entry-body">{body}</div>
    </details>
  );
}

function SpellEntry({ s }: { s: SpellResponse }) {
  const meta = [s.castingTime, s.range, s.components, s.duration]
    .filter(Boolean)
    .join(" · ");
  return (
    <EntryShell
      summary={
        <>
          <Header
            name={s.name}
            tags={[
              spellLevelLabel(s.level),
              SPELL_SCHOOL_LABEL[s.school],
              s.concentration ? "Concentration" : null,
              s.ritual ? "Ritual" : null,
            ]}
          />
          {meta && <Meta>{meta}</Meta>}
          {s.classes.length > 0 && <Meta>Classes: {s.classes.join(", ")}</Meta>}
        </>
      }
      body={
        s.description || s.higherLevel ? (
          <>
            <Desc text={s.description} />
            {s.higherLevel && (
              <p className="compendium__row-desc text-faint">
                <strong>At higher levels:</strong> {s.higherLevel}
              </p>
            )}
          </>
        ) : null
      }
    />
  );
}

function ItemEntry({ it }: { it: ItemResponse }) {
  return (
    <EntryShell
      summary={
        <Header
          name={it.name}
          tags={[
            it.category ?? null,
            it.rarity ?? null,
            `${it.cost} gp`,
            `${it.weight} lb`,
            it.requiresAttunement ? "Attunement" : null,
          ]}
        />
      }
      body={it.description ? <Desc text={it.description} /> : null}
    />
  );
}

function RaceEntry({ r }: { r: RaceResponse }) {
  const speeds = [
    `Speed ${r.walkingSpeed} ft`,
    r.swimSpeed > 0 ? `Swim ${r.swimSpeed} ft` : null,
    r.climbSpeed > 0 ? `Climb ${r.climbSpeed} ft` : null,
    r.flySpeed > 0 ? `Fly ${r.flySpeed} ft` : null,
    r.darkvisionRange > 0 ? `Darkvision ${r.darkvisionRange} ft` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const mods = r.abilityModifiers
    .map((m) => `${m.stat} ${fmtMod(m.modifier)}`)
    .join(", ");
  const resists = r.damageResistances
    .map((d) => `${RESIST_WORD[d.kind]} ${d.damageType}`)
    .join(", ");
  const hasBody = r.description || r.traits.length > 0 || r.subraces.length > 0;
  return (
    <EntryShell
      summary={
        <>
          <Header name={r.name} tags={[SIZE_LABEL[r.size]]} />
          {speeds && <Meta>{speeds}</Meta>}
          {mods && <Meta>Ability: {mods}</Meta>}
          {r.languages.length > 0 && (
            <Meta>Languages: {r.languages.map((l) => l.name).join(", ")}</Meta>
          )}
          {resists && <Meta>{resists}</Meta>}
        </>
      }
      body={
        hasBody ? (
          <>
            {r.description && <Desc text={r.description} />}
            {r.traits.length > 0 && (
              <>
                <p className="compendium__body-section">Traits</p>
                <DetailList
                  items={r.traits.map((t) => ({
                    label: t.name,
                    description: t.description,
                  }))}
                />
              </>
            )}
            {r.subraces.length > 0 && (
              <>
                <p className="compendium__body-section">Subraces</p>
                <SubraceList subraces={r.subraces} />
              </>
            )}
          </>
        ) : null
      }
    />
  );
}

function ClassEntry({ c }: { c: ClassResponse }) {
  const hasBody = c.description || c.features.length > 0;
  return (
    <EntryShell
      summary={
        <>
          <Header
            name={c.name}
            tags={[
              `Hit die d${c.hitDie}`,
              c.primaryAbilities.length > 0
                ? `Primary ${c.primaryAbilities.map((a) => a.name).join("/")}`
                : null,
            ]}
          />
          {c.subclasses.length > 0 && (
            <Meta>Subclasses: {c.subclasses.map((s) => s.name).join(", ")}</Meta>
          )}
        </>
      }
      body={
        hasBody ? (
          <>
            {c.description && <Desc text={c.description} />}
            {c.features.length > 0 && (
              <>
                <p className="compendium__body-section">Class Features</p>
                <DetailList
                  items={c.features.map((f) => ({
                    label: `L${f.level} — ${f.name}`,
                    description: f.description,
                  }))}
                />
              </>
            )}
          </>
        ) : null
      }
    />
  );
}

function DetailList({
  items,
}: {
  items: { label: string; description?: string | null }[];
}) {
  return (
    <div className="compendium__detail-list">
      {items.map((item, i) =>
        item.description ? (
          <details key={i} className="compendium__entry">
            <summary className="compendium__entry-head">{item.label}</summary>
            <div className="compendium__entry-body">
              <Desc text={item.description} />
            </div>
          </details>
        ) : (
          <p key={i} className="compendium__row-meta">
            {item.label}
          </p>
        ),
      )}
    </div>
  );
}

function SubraceList({ subraces }: { subraces: SubraceResponse[] }) {
  return (
    <div className="compendium__detail-list">
      {subraces.map((s) => {
        const bonuses = [
          ...s.abilityModifiers.map((m) => `${m.stat} ${fmtMod(m.modifier)}`),
          s.walkingSpeedBonus > 0 ? `+${s.walkingSpeedBonus} ft speed` : null,
          s.bonusHpPerLevel > 0 ? `+${s.bonusHpPerLevel} HP/level` : null,
          s.darkvisionOverride > 0 ? `Darkvision ${s.darkvisionOverride} ft` : null,
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <details key={s.id} className="compendium__entry">
            <summary className="compendium__entry-head">
              <span>{s.name}</span>
              {bonuses && <span className="compendium__row-meta">{bonuses}</span>}
            </summary>
            <div className="compendium__entry-body">
              {s.description && <Desc text={s.description} />}
              {s.traits.length > 0 && (
                <DetailList
                  items={s.traits.map((t) => ({
                    label: t.name,
                    description: t.description,
                  }))}
                />
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}
