# Progress Log

## 2026-03-29
- Inspected project structure, package manifest, git status, and server implementation.
- Confirmed the app mixes static pages with a Node API server.
- Identified the main GitHub Pages risk: AI/chat endpoints are server-only and need graceful static fallbacks.
- Confirmed no remote repository is configured yet.
- Added regression tests for GitHub Pages compatibility and for generating a deployable `dist/`.
- Implemented `npm run build` to produce a GitHub Pages artifact, `.nojekyll`, and `404.html`.
- Added a GitHub Actions workflow that installs dependencies, builds the static artifact, uploads it, and deploys with `actions/deploy-pages`.
- Ran `npm test` successfully after updating splash-page expectations for versioned module URLs.
