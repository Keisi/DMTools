# Implementation spec — INCOMING #32: campaign resource + exhaustion setters

**Author:** Kevin's session (planning). **Implementer:** delegated Sonnet agent.
**Source of truth:** `INCOMING-FROM-BACKEND.md` §"INCOMING #32" (lines ~2430–2481). The
backend already shipped + pushed both endpoints (no migration — #074 columns already
existed). This closes the two follow-up requests filed during #31.

> This is a **small, focused** change: it makes the two fields the #31 panel already
> renders **read-only** (class resources, exhaustion) interactive. The panel, types,
> endpoint group, and `applySheet` state-replace plumbing all exist from #31 (commit
> `0793aae`). You are extending, not building.

## 0. Conventions (same as #31 — violate these and the build breaks)
- `tsconfig.app.json`: `erasableSyntaxOnly` + `verbatimModuleSyntax` → **no TS enums**,
  **type-only imports use `import type`**, `noUnusedLocals/Params` on. `tsc -b` must stay green.
- Enums serialize as **numbers**. These two bodies carry only plain numbers.
- **State-replace:** both endpoints return the full `CampaignCharacterSheetResponse`. Route
  every mutation through the panel's existing `mutate(fn)` helper (which calls `applySheet`).
  Never patch a field locally.
- CSS tokens only.

### Verification gates (authoritative, in order)
1. `npm run build` (`tsc -b` + vite) — must be green. **Run from the PowerShell tool** (Windows).
2. `npm run lint` — must be green (PowerShell tool).
3. `oby verify --files "src/api/types.ts,src/api/endpoints.ts,src/components/CampaignCharacterPanel.tsx"`
   — report `delta` (aim 0). oby's build/complete steps are documented false negatives here; gates 1–2 are real.

Do **not** commit/push and do **not** touch any handover doc (`CLAUDE.md`,
`FRONTEND-CONTEXT.md`, `INCOMING-FROM-BACKEND.md`) — the parent session owns the
re-verify, doc sync, and commit. Backend live verification (screenshots) is the parent's job too.

---

## 1. `src/api/types.ts` — two request bodies

In the existing `// ---- Scope B: Per-campaign character state (INCOMING #31 …) ----`
block, after `AddCampaignStatusEffectRequest`, add:

```ts
// PATCH resources/{key} — set a class resource's remaining (INCOMING #32). Server-clamps
// to [0, derived max]; send the absolute target, not a delta. Unknown key for the character → 400.
export interface UpdateCampaignResourceRequest {
  remaining: number;
}

// PATCH exhaustion — set the 5e exhaustion level (INCOMING #32). Validated [0, 6]; direct set.
// Store-only: the backend does NOT derive mechanical penalties, so the embedded `character`
// block is unaffected — render the level as a stepper/badge only.
export interface UpdateCampaignExhaustionRequest {
  level: number;
}
```

## 2. `src/api/endpoints.ts` — two functions on `campaignCharacterState`

Add the two type names to the `import type { … }` block, then add to the
`campaignCharacterState` object (e.g. after `spendInspiration`):

```ts
  updateResource: (
    campaignId: string,
    characterId: string,
    key: string,
    body: UpdateCampaignResourceRequest,
  ) =>
    api.patch<CampaignCharacterSheetResponse>(
      `/api/campaigns/${campaignId}/characters/${characterId}/resources/${encodeURIComponent(key)}`,
      body,
    ),
  updateExhaustion: (
    campaignId: string,
    characterId: string,
    body: UpdateCampaignExhaustionRequest,
  ) =>
    api.patch<CampaignCharacterSheetResponse>(
      `/api/campaigns/${campaignId}/characters/${characterId}/exhaustion`,
      body,
    ),
```

