# Sonnet-agent spec — consume INCOMING #29 / #30 (actionable parts)

**Repo:** `C:\Users\keisi\source\repos\Personal\DMTools-Frontend` (frontend only — never touch the backend repo `..\DMTool`).
**Source:** `INCOMING-FROM-BACKEND.md` #29 + #30 (2026-06-14).
**Gates:** `npm run build` (tsc -b must be 0 errors) **and** `npm run lint` are authoritative. Do NOT commit or push
(push = prod deploy; Kevin pushes). Author re-verifies after.

## Background — what needs NOTHING (do not touch)
- **#29 (High Elf cantrip DC/attack now server-computed):** the sheet already renders `s.saveDc` conditionally
  (`CharacterSheetView.tsx:685-686`) and shows nothing when null. The now-non-null value displays automatically;
  the null-branch must stay for genuinely ambiguous multiclass cantrips. **No code change.**
- **#30 §E — the 6 advantage/disadvantage StatusEffects:** they arrive via the existing `/api/statuseffects`
  catalog and flow through the already-rendered `rollAdvantages[]` path (`sheetTips.ts`, `CharacterSheetView.tsx`).
  `RollTarget`/`AdvantageState` are already modeled (`types.ts:142/161`). **No code change** — they just appear,
  including in the EncounterView status-effect palette.

---

## PART 1 (REQUIRED) — `attacksPerAction` on CharacterResponse + sheet display

### 1a. `src/api/types.ts`
`CharacterResponse` has `equippedWeapons` (L998) then `weaponAttacks` (L999). Insert between them, matching the
backend placement:
```ts
  // Total attacks per Attack action (Extra Attack). Integer, default 1; server-derived as the MAX
  // across multiclass classes (never a sum — RAW: Extra Attack doesn't stack). INCOMING #30.
  attacksPerAction: number;
```
(Type it as required `number` to match the contract. The render guard below stays defensive so a
not-yet-redeployed prod backend that omits it doesn't break.)

### 1b. `src/routes/CharacterSheetView.tsx` — pass it into `AttacksBlock`
- At the render site (L168), add the prop:
  ```tsx
  <AttacksBlock attacks={c.weaponAttacks} attacksPerAction={c.attacksPerAction} modByName={modByName} prof={prof} />
  ```
- In the `AttacksBlock` signature (L301-309) add the prop + type:
  ```ts
  function AttacksBlock({ attacks, attacksPerAction, modByName, prof }: {
    attacks: WeaponAttackResponse[];
    attacksPerAction: number;
    modByName: Map<string, number>;
    prof: number;
  }) {
  ```
- Render a small line under the `<h3>Attacks</h3>` title (after the `<hr className="rule" />` at L315), shown only
  when there's more than one attack. Use a defensive guard so an absent value (prod-before-deploy) renders nothing:
  ```tsx
  {(attacksPerAction ?? 1) > 1 && (
    <p className="sheet__note">Extra Attack — {attacksPerAction} attacks per Attack action.</p>
  )}
  ```
  Use whatever the file's existing small-note / muted-text class is (grep for an existing `sheet__note` /
  `sheet__hint` / similar in this file; reuse it rather than inventing a class — co-located CSS references tokens
  only). If none exists, a plain `<p>` is acceptable; do not add hardcoded colors.

> Scope note: `attacksPerAction` is on `CharacterResponse` (the sheet), not `CombatantResponse` — do **not** try to
> add it to the EncounterView combatant cards.

---

## PART 2 (OPTIONAL — implement only if Kevin says) — POST /advantage convenience endpoint + DM button

> **Redundancy heads-up:** the 6 advantage/disadvantage effects already appear in the EncounterView status-effect
> palette (loaded from `/api/statuseffects`), so a DM can already grant them with the existing control. This part
> only adds a *second*, GUID-free path. Low marginal value — confirm Kevin wants it before building.

### 2a. `src/api/types.ts` — request type (none exists; `types.ts:883-894` are response types)
```ts
// POST .../advantage — convenience grant of a situational advantage/disadvantage token (INCOMING #30).
export interface GrantAdvantageRequest {
  target: RollTarget;        // 0=AttackRoll, 1=SavingThrow, 2=AbilityCheck (IncomingAttackRoll=3 NOT supported)
  state: AdvantageState;     // 1=Advantage, 2=Disadvantage (Cancelled=3 invalid)
  rounds?: number;           // default 1; 1–1000
}
```

### 2b. `src/api/endpoints.ts` — mirror `addCombatantStatusEffect` (L358-367)
Add to the same `campaigns` group, right after `removeCombatantStatusEffect`:
```ts
  grantAdvantage: (
    campaignId: string,
    encounterId: string,
    combatantId: string,
    body: GrantAdvantageRequest,
  ) =>
    api.post<EncounterResponse>(
      `/api/campaigns/${campaignId}/encounters/${encounterId}/combatants/${combatantId}/advantage`,
      body,
    ),
```

### 2c. `src/routes/EncounterView.tsx` — DM control
Mirror `handleAddStatusEffect` (L641-665): add a `handleGrantAdvantage(c, target, state, rounds)` that calls
`applyUpdate(await campaigns.grantAdvantage(campaignId, encounterId, c.id, { target, state, rounds }))` inside the
same `setBusyCombatant`/try/catch/finally shape (ApiError → `setError`). Surface it as a compact DM-only control
near the existing status-effect palette trigger (DM-only, same gating as the other combatant-write controls). Keep
copy schedule-neutral. Do not duplicate the palette — a single small "Advantage / Disadvantage" affordance is enough.

---

## Verify (in order)
1. `npm run build` → tsc -b 0 errors.
2. `npm run lint` → clean (no unused imports — e.g. if Part 2 isn't done, don't add `GrantAdvantageRequest`).
3. oby: `oby brief` each touched file before editing; `oby verify --files "src/api/types.ts,src/routes/CharacterSheetView.tsx"`
   after (aim delta 0). oby's build step false-negatives here — npm is the real gate.
4. (Optional, nice-to-have) live check of the Extra Attack line on a Fighter L5+ sheet via the project's spectral
   batch recipe (CLAUDE.md) — only if a local backend with #30 is running. Don't force it; report if you can't.

## Out of scope / do NOT
- No backend repo edits, no migrations.
- Don't touch the #29 sheet rendering or the status-effect palette for the 6 new effects (already work).
- No commit / push / INCOMING / handoff edits.
- Part 2 is optional — if not greenlit, do Part 1 only and leave no dead code.

## Report back
Per-file diff (concise), exact `npm run build` + `npm run lint` verdicts, and whether Part 2 was included. Flag any
deviation or anything that didn't converge.
