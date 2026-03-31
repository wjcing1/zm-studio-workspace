# Findings

- `package.json` has no build script; only `start`, `dev`, and `test`, all based on `server.mjs`.
- The repository contains static HTML/CSS/JS entry points such as `index.html`, `workspace.html`, `projects.html`, `assets.html`, and `开屏动画.html`.
- `scripts/shared/studio-data-client.js` already falls back to a local static collaboration mode when `/api/collaboration/config` is unavailable.
- `scripts/assets-page.js` still posts directly to `/api/chat`.
- `scripts/workspace-page.js` still posts directly to `/api/workspace-assistant`.
- `git remote -v` is empty, so publishing cannot be completed to GitHub without either creating or connecting a repository.
- `gh auth status` shows an active GitHub CLI login for account `wjcing1`.
- Added a static Pages build via `scripts/build-pages.mjs` plus `.github/workflows/deploy-pages.yml`.
- Updated `manifest.webmanifest`, `sw.js`, and service worker registration to use relative paths so the app works from a GitHub Pages repository subpath.
- AI panels now display a backend-required hint by default and only report a live backend after a successful API response.
