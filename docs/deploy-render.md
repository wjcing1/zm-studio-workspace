# Render Deployment

## Recommended Topology

- marketing / portfolio site can remain on GitHub Pages
- the actual collaborative app should run on Render
- recommended production split:
  - `www.<your-domain>` -> GitHub Pages
  - `app.<your-domain>` -> Render web service

This project currently assumes a same-origin app runtime:

- `POST /api/chat`
- `POST /api/workspace-assistant`
- `GET/PUT /api/boards/:boardId`
- `POST /api/uploads`
- `GET /api/collaboration/config`
- `WS /api/collaboration/ws/:boardId`

Because of that, the fastest production path is to host the app frontend and backend together on Render.

## Files Added

- `render.yaml`
- `.env.example`

## Render Service Settings

- Runtime: `Node`
- Build Command: `npm install`
- Start Command: `node server.mjs`
- Health Check Path: `/health`

## Persistent Storage

Attach a persistent disk at:

- `/var/data`

The service is configured to persist:

- boards: `/var/data/boards`
- uploads: `/var/data/uploads`
- memory: `/var/data/memory`

## Required Environment Variables

- `MINIMAX_API_KEY`

## Default Environment Variables

- `MINIMAX_BASE_URL=https://api.minimaxi.com/v1`
- `MINIMAX_MODEL=MiniMax-M2.7`
- `COLLAB_MODE=server`
- `COLLAB_PROVIDER=local-file`
- `BOARD_STORE_DIR=/var/data/boards`
- `UPLOAD_STORE_DIR=/var/data/uploads`
- `MEMORY_STORE_DIR=/var/data/memory`

## Deploy Flow

1. Push the repo to GitHub.
2. In Render, create a new Blueprint or Web Service from this repo.
3. Confirm the settings from `render.yaml`.
4. Fill in `MINIMAX_API_KEY`.
5. Attach the disk if Render does not create it automatically from the Blueprint.
6. Deploy.

## Post-Deploy Checks

After the first deploy, verify:

- `GET /health` returns `{ "ok": true }`
- `GET /workspace.html` loads
- `GET /api/collaboration/config` returns server mode
- uploading a file creates nodes successfully
- workspace AI responds
- realtime collaboration works in two tabs

## Notes

- Services with persistent disks do not get zero-downtime deploys on Render.
- If you later want cross-origin frontend hosting, refactor the frontend to use configurable API and WebSocket base URLs instead of same-origin `/api/...`.
