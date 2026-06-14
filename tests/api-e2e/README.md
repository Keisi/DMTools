# DMTool API end-to-end harness

Pure-HTTP end-to-end tests for the DMTool JSON Web API. No browser, no spectral —
authenticate, drive endpoints with real payloads, assert on responses. Implements
the plan in `projectnotes/api-e2e-test-plan.md`.

Plain Node ES modules (`.mjs`, global `fetch`), **zero dependencies**, off the
`tsc -b` / Vite build path. It is not part of `npm run build` and is never
bundled into the deploy.

## Run

The backend must be live (IIS `http://localhost:3501` or Kestrel
`dotnet run --project DMTool --launch-profile http` on `:5157`).

```bash
node tests/api-e2e/run.mjs                 # all suites
SUITES=A node tests/api-e2e/run.mjs        # just Suite A
SUITES=A,C node tests/api-e2e/run.mjs      # Suites A + C
ONLY=Wizard,Fighter node tests/api-e2e/run.mjs   # restrict Suite A/B to some classes
QUIET=1 node tests/api-e2e/run.mjs         # summary only (suppress per-check lines)
BASE=http://localhost:5157 node tests/api-e2e/run.mjs   # Kestrel
```

Exit code is non-zero if any check FAILs. A machine-readable report is written to
`tests/api-e2e/last-run.json` (gitignored).

## What it does

- **Suite A — level-up 1→20 for every class.** Creates a level-1 character per
  class and walks it to 20 via `levelup/plan` + `levelup/apply`, asserting each
  level against the class's own declared progression (HP die/average/CON, ASI
  due-levels, subclass offer, spell/cantrip/spellbook deltas, max spell level,
  feature-choice offers) plus terminal checks and the level-cap rejection.
  Includes targeted negatives (out-of-range HP roll, ASI+feat together, ASI
  sum≠2). ~1840 assertions.
- **Suite B — above-level-1 creation.** The **convergence invariant**:
  build-a-character-at-L20 must equal level-up-1→20 for the same choices (HP,
  ability effectives, feature set, spell/feature counts) — proves the create and
  level-up code paths agree. Plus required-choice folding (ASIs, feats, subclass
  at creation), spell-gate negatives (cap / off-list / over-level), multiclass
  creation + prerequisite gate, and the creation negative matrix.
- **Suite C — encounters.** A DM + a second player identity exercise the full
  lifecycle (start / next-turn / round-wrap / prev-turn / end), HP & death saves
  (temp-HP absorption, heal cap, dying vs dead, NPC instant death,
  staying-down/revival reset), status effects & concentration sweeps,
  resources / spell slots / rest, buff roll-modifier surfacing, DM visibility
  flags, the combat log (pagination, DM note, event-type coverage), and the
  authz / guard matrix (null-session 400, cross-campaign session, session-delete
  409, non-member 404, owner-scoping).

## Layout

```
run.mjs                  entry: health gate, auth, preflight, run suites, report, cleanup
lib/client.mjs           fetch wrapper -> { status, ok, body }
lib/report.mjs           PASS / FAIL / FINDING reporter + summary matrix
lib/setup.mjs            register throwaway account, fetch catalogs, build maps + per-class oracle
lib/levelup.mjs          shared L1-create + plan->apply walk + auto-apply choice builder
suites/suite-a-levelup.mjs
suites/suite-b-creation.mjs
suites/suite-c-encounter.mjs
```

## Notes

- **Throwaway accounts.** Each run registers fresh `e2e_*` users (no delete
  endpoint exists, so these accounts accumulate — harmless). It never touches the
  `dungeonmaster` seed data. Every character/campaign it creates is deleted at
  teardown.
- **Findings ≠ failures.** A `FINDING` is documented behavior worth a
  `FRONTEND-REQUEST`, not a bug. Current run surfaces four:
  1. **Wizard spellbook vs prepared-spell cap** — the required spellbook count is
     validated against the prepared cap on `levelup/apply`, so advancing a Wizard
     needs `allowHomebrewSelections`.
  2. **Creation does not enforce earned-ASI completeness** — a Fighter L8 is
     accepted with fewer than its 3 earned ASIs (only `levelup/apply` forces it).
  3. **Creation does not enforce minimum spell counts** — a Wizard L11 is accepted
     with zero spells (only `levelup/apply` forces exact counts).
  4. **No flat-modifier status effect in the catalog** — so the
     "flat folds-in, not double-counted" half of the buffs invariant can't be
     asserted directly (dice + advantage/disadvantage surfacing *is* asserted).
- **Coverage limits.** Only one subclass per class is seeded (subclass *variety*
  is untestable); no Artificer (12 classes). See the plan's §7.
- **Backend 503 / pool recycles.** The IIS pool occasionally recycles mid-run; the
  runner gates on `/api/health` and exits 2 if it's down — just re-run.
