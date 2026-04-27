# Three-Agent Assistant Shell Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Unify Projects, Assets, and Workspace onto one floating GPT-style assistant shell while preserving three distinct agent capabilities and backend contracts.

**Architecture:** Extract the current Projects assistant UI into a shared shell stylesheet and JavaScript helper, then attach page-specific agent adapters for Projects, Assets, and Workspace. Keep `/api/chat` as a shared streaming text route for Projects and Assets with explicit agent scope, while preserving `/api/workspace-assistant` as a dedicated streaming route that can still return final board operations.

**Tech Stack:** Static HTML, vanilla JavaScript modules, shared CSS, Node HTTP server, OpenAI-compatible OpenAI API, Node and Playwright verification scripts

---

### Task 1: Lock the shared shell structure in tests

**Files:**
- Create: `tests/verify-assistant-shell-shared-ui.mjs`
- Modify: `tests/run-all.mjs`

**Step 1: Write the failing test**

Create a shared-shell regression that expects:
- a shared assistant shell stylesheet
- a shared assistant shell JavaScript helper
- Projects, Assets, and Workspace to all load those shared assets

**Step 2: Run test to verify it fails**

Run: `node tests/verify-assistant-shell-shared-ui.mjs`
Expected: FAIL because the shared shell files and references do not exist yet.

**Step 3: Write minimal implementation**

No implementation in this task.

**Step 4: Run test to verify it still fails for the expected reasons**

Run: `node tests/verify-assistant-shell-shared-ui.mjs`
Expected: FAIL with missing shared shell asset messages.

### Task 2: Lock Assets shell parity in tests

**Files:**
- Create: `tests/verify-assets-ai-shell-ui.mjs`
- Create: `tests/verify-assets-ai-shortcut.mjs`
- Create: `tests/verify-assets-ai-streaming.mjs`
- Modify: `tests/run-all.mjs`

**Step 1: Write the failing tests**

Add regressions that expect:
- Assets to expose a floating trigger and hidden assistant sheet
- `Space` to open and focus the Assets assistant
- starter prompts to auto-hide after the first send
- assistant text to stream incrementally through `/api/chat`

**Step 2: Run tests to verify they fail**

Run: `node tests/verify-assets-ai-shell-ui.mjs && node tests/verify-assets-ai-shortcut.mjs && node tests/verify-assets-ai-streaming.mjs`
Expected: FAIL because Assets still uses the old sidebar assistant.

**Step 3: Write minimal implementation**

No implementation in this task.

**Step 4: Run tests to verify they still fail for the expected reasons**

Run: `node tests/verify-assets-ai-shell-ui.mjs && node tests/verify-assets-ai-shortcut.mjs && node tests/verify-assets-ai-streaming.mjs`
Expected: FAIL with missing floating-shell or streaming behavior messages.

### Task 3: Lock Workspace shell parity and preserved capabilities in tests

**Files:**
- Create: `tests/verify-workspace-ai-shell-ui.mjs`
- Create: `tests/verify-workspace-ai-streaming.mjs`
- Create: `tests/verify-workspace-ai-operations-stream.mjs`
- Modify: `tests/run-all.mjs`

**Step 1: Write the failing tests**

Add regressions that expect:
- Workspace to expose the same shell structure as Projects
- Workspace text replies to stream incrementally
- Workspace final streamed payload can still carry and apply board operations

**Step 2: Run tests to verify they fail**

Run: `node tests/verify-workspace-ai-shell-ui.mjs && node tests/verify-workspace-ai-streaming.mjs && node tests/verify-workspace-ai-operations-stream.mjs`
Expected: FAIL because Workspace still uses the older panel layout and non-streaming assistant flow.

**Step 3: Write minimal implementation**

No implementation in this task.

**Step 4: Run tests to verify they still fail for the expected reasons**

Run: `node tests/verify-workspace-ai-shell-ui.mjs && node tests/verify-workspace-ai-streaming.mjs && node tests/verify-workspace-ai-operations-stream.mjs`
Expected: FAIL with missing shell markers or missing streaming-operation behavior.

### Task 4: Extract the shared assistant shell

**Files:**
- Create: `styles/assistant-shell.css`
- Create: `scripts/shared/assistant-shell.js`
- Modify: `projects.html`
- Modify: `assets.html`
- Modify: `workspace.html`
- Test: `tests/verify-assistant-shell-shared-ui.mjs`

**Step 1: Write the failing test**

Use the failing regression from Task 1 as the guardrail.

**Step 2: Run test to verify it fails**

Run: `node tests/verify-assistant-shell-shared-ui.mjs`
Expected: FAIL before the shared shell files and references exist.

**Step 3: Write minimal implementation**

Implement:
- shared shell stylesheet
- shared shell JavaScript helper
- page references to the shared assets
- Projects migration onto the shared shell without changing behavior

**Step 4: Run test to verify it passes**

Run: `node tests/verify-assistant-shell-shared-ui.mjs`
Expected: PASS

### Task 5: Migrate Assets onto the shared shell and streaming flow

**Files:**
- Modify: `assets.html`
- Modify: `styles/assets.css`
- Modify: `scripts/assets-page.js`
- Modify: `server.mjs`
- Test: `tests/verify-assets-ai-shell-ui.mjs`
- Test: `tests/verify-assets-ai-shortcut.mjs`
- Test: `tests/verify-assets-ai-streaming.mjs`

