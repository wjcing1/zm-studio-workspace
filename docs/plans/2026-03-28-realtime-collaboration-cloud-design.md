# Realtime Collaboration and Cloud Persistence Design

## Goal

Move the current single-user workspace from browser-local persistence to a cloud-ready collaboration architecture that supports realtime multi-user editing, durable board storage, and future workspace-level permissions.

## Current Context

- Board content is currently bootstrapped from `studio-data.mjs`.
- User edits are persisted client-side through `localStorage`.
- The canvas renderer and board model are already normalized around `camera`, `nodes`, `edges`, undo history, and import/export flows.
- The Node server exists today but does not own board state or collaboration contracts.

## Product Direction

- The workspace is expected to evolve into a multi-user collaboration platform.
- Realtime editing is a first-class requirement, not a later enhancement.
- The implementation should start now even if production cloud credentials are not yet available.

## Recommended Architecture

Use a split architecture:

1. `Postgres` for durable business data such as workspaces, memberships, boards, invites, and snapshots.
2. `Yjs + Hocuspocus` for realtime collaborative document synchronization.
3. Object storage for uploaded images and attachments.
4. A server-side board repository interface inside the existing Node app so the current codebase can move away from `localStorage` immediately.

## Why This Approach

- High-frequency spatial edits are a poor fit for plain row-by-row database updates.
- `Yjs` handles concurrent edits, text merges, and multi-user board updates much more gracefully than database subscriptions alone.
- Keeping a repository seam inside the current server lets the product start with a local server-backed implementation while staying compatible with a future Supabase/Postgres backend.

## Data Model

### Durable Business Entities

- `workspace`
- `workspace_member`
- `project`
- `board`
- `board_snapshot`
- `asset`
- `invite`

### Realtime Document Scope

Each `board` owns one collaborative document. That document contains:

- board metadata relevant to rendering
- nodes
- edges
- camera defaults or board-level view metadata when needed

### Ephemeral Presence Scope

The following state should not be persisted as durable board content:

- cursor position
- temporary selections
- active drag state
- typing presence
- assistant hover context

## First Implementation Slice

The first slice in this repository will not attempt to ship full websocket sync. Instead it will establish the cloud-ready foundation:

- collaboration configuration parsing
- a server-side board repository abstraction
- server endpoints for reading and writing board snapshots
- client-side persistence adapters that prefer the server and keep `localStorage` only as cache/fallback
- regression coverage for the new contracts

This gives the app shared ownership of board state and keeps the next realtime step incremental instead of architectural.

## Client Responsibilities

- Keep using the existing board renderer and interaction model.
- Load boards through a persistence adapter rather than directly from `localStorage`.
- Persist board changes through the adapter.
- Keep optional local cache for quick recovery and offline-friendly behavior.
- Prepare for future presence and realtime providers without leaking those details into rendering code.

## Server Responsibilities

- Expose a collaboration configuration payload to the client.
- Expose board load and save endpoints.
- Normalize and validate incoming board payloads with the existing board schema helpers.
- Store server-owned snapshots in a provider-backed repository.
- Stay provider-agnostic so the first local adapter and later cloud adapters share one contract.

## Migration Strategy

- `studio-data.mjs` remains the seed source for initial empty boards.
- Existing `localStorage` boards should be imported into the server-backed store on first successful save or through an explicit migration path.
- After migration, `localStorage` becomes a cache instead of the source of truth.

## Error Handling

- If server-backed collaboration is unavailable, the client should fall back to cached local state without breaking the editor.
- Invalid board payloads should be rejected server-side with clear API errors.
- Missing board records should fall back to seeded board data rather than crashing the workspace.

## Testing Strategy

- Add API-level regression tests for the new collaboration config and board snapshot endpoints.
- Add board repository tests around normalization and persistence behavior.
- Re-run existing workspace page tests to ensure the editor still renders and behaves as before.

## Out of Scope for This Slice

- live cursor rendering
- concurrent text presence UI
- comments, mentions, or notifications
- billing and quota enforcement
- full production Supabase or Hocuspocus deployment wiring
