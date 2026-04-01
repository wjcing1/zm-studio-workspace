# Projects AI Mobile Sheet Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep the existing Projects AI trigger and panel footprint, but rebuild the panel interior into a GPT mobile-style chat sheet with true streaming replies and auto-collapsing starter prompts.

**Architecture:** Preserve the current `projects.html` shell and `/api/chat` endpoint, but refactor the assistant markup and state flow around a fixed header, scrollable message timeline, and fixed composer. Extend `/api/chat` with an opt-in streaming mode so the Projects page can render incrementally without breaking the current JSON contract used elsewhere.

**Tech Stack:** Static HTML, vanilla JavaScript modules, CSS, Node HTTP server, OpenAI-compatible MiniMax API, Node and Playwright verification scripts

---

### Task 1: Lock the refreshed Projects AI sheet structure in tests

**Files:**
- Modify: `tests/verify-projects-ai-ui.mjs`
- Modify: `tests/run-all.mjs`

**Step 1: Write the failing test**

Extend the Projects AI UI regression so it expects:
- a dedicated sheet body container for the timeline
- a composer footer region
- starter prompts to have a collapsible wrapper hook
- the script to include a starter-visibility state hook

**Step 2: Run test to verify it fails**

Run: `node tests/verify-projects-ai-ui.mjs`
Expected: FAIL because the current Projects AI panel does not expose the new GPT-style sheet markers.

**Step 3: Write minimal implementation**

No implementation in this task.

**Step 4: Run test to verify it still fails for the expected reasons**

Run: `node tests/verify-projects-ai-ui.mjs`
Expected: FAIL with missing Projects AI sheet marker messages.

### Task 2: Lock the streaming chat API contract in tests

**Files:**
- Modify: `tests/verify-chat-api.mjs`
- Modify: `tests/run-all.mjs`

**Step 1: Write the failing test**

Extend the chat API contract test so it expects:
- JSON mode without `MINIMAX_API_KEY` still returns `503`
- stream mode without `MINIMAX_API_KEY` also returns `503`
- the stream-mode error still explains `MINIMAX_API_KEY`

**Step 2: Run test to verify it fails**

Run: `node tests/verify-chat-api.mjs`
Expected: FAIL because `/api/chat` does not yet support the new stream option.

**Step 3: Write minimal implementation**

No implementation in this task.

**Step 4: Run test to verify it still fails for the expected reasons**

Run: `node tests/verify-chat-api.mjs`
Expected: FAIL with a missing stream-mode contract failure.

### Task 3: Lock the streaming Projects AI behavior in tests

**Files:**
- Create: `tests/verify-projects-ai-streaming.mjs`
- Modify: `tests/run-all.mjs`

**Step 1: Write the failing test**

Create a browser behavior regression that expects:
- sending the first user message hides the starter region
- the pending assistant bubble is created immediately
- assistant text appears incrementally while the response is still in flight

Use a deterministic local stub mode in the server so the stream can be tested without relying on the upstream model.

**Step 2: Run test to verify it fails**

Run: `node tests/verify-projects-ai-streaming.mjs`
Expected: FAIL because the current Projects assistant waits for a full JSON reply and does not auto-hide the starters.

**Step 3: Write minimal implementation**

No implementation in this task.

**Step 4: Run test to verify it still fails for the expected reasons**

Run: `node tests/verify-projects-ai-streaming.mjs`
Expected: FAIL with non-streaming or starter-visibility failures.

### Task 4: Implement the Projects AI sheet layout refresh

**Files:**
- Modify: `projects.html`
- Modify: `styles/projects.css`
- Modify: `scripts/projects-page.js`
- Test: `tests/verify-projects-ai-ui.mjs`
- Test: `tests/verify-projects-ai-scroll.mjs`
- Test: `tests/verify-projects-ai-scroll-behavior.mjs`

**Step 1: Write the failing test**

Use the failing regression from Task 1 as the guardrail.

**Step 2: Run test to verify it fails**

Run: `node tests/verify-projects-ai-ui.mjs`
Expected: FAIL before the sheet-layout refresh is applied.

**Step 3: Write minimal implementation**

Implement:
- GPT mobile-style internal sheet structure
- fixed header and footer regions
- scrollable timeline region
- collapsible starter area
- stable auto-scroll behavior inside the panel

**Step 4: Run test to verify it passes**

Run: `node tests/verify-projects-ai-ui.mjs`
Expected: PASS

### Task 5: Implement streaming `/api/chat` support and client consumption

**Files:**
- Modify: `server.mjs`
- Modify: `scripts/projects-page.js`
- Test: `tests/verify-chat-api.mjs`
- Test: `tests/verify-projects-ai-streaming.mjs`

**Step 1: Write the failing test**

Use the failing regressions from Task 2 and Task 3 as the guardrails.

**Step 2: Run tests to verify they fail**

Run: `node tests/verify-chat-api.mjs && node tests/verify-projects-ai-streaming.mjs`
Expected: FAIL before the server and client gain streaming support.

**Step 3: Write minimal implementation**

Implement:
- optional stream mode in `POST /api/chat`
- a deterministic local streaming stub for automated tests
- frontend stream reader for Projects AI
- partial-content preservation and error reporting
- auto-hide starter prompts after the first send

**Step 4: Run tests to verify they pass**

Run: `node tests/verify-chat-api.mjs && node tests/verify-projects-ai-streaming.mjs`
Expected: PASS

### Task 6: Run final verification

**Files:**
- Modify: `projects.html`
- Modify: `styles/projects.css`
- Modify: `scripts/projects-page.js`
- Modify: `server.mjs`
- Modify: `tests/verify-projects-ai-ui.mjs`
- Modify: `tests/verify-chat-api.mjs`
- Create: `tests/verify-projects-ai-streaming.mjs`
- Modify: `tests/verify-projects-ai-scroll.mjs`
- Modify: `tests/verify-projects-ai-scroll-behavior.mjs`
- Modify: `tests/run-all.mjs`
- Create: `docs/plans/2026-04-01-projects-ai-mobile-sheet-design.md`
- Create: `docs/plans/2026-04-01-projects-ai-mobile-sheet.md`

**Step 1: Run targeted verification**

Run: `node tests/verify-projects-ai-ui.mjs && node tests/verify-chat-api.mjs && node tests/verify-projects-ai-streaming.mjs && node tests/verify-projects-ai-scroll.mjs && node tests/verify-projects-ai-scroll-behavior.mjs && node tests/verify-projects-ai-shortcut.mjs`
Expected: PASS

**Step 2: Run broader regression coverage**

Run: `node tests/run-all.mjs`
Expected: PASS

**Step 3: Review diff**

Run: `git diff -- projects.html styles/projects.css scripts/projects-page.js server.mjs tests/verify-projects-ai-ui.mjs tests/verify-chat-api.mjs tests/verify-projects-ai-streaming.mjs tests/verify-projects-ai-scroll.mjs tests/verify-projects-ai-scroll-behavior.mjs tests/verify-projects-ai-shortcut.mjs tests/run-all.mjs docs/plans/2026-04-01-projects-ai-mobile-sheet-design.md docs/plans/2026-04-01-projects-ai-mobile-sheet.md`
Expected: Diff shows only the approved Projects AI streaming and mobile-sheet interaction refresh.
