// Completeness banner for the owner's character sheet. Renders the issues from
// GET /api/character/{id}/validate (CharacterValidator on the backend) — the perks
// a character is missing for its level. The create/edit path only validates ceilings,
// so this is the advisory that nudges the owner to fill the gaps. Self-hides when the
// character is complete. Advisory only; the backend's 400s remain the real gate.
import type { CharacterValidationResponse } from "../api/types";
import { ValidationSeverity } from "../api/types";
import "./ValidationBanner.css";

// Severity → display tag + ordering (errors first — they are the most actionable).
const SEVERITY_META: Record<ValidationSeverity, { label: string; cls: string; rank: number }> = {
  [ValidationSeverity.Error]: { label: "Missing", cls: "error", rank: 0 },
  [ValidationSeverity.Warning]: { label: "Incomplete", cls: "warning", rank: 1 },
  [ValidationSeverity.Info]: { label: "Note", cls: "info", rank: 2 },
};

export default function ValidationBanner({
  validation,
}: {
  validation: CharacterValidationResponse | null;
}) {
  if (!validation || validation.issues.length === 0) return null;

  const issues = [...validation.issues].sort(
    (a, b) => SEVERITY_META[a.severity].rank - SEVERITY_META[b.severity].rank,
  );
  const hasError = issues.some((i) => i.severity === ValidationSeverity.Error);

  return (
    <div className={`valbanner valbanner--${hasError ? "error" : "warning"}`} role="status">
      <p className="valbanner__title">
        {hasError
          ? "This character is missing perks for its level"
          : "This character may be under-built for its level"}
      </p>
      <ul className="valbanner__list">
        {issues.map((issue, i) => (
          <li
            key={i}
            className={`valbanner__item valbanner__item--${SEVERITY_META[issue.severity].cls}`}
          >
            <span className="valbanner__tag">{SEVERITY_META[issue.severity].label}</span>
            <span className="valbanner__msg">{issue.message}</span>
          </li>
        ))}
      </ul>
      <p className="valbanner__hint">
        Use <strong>Level Up</strong> or <strong>Edit</strong> to add what's missing.
      </p>
    </div>
  );
}
