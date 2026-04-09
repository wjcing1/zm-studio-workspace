# Workspace Agent Skills Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add repo-owned Workspace Agent skills that stay compatible with the existing `SKILL.md` format and let the Workspace AI explicitly invoke `architectural_prompt_architect`.

**Architecture:** Load repo-owned skills from `workspace-skills/`, inject compact skill summaries into the Workspace Agent system prompt, and inject detailed sections only when a skill is explicitly or implicitly activated. Keep the current `reply + operations` API contract unchanged.

**Tech Stack:** Node.js, better-sqlite3-backed studio repository, server-side prompt composition, browser workspace shell, Node-based verification scripts

---

### Task 1: Add failing tests for skill loading

**Files:**
- Create: `tests/verify-workspace-skill-loader.mjs`
- Modify: `tests/verify-studio-data-api.mjs`
- Modify: `tests/run-all.mjs`

**Step 1: Write the failing tests**

- Verify the repo-owned skill catalog includes `architectural_prompt_architect`
- Verify explicit `@architectural_prompt_architect` activation loads detailed sections
- Verify `/api/studio-data` exposes assistant skill metadata

**Step 2: Run tests to verify they fail**

Run:

```bash
node tests/verify-workspace-skill-loader.mjs
node tests/verify-studio-data-api.mjs
```

Expected:

- missing module or missing skill catalog failures
- missing `assistant.skills` failure in studio data payload

### Task 2: Add repo-owned skill catalog and loader

**Files:**
- Create: `workspace-skills/architectural_prompt_architect/SKILL.md`
- Create: `workspace-skills/architectural_prompt_architect/workspace-adapter.json`
- Create: `workspace-assistant-skills.mjs`
- Test: `tests/verify-workspace-skill-loader.mjs`

**Step 1: Implement the minimal loader**

- Read repo-owned skill directories
- Parse `SKILL.md` frontmatter
- Parse selected headings into section blocks
- Merge adapter metadata
- Expose helpers for catalog summaries and activated skill blocks

**Step 2: Run tests to verify they pass**

Run:

```bash
node tests/verify-workspace-skill-loader.mjs
```

Expected:

- PASS with explicit mention and trigger activation working

### Task 3: Wire skills into the Workspace Assistant

**Files:**
- Modify: `server.mjs`
- Modify: `tests/verify-workspace-ai-api.mjs`
- Test: `tests/verify-workspace-skill-loader.mjs`

**Step 1: Extend prompt composition**

- Add compact catalog summaries to the base Workspace Assistant system prompt
- Detect activated skills from the message stream and workspace context
- Inject detailed skill blocks only when activated

**Step 2: Keep the contract stable**

- Preserve `reply + operations`
- Preserve existing missing-key and streaming behavior

**Step 3: Run tests**

Run:

```bash
node tests/verify-workspace-ai-api.mjs
node tests/verify-workspace-skill-loader.mjs
```

Expected:

- PASS with no Workspace AI API contract regression

### Task 4: Expose skill metadata to the frontend

**Files:**
- Modify: `sqlite-studio-repository.mjs`
- Modify: `tests/verify-studio-data-api.mjs`
- Optionally modify: `scripts/workspace-page.js`

**Step 1: Extend the returned assistant payload**

- Include repo-owned Workspace Agent skill metadata in `assistant.skills`

**Step 2: Run tests**

Run:

```bash
node tests/verify-studio-data-api.mjs
```

Expected:

- PASS with skill metadata available to the browser

### Task 5: Final verification

**Files:**
- Test: `tests/verify-workspace-skill-loader.mjs`
- Test: `tests/verify-studio-data-api.mjs`
- Test: `tests/verify-workspace-ai-api.mjs`
- Test: `tests/verify-workspace-ai-shortcut.mjs`

**Step 1: Run the focused regression suite**

Run:

```bash
node tests/verify-workspace-skill-loader.mjs
node tests/verify-studio-data-api.mjs
node tests/verify-workspace-ai-api.mjs
node tests/verify-workspace-ai-shortcut.mjs
```

Expected:

- all pass

**Step 2: Commit**

```bash
git add docs/plans/2026-04-09-workspace-agent-skills-design.md \
  docs/plans/2026-04-09-workspace-agent-skills.md \
  workspace-skills \
  workspace-assistant-skills.mjs \
  server.mjs \
  sqlite-studio-repository.mjs \
  tests/verify-workspace-skill-loader.mjs \
  tests/verify-studio-data-api.mjs \
  tests/verify-workspace-ai-api.mjs \
  tests/run-all.mjs
git commit -m "Add workspace assistant skill loading"
```
