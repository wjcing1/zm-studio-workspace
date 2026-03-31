# Workspace Long-Term Memory V1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a pure-backend V1 long-term memory layer for the workspace assistant with local-file persistence, scope-aware retrieval, and heuristic extraction.

**Architecture:** The feature adds a new local-file memory store plus a workspace-memory helper module. The workspace assistant request includes `projectId`, the server retrieves matching memories before the model call, and the server extracts/upserts durable memories after the response without changing the existing reply/operations contract.

**Tech Stack:** Node.js ESM, local JSON persistence, existing MiniMax/OpenAI-compatible chat flow, existing regression-test style scripts.

---

### Task 1: Add failing tests for memory storage and retrieval

**Files:**
- Create: `tests/verify-workspace-memory-store.mjs`
- Create: `tests/verify-workspace-memory-logic.mjs`

**Step 1: Write the failing tests**

- Add a store test that imports `../memory-store.mjs` and verifies:
  - a new scope file is created
  - upsert merges duplicate summaries
  - relevant memories are ranked by scope and keyword overlap
- Add a logic test that imports `../workspace-memory.mjs` and verifies:
  - explicit durable instructions are extracted
  - ordinary chat does not create memories
  - prompt formatting includes a bounded memory block

**Step 2: Run tests to verify they fail**

Run:

```bash
node tests/verify-workspace-memory-store.mjs
node tests/verify-workspace-memory-logic.mjs
```

Expected:

- FAIL because `memory-store.mjs` and `workspace-memory.mjs` do not exist yet

### Task 2: Implement the memory store

**Files:**
- Create: `memory-store.mjs`
- Test: `tests/verify-workspace-memory-store.mjs`

**Step 1: Write the minimal implementation**

- Create a local-file store under `.data/memory`
- Support:
  - `listScopeMemories(scopeType, scopeId)`
  - `upsertMemories(items)`
  - `findRelevantMemories({ scopes, query, limit })`
  - `touchMemories(ids)`

**Step 2: Run the store test**

Run:

```bash
node tests/verify-workspace-memory-store.mjs
```

Expected:

- PASS

### Task 3: Implement workspace memory extraction and prompt helpers

**Files:**
- Create: `workspace-memory.mjs`
- Test: `tests/verify-workspace-memory-logic.mjs`

**Step 1: Write the minimal implementation**

- Add helpers for:
  - scope derivation from workspace context
  - extraction of durable memories from the latest user message
  - prompt formatting for retrieved memories

**Step 2: Run the logic test**

Run:

```bash
node tests/verify-workspace-memory-logic.mjs
```

Expected:

- PASS

### Task 4: Integrate memory retrieval and persistence into the workspace assistant flow

**Files:**
- Modify: `server.mjs`
- Modify: `scripts/workspace-page.js`
- Test: `tests/verify-workspace-memory-logic.mjs`
- Test: `tests/verify-workspace-ai-api.mjs`

**Step 1: Extend the client request**

- Include `projectId` in the workspace assistant request payload when a project canvas is active

**Step 2: Integrate retrieval before the model call**

- Load relevant memories using `projectId` and `board.key`
- Add a bounded long-term-memory section to the workspace system prompt

**Step 3: Integrate persistence after the model response**

- Extract memory candidates from the latest user message and workspace scope
- Upsert them asynchronously/safely in the memory store
- Touch retrieved memory items so recency ranking stays useful

**Step 4: Run focused tests**

Run:

```bash
node tests/verify-workspace-memory-store.mjs
node tests/verify-workspace-memory-logic.mjs
node tests/verify-workspace-ai-api.mjs
```

Expected:

- PASS

### Task 5: Run broader regression coverage

**Files:**
- No code changes
- Test: `tests/verify-board-snapshots-api.mjs`
- Test: `tests/verify-collaboration-config-api.mjs`
- Test: `tests/verify-workspace-board-model.mjs`

**Step 1: Run regression tests**

Run:

```bash
node tests/verify-board-snapshots-api.mjs
node tests/verify-collaboration-config-api.mjs
node tests/verify-workspace-board-model.mjs
```

Expected:

- PASS

### Task 6: Final verification

**Files:**
- Modify: `docs/plans/2026-03-30-workspace-long-term-memory-v1-design.md`
- Modify: `docs/plans/2026-03-30-workspace-long-term-memory-v1.md`

**Step 1: Confirm final scope remains V1**

- No UI
- No embeddings
- No asset-page memory
- No delete/edit flows

**Step 2: Record verification status in the final handoff**

- Report exactly which tests were run
- Report any residual limitations honestly
