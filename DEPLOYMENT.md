# Deployment — DMTools Frontend (MonsterASP.NET)

Production deploy of the Vite + React SPA to **MonsterASP.NET** free hosting (Windows / IIS static
hosting, FTP-only deploy).

- **Live URL:** https://dmtool.runasp.net
- **API it calls:** https://dmtoolapi.runasp.net (see the backend repo's `docs/DEPLOYMENT.md`)

> **Credentials are NOT in this repo.** All FTP secrets live in the `.env` at the personal repos
> root (`../.env`, i.e. `C:\Users\keisi\source\repos\personal\.env`), outside both git working
> trees. This doc references them by variable name only (`FRONTEND_FTP_SERVER`,
> `FRONTEND_FTP_LOGIN`, `FRONTEND_FTP_PASSWORD`). Never commit real secrets.

## Key facts

- **The API base URL is compile-time.** It comes from `VITE_API_BASE` (read in `src/api/client.ts`,
  also drives the SignalR hub URL). It is **baked into the bundle at build time** — to change it you
  must rebuild. For production it must be `https://dmtoolapi.runasp.net` (no trailing slash).
- **Base path must be `/`.** `vite.config.ts` sets `base: process.env.GITHUB_ACTIONS ? "/DMTools/" : "/"`.
  MonsterASP serves from the domain root, so **do NOT set `GITHUB_ACTIONS`** when building — if it
  leaks in, assets resolve under `/DMTools/` and 404 at the root.
- **Client-side routing needs an IIS rewrite.** The app uses `react-router` `BrowserRouter` (HTML5
  history, no basename), so deep-link refreshes (`/vault`, `/campaigns/:id`) 404 on IIS without a
  URL-rewrite fallback to `/index.html`. The repo's `public/staticwebapp.config.json` (Azure SWA)
  and `public/404.html` (GitHub Pages) are **inert on IIS** — the real fallback is `dist/web.config`
  below.

## Procedure

### 1. Build with the production API base

```bash
# Git Bash:
VITE_API_BASE=https://dmtoolapi.runasp.net npm run build
# PowerShell:
#   $env:VITE_API_BASE = "https://dmtoolapi.runasp.net"; npm run build; Remove-Item Env:\VITE_API_BASE
```

Do **not** export `GITHUB_ACTIONS` (keeps `base: "/"`). Output lands in `dist/`.

### 2. Add `dist/web.config` (SPA fallback for IIS)

```xml
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <rule name="SPA fallback" stopProcessing="true">
          <match url=".*" />
          <conditions logicalGrouping="MatchAll">
            <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
            <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
          </conditions>
          <action type="Rewrite" url="/index.html" />
        </rule>
      </rules>
    </rewrite>
    <staticContent>
      <remove fileExtension=".woff2" /><mimeMap fileExtension=".woff2" mimeType="font/woff2" />
      <remove fileExtension=".json" /><mimeMap fileExtension=".json" mimeType="application/json" />
    </staticContent>
  </system.webServer>
</configuration>
```

### 3. Sanity-check the build (before upload)

```bash
grep -oE '(src|href)="[^"]*"' dist/index.html   # asset paths must start with /assets (root, not /DMTools)
grep -rl "dmtoolapi.runasp.net" dist/assets      # prod API base must be baked in
```

### 4. FTP upload

Upload the **contents of `dist/`** (not the folder) into the site web root `/wwwroot`. Credentials:
`FRONTEND_FTP_SERVER` / `FRONTEND_FTP_LOGIN` / `FRONTEND_FTP_PASSWORD` from `../.env`.

```bash
USER="<FRONTEND_FTP_LOGIN>:<FRONTEND_FTP_PASSWORD>"   # from ../.env
BASE="ftp://<FRONTEND_FTP_SERVER>/wwwroot"
cd dist
find . -type f | sed 's|^\./||' | while read -r rel; do
  curl -s --ftp-create-dirs -u "$USER" -T "$rel" "$BASE/$rel"
done
# remove the host's default placeholder so it can't shadow index.html:
curl -s -u "$USER" "$BASE/" -Q "DELE /wwwroot/iisstart.htm"
```

### 5. Verify

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://dmtool.runasp.net/         # 200
curl -s -o /dev/null -w "%{http_code}\n" http://dmtool.runasp.net/vault    # 200 (rewrite -> index.html)
```

In the browser DevTools Network tab, API calls should go to `https://dmtoolapi.runasp.net/api/...`.

## Control-panel step (cannot be done over FTP)

**Enable HTTPS (free Let's Encrypt)** for `dmtool.runasp.net` in the MonsterASP panel. The backend
CORS already allows both the `http` and `https` origins of this domain, so no rebuild is needed
after the cert is issued.

## Notes

- `404.html` and `staticwebapp.config.json` (copied from `public/`) are harmless dead weight on
  IIS — they do nothing here; the `web.config` rewrite is what handles deep links.
- The backend's CORS policy must list this site's origin (`https://dmtool.runasp.net`) — it does
  (set in the API's `appsettings.Production.json`). If you add a custom domain, add it there too.
