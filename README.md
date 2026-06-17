# DMTool-FrontEnd

Frontend SPA for the **DMTool** D&D 5e Dungeon Master toolkit. Talks to the
headless DMTool JSON API (ASP.NET Core, JWT) over HTTP.

**Vite + React + TypeScript**, plain CSS with design tokens for an easily
retunable look (Fight Club 5e inspired).

## Quick start
```bash
npm install
npm run dev      # http://localhost:5173 — proxies /api to the backend (:3501)
```
Start the DMTool backend (IIS `:3501` or `dotnet run`) for live data.

## Scripts
| Command | Does |
|---|---|
| `npm run dev` | Dev server + HMR + `/api` proxy |
| `npm run build` | Typecheck (`tsc -b`) + production build |
| `npm run preview` | Serve the production build |
| `npm run lint` | ESLint |

## Where things live
- `src/styles/` — `tokens.css` (the visual control panel), `theme.css`,
  `animations.css`. **Retune the whole look from `tokens.css`.**
- `src/routes/` — screens (Login, Vault, CharacterSheet, CharacterBuilder, Compendium).
- `src/api/` — typed HTTP client + endpoint modules.
- `src/auth/` — JWT auth context.

## Deploy (production)
Production hosting is **MonsterASP.NET** (IIS) at https://dmtool.runasp.net. The full
FTP deploy runbook — prod build (`VITE_API_BASE`), the SPA `web.config` rewrite, and the
HTTPS/control-panel steps — is in **`DEPLOYMENT.md`**. (Hosting credentials live in the
`.env` at the personal repos root, outside git.)

See **`FRONTEND-CONTEXT.md`** for the full backend API map, conventions, and gotchas.
