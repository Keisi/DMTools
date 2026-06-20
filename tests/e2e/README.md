# E2E browser tests (bond-test)

Browser smoke test for the **deployed** frontend (`https://keisi.github.io/DMTools/`), run with
[`bond-test`](https://github.com/Bond-Software/bondkit) — a headless, Playwright-based browser runner.

## Suite
- `dmtools-smoke.bond-test.json` — login (seed account) → client-side nav → vault renders → Compendium
  search filters (319 spells → 1 on "fireball") → asserts **0 console errors** throughout. Navigates by
  clicking in-app nav links (client-side routing) rather than deep-link opens, to avoid the GitHub Pages
  `404.html` SPA-fallback status.

## Credentials — fill in before running (NOT committed)
This repo is **public**, so the seed password is **not** stored here. Before running, replace the
`<SEED_PASSWORD>` placeholder in the suite with the seeded `dungeonmaster` account's password (the one in
the backend's seed baseline — ask the maintainer / see the private `.env`). bond-test suites are static
JSON with **no env-var interpolation**, so the placeholder must be substituted locally. Do **not** commit
the real value back.

## Run
```bash
# from the DMTools-Frontend repo root, after substituting <SEED_PASSWORD> locally:
bond-test test run tests/e2e/dmtools-smoke.bond-test.json --out report.json
# exits 0 if every step passes, 1 if any fails
```

Override the target without editing the suite:
```bash
bond-test test run tests/e2e/dmtools-smoke.bond-test.json --base-url http://localhost:5173/
```

A scaffold for a fresh page can be generated with `bond-test test generate --url <URL>`.
