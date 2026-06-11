import "./DeathSaveTrack.css";

const PIPS = [0, 1, 2];

/**
 * D&D 5e death-save tracker: three success pips + three failure pips.
 * 3 successes ⇒ Stable, 3 failures ⇒ Dead.
 *
 * Interactive when `onChange` is supplied (the DM records each rolled result);
 * read-only otherwise (the player view). Clicking a pip sets the count to that
 * position, or clears it if it's already the highest filled pip.
 */
export default function DeathSaveTrack({
  successes,
  failures,
  onChange,
  compact = false,
}: {
  successes: number;
  failures: number;
  onChange?: (successes: number, failures: number) => void;
  compact?: boolean;
}) {
  const readOnly = !onChange;
  const dead = failures >= 3;
  const stable = successes >= 3;
  const locked = readOnly || dead || stable;

  const setSucc = (i: number) =>
    onChange?.(successes >= i + 1 ? i : i + 1, failures);
  const setFail = (i: number) =>
    onChange?.(successes, failures >= i + 1 ? i : i + 1);

  const Pip = (kind: "succ" | "fail", i: number, on: boolean) => {
    const cls = `dst__pip dst__pip--${kind}${on ? " dst__pip--on" : ""}`;
    const label = `${kind === "succ" ? "Success" : "Failure"} ${i + 1}`;
    return readOnly ? (
      <span key={i} className={cls} role="img" aria-label={on ? label : ""} />
    ) : (
      <button
        key={i}
        type="button"
        className={cls}
        disabled={locked}
        aria-label={label}
        aria-pressed={on}
        onClick={() => (kind === "succ" ? setSucc(i) : setFail(i))}
      />
    );
  };

  return (
    <div className={`dst${compact ? " dst--compact" : ""}`}>
      <div className="dst__row">
        {!compact && <span className="dst__label">Saves</span>}
        <span className="dst__pips">
          {PIPS.map((i) => Pip("succ", i, successes > i))}
        </span>
      </div>
      <div className="dst__row">
        {!compact && <span className="dst__label">Fails</span>}
        <span className="dst__pips">
          {PIPS.map((i) => Pip("fail", i, failures > i))}
        </span>
      </div>
      {dead ? (
        <span className="dst__status dst__status--dead">Dead</span>
      ) : stable ? (
        <span className="dst__status dst__status--stable">Stable</span>
      ) : null}
    </div>
  );
}