**Step 1: Write the failing tests**

Use the failing regressions from Task 2 as the guardrails.

**Step 2: Run tests to verify they fail**

Run: `node tests/verify-assets-ai-shell-ui.mjs && node tests/verify-assets-ai-shortcut.mjs && node tests/verify-assets-ai-streaming.mjs`
Expected: FAIL before Assets moves to the shared shell.

**Step 3: Write minimal implementation**

Implement:
- Assets floating trigger and GPT-style sheet
- Assets agent adapter using the shared shell
- `/api/chat` agent scope for `"assets"`
- streaming text consumption and starter collapse

**Step 4: Run tests to verify they pass**

Run: `node tests/verify-assets-ai-shell-ui.mjs && node tests/verify-assets-ai-shortcut.mjs && node tests/verify-assets-ai-streaming.mjs`
Expected: PASS

### Task 6: Migrate Workspace onto the shared shell while preserving board operations

**Files:**
- Modify: `workspace.html`
- Modify: `styles/workspace.css`
- Modify: `scripts/workspace-page.js`
- Modify: `server.mjs`
- Test: `tests/verify-workspace-ai-shell-ui.mjs`
- Test: `tests/verify-workspace-ai-streaming.mjs`
- Test: `tests/verify-workspace-ai-operations-stream.mjs`

**Step 1: Write the failing tests**

Use the failing regressions from Task 3 as the guardrails.

**Step 2: Run tests to verify they fail**

Run: `node tests/verify-workspace-ai-shell-ui.mjs && node tests/verify-workspace-ai-streaming.mjs && node tests/verify-workspace-ai-operations-stream.mjs`
Expected: FAIL before Workspace adopts the shared shell and streaming contract.

**Step 3: Write minimal implementation**

Implement:
- Workspace shell markup parity with Projects
- shared shell adapter integration for Workspace
- streaming text contract for `/api/workspace-assistant`
- final done payload carrying normalized operations
- client application of operations after streamed completion

**Step 4: Run tests to verify they pass**

Run: `node tests/verify-workspace-ai-shell-ui.mjs && node tests/verify-workspace-ai-streaming.mjs && node tests/verify-workspace-ai-operations-stream.mjs`
Expected: PASS

### Task 7: Run final verification

**Files:**
- Create: `styles/assistant-shell.css`
- Create: `scripts/shared/assistant-shell.js`
- Modify: `projects.html`
- Modify: `assets.html`
- Modify: `workspace.html`
- Modify: `scripts/projects-page.js`
- Modify: `scripts/assets-page.js`
- Modify: `scripts/workspace-page.js`
- Modify: `styles/projects.css`
- Modify: `styles/assets.css`
- Modify: `styles/workspace.css`
- Modify: `server.mjs`
- Create: `tests/verify-assistant-shell-shared-ui.mjs`
- Create: `tests/verify-assets-ai-shell-ui.mjs`
- Create: `tests/verify-assets-ai-shortcut.mjs`
- Create: `tests/verify-assets-ai-streaming.mjs`
- Create: `tests/verify-workspace-ai-shell-ui.mjs`
- Create: `tests/verify-workspace-ai-streaming.mjs`
- Create: `tests/verify-workspace-ai-operations-stream.mjs`
- Modify: `tests/run-all.mjs`
- Create: `docs/plans/2026-04-01-three-agent-assistant-shell-design.md`
- Create: `docs/plans/2026-04-01-three-agent-assistant-shell.md`

**Step 1: Run targeted verification**

Run: `node tests/verify-assistant-shell-shared-ui.mjs && node tests/verify-projects-ai-ui.mjs && node tests/verify-projects-ai-shortcut.mjs && node tests/verify-projects-ai-streaming.mjs && node tests/verify-assets-ai-shell-ui.mjs && node tests/verify-assets-ai-shortcut.mjs && node tests/verify-assets-ai-streaming.mjs && node tests/verify-workspace-ai-shell-ui.mjs && node tests/verify-workspace-ai-streaming.mjs && node tests/verify-workspace-ai-operations-stream.mjs && node tests/verify-chat-api.mjs && node tests/verify-workspace-ai-api.mjs`
Expected: PASS

**Step 2: Run broader regression coverage**

Run: `node tests/run-all.mjs`
Expected: PASS, or only the documented pre-existing workspace shortcut flake if it remains unresolved and unrelated to the new shell work.

**Step 3: Review diff**

Run: `git diff -- styles/assistant-shell.css scripts/shared/assistant-shell.js projects.html assets.html workspace.html scripts/projects-page.js scripts/assets-page.js scripts/workspace-page.js styles/projects.css styles/assets.css styles/workspace.css server.mjs tests/verify-assistant-shell-shared-ui.mjs tests/verify-assets-ai-shell-ui.mjs tests/verify-assets-ai-shortcut.mjs tests/verify-assets-ai-streaming.mjs tests/verify-workspace-ai-shell-ui.mjs tests/verify-workspace-ai-streaming.mjs tests/verify-workspace-ai-operations-stream.mjs tests/run-all.mjs docs/plans/2026-04-01-three-agent-assistant-shell-design.md docs/plans/2026-04-01-three-agent-assistant-shell.md`
Expected: Diff shows only the approved three-agent shared shell unification work.
