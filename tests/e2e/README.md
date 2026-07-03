# E2E browser tests (bond-test)

Browser smoke test for the **deployed** frontend (`https://keisi.github.io/DMTools/`), run with
[`bond-test`](https://github.com/Bond-Software/bondkit) — a headless, Playwright-based browser runner.

## Suites
- `dmtools-smoke.bond-test.json` — login (seed account) → client-side nav → vault renders → Compendium
  search filters (319 spells → 1 on "fireball") → asserts **0 console errors** throughout. Navigates by
  clicking in-app nav links (client-side routing) rather than deep-link opens, to avoid the GitHub Pages
  `404.html` SPA-fallback status.
- `dmtools-encounter-widgets.bond-test.json` — drives the EncounterView / CampaignDetail widgets the smoke
  never reaches, **self-cleaning** (creates a `ZZ-BONDTEST widgets` campaign, then deletes it at the end):
  login → create campaign → **quick (no-session) encounter** (asserts the optional-session picker defaults
  to "quick encounter") → **bulk-add an NPC with Qty=3** → asserts rows `Goblin 1/2/3` → **Roll unset**
  → asserts every initiative input now has a value → **Export recap** (asserts the "Recap exported." toast)
  → **delete the campaign via its inline two-click confirm** (which is both the delete-confirm test and the
  fixture cleanup). Asserts **0 console errors** throughout. If a run aborts mid-flow it may leave a
  `ZZ-BONDTEST` campaign on prod — delete it via the UI or `DELETE /api/campaigns/{id}` with a
  `dungeonmaster` JWT.
- `dmtools-validation-banner.bond-test.json` — drives `ValidationBanner.tsx` on the character sheet,
  **self-cleaning**: login → create a `ZZ-VALIDATE Fighter` (level 4, no subclass/fighting-style/ASI spent)
  via a direct `POST /api/character` (an `eval` step using `fetch` + the JWT from `localStorage` — the
  10-step CharacterBuilder wizard is brittle to drive and creation is permissive about completeness, so this
  exercises the banner itself, not the wizard) → navigate away and back to force the Vault to refetch → open
  the new character's sheet → assert the banner's exact headline + the Error line (subclass) + the two
  Warning lines (fighting style, ability score improvement) match the backend `CharacterValidator` messages
  verbatim → **delete the character via the same API-eval approach** and assert it's gone from the Vault.
  Navigates by clicking in-app nav (client-side routing) to avoid the GitHub Pages 404.html status. Asserts
  **0 console errors** throughout. The committed copy keeps the `<SEED_PASSWORD>` placeholder — same
  substitution rule as the other two suites. Race/class/stat ids are hardcoded seeded SRD guids (Human,
  Fighter, the 6 default stats) — the seed is stable, so hardcoding is acceptable.

## Credentials — fill in before running (NOT committed)
This repo is **public**, so the seed password is **not** stored here. Before running, replace the
`<SEED_PASSWORD>` placeholder in the suite with the seeded `dungeonmaster` account's password (the one in
the backend's seed baseline — ask the maintainer / see the private `.env`). bond-test suites are static
JSON with **no env-var interpolation**, so the placeholder must be substituted locally. Do **not** commit
the real value back.

All three suites use the same seed `dungeonmaster` account and the same `<SEED_PASSWORD>` substitution rule below.

## Run
```bash
# from the DMTools-Frontend repo root, after substituting <SEED_PASSWORD> locally:
bond-test test run tests/e2e/dmtools-smoke.bond-test.json --out report.json
bond-test test run tests/e2e/dmtools-encounter-widgets.bond-test.json --out report.json
bond-test test run tests/e2e/dmtools-validation-banner.bond-test.json --out report.json
# exits 0 if every step passes, 1 if any fails
```

> The binary is not on PATH in this environment — run via node:
> `node "$HOME/.bondkit/lib/packages/test/bin/bond-test.mjs" test run <suite> --out report.json`. Substitute
> the password into a throwaway copy (`sed 's/<SEED_PASSWORD>/…/' <suite> > suite.local.json`) and run that —
> never write the real password back into the committed file (this repo is public).

Override the target without editing the suite:
```bash
bond-test test run tests/e2e/dmtools-smoke.bond-test.json --base-url http://localhost:5173/
```

A scaffold for a fresh page can be generated with `bond-test test generate --url <URL>`.