> `encodeURIComponent(key)` matters — keys look like `paladin:lay-on-hands`. (Mirrors the
> #19 combatant `updateCombatantResource`, which already URL-encodes its `resourceKey`.)

## 3. `src/components/CampaignCharacterPanel.tsx` — wire the two controls

### 3a. Two handlers (mirror the existing `handleSlotChange`)
Add near `handleSlotChange`:

```ts
function handleResourceChange(r: CampaignResourceState, delta: number) {
  void mutate(() =>
    campaignCharacterState.updateResource(campaignId, characterId, r.key, {
      remaining: r.remaining + delta,
    }),
  );
}

function handleExhaustionChange(delta: number) {
  if (!sheet) return;
  const level = Math.max(0, Math.min(6, sheet.exhaustionLevel + delta));
  if (level === sheet.exhaustionLevel) return; // no-op at the clamp edges
  void mutate(() =>
    campaignCharacterState.updateExhaustion(campaignId, characterId, { level }),
  );
}
```
(`PipTrack` already disables `−` at 0 and `+` at max, so `handleResourceChange` needs no
extra guard — same as `handleSlotChange`. The server clamps regardless.)

### 3b. Class Resources — flip to interactive (current code at ~L509–535)
In the resources `.map`, change the `PipTrack` from display-only to live:
- `interactive={false}` → `interactive={canManage}`
- `onMinus={() => { /* display-only */ }}` → `onMinus={() => handleResourceChange(r, -1)}`
- `onPlus={()  => { /* display-only */ }}` → `onPlus={()  => handleResourceChange(r, 1)}`
- Update the section comment `{/* Class resources (display-only — no resource-set endpoint in #31) */}`
  to note #32 makes them interactive (DM-or-owner).

> Large pools (e.g. Lay on Hands max 50) use the `remaining/max` numeric fallback with
> `−`/`+` stepping by 1 — identical to the #19 combatant tracker. Per-1 stepping on a big
> pool is intentional parity for now; a bulk "set" input is a possible later enhancement,
> NOT in scope here.

### 3c. Exhaustion — add a stepper (current code at ~L466–481)
Replace the read-only `ccp__exhaustion-row` with a `canManage`-gated stepper around the value:

```tsx
<div className="ccp__exhaustion-row">
  {canManage && (
    <button
      type="button"
      className="ccp__adj"
      disabled={busy || sheet.exhaustionLevel <= 0}
      onClick={() => handleExhaustionChange(-1)}
      aria-label="Reduce exhaustion"
    >
      −
    </button>
  )}
  <span className="ccp__exhaustion-val">{sheet.exhaustionLevel} / 6</span>
  {canManage && (
    <button
      type="button"
      className="ccp__adj"
      disabled={busy || sheet.exhaustionLevel >= 6}
      onClick={() => handleExhaustionChange(1)}
      aria-label="Increase exhaustion"
    >
      +
    </button>
  )}
  {sheet.exhaustionLevel === 0 && <span className="ccp__exhaustion-hint">None</span>}
  <span className="ccp__exhaustion-hint" title="Also reduced by 1 on a Long Rest.">
    (also reduced by Long Rest)
  </span>
</div>
```
Note the `title` text changed — drop the old "There is no manual setter." line.

> **Store-only (per #32):** setting exhaustion does NOT change the `character` block's
> derived numbers (speed/AC/HP/advantage). That is expected backend behavior, not a bug —
> do not try to surface penalties from the level.

## 4. `src/components/CampaignCharacterPanel.css`
The `.ccp__adj` button class already exists (used by `PipTrack`); reuse it for the
exhaustion stepper. Only add CSS if `.ccp__exhaustion-row` needs alignment/gap tweaks for
the new buttons — keep it tokens-only and minimal. Don't restyle existing classes.

---

## 5. Files touched (checklist)
- [ ] `src/api/types.ts` — 2 request interfaces.
- [ ] `src/api/endpoints.ts` — 2 functions + type imports.
- [ ] `src/components/CampaignCharacterPanel.tsx` — 2 handlers, resources interactive, exhaustion stepper.
- [ ] `src/components/CampaignCharacterPanel.css` — only if the exhaustion row needs minor alignment.

**Do NOT touch:** any handover doc, `CombatantPools.*`, `EncounterView.*`, backend files.

## 6. Final report back
Return: files changed; `npm run build` + `npm run lint` pass/fail lines; `oby verify` delta;
any deviations or ambiguities. Your final message is the only thing received — make it self-contained.
