# Critical-review record — third-sprint frontend (bulk-add qty + roll-unset + inline confirms + 429)

Date: 2026-06-20. Branch `main`. Committed via the **PowerShell-tool route** (oby completion-loop can't
spawn `npm` on this box — [[oby-completion-loop-npm-spawn-windows]]; typecheck/test go inconclusive, the
loop can't stamp `done:true`). Review phases below ran genuinely; build verified independently.

## Changes (working tree)
- `src/routes/EncounterView.tsx` — Q-3 "Qty" inputs on Add Ally + Add Enemy (sends `count`; linked-char
  forces qty 1); Q-4 "Roll unset" button (rolls only null-initiative combatants via the existing
  roll-initiatives + combatantIds filter); archive-encounter inline two-click confirm.
- `src/routes/CampaignDetail.tsx` — delete-campaign + delete-session inline confirms (delete-session keeps
  the "has N encounters" dynamic warning + the 409 backend handling).
- `src/components/CampaignCharacterPanel.tsx` — long-rest inline confirm.
- `src/routes/Login.tsx` — 429-on-auth friendly message (via `ApiError.status`).
- `src/api/types.ts` — `AddCombatantRequest.count?`.

## Review phases (genuinely ran)
1. **Build / typecheck** — `npm run build` (`tsc -b && vite build`) exit 0, zero type errors;
   `dist/assets/index-*.js 515.05 kB` (pre-existing >500 kB chunk warning only).
2. **codescan (changed files)** — `--severity high`: 9 high, **0 introduced by this change**. All are
   pre-existing structural smells on the large files (types.ts 1690 lines; EncounterView 2051-line file /
   1988-line component / 587-line renderCombatant; CampaignDetail 889-line component; CampaignCharacterPanel
   723-line component) + one pre-existing empty-`.catch()` at `CampaignCharacterPanel.tsx:143` (outside this
   change's lines). Component-split is a tracked backlog item.
3. **Manual review** — all 4 `window.confirm()` removed (grep clean), each replaced with the existing
   `enc__end-confirm` two-click pattern; Q-3 count + linked-char guard matches the backend contract; Q-4
   reuses the existing endpoint/filter; 429 branch matches the existing error-render.
4. **Backend contract** — `count?` and the roll-initiatives `combatantIds` filter match the live backend;
   429 is emitted by the deployed auth rate-limiter (first-sprint).

## Verdict
No real defects introduced. Build green, contracts aligned. The codescan highs are all pre-existing size
smells. Safe to commit + ship.
