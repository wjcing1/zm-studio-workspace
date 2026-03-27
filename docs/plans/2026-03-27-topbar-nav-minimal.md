# Topbar Nav Minimal Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Simplify the shared top navigation so it uses right-aligned plain links with active-state brightening only.

**Architecture:** Keep the existing HTML markup and route structure intact, and concentrate the change in `styles/shared.css` so all three pages inherit the new nav treatment. Update the shell verification test first, then implement the minimal CSS changes needed to satisfy the approved visual behavior.

**Tech Stack:** Static HTML, shared CSS, Node-based verification script

---

### Task 1: Lock the desired nav appearance in tests

**Files:**
- Modify: `tests/verify-web-app-shell.mjs`

**Step 1: Write the failing test**

Add checks that the shared nav block no longer uses a bubble background, border, blur, or shadow, and that active and hover states do not add filled backgrounds.

**Step 2: Run test to verify it fails**

Run: `node tests/verify-web-app-shell.mjs`
Expected: FAIL on one or more nav-style assertions because the old pill treatment still exists.

**Step 3: Write minimal implementation**

No implementation in this task.

**Step 4: Run test to verify it still fails for the expected reasons**

Run: `node tests/verify-web-app-shell.mjs`
Expected: FAIL with messages specific to the outer bubble and active bubble styling.

### Task 2: Simplify the shared nav styling

**Files:**
- Modify: `styles/shared.css`

**Step 1: Write the failing test**

Use the failing test from Task 1 as the guardrail.

**Step 2: Run test to verify it fails**

Run: `node tests/verify-web-app-shell.mjs`
Expected: FAIL before CSS changes are applied.

**Step 3: Write minimal implementation**

- Remove the outer nav background, border, blur, shadow, and extra padding.
- Remove filled hover and active backgrounds from `.nav-link`.
- Reduce nav-link transitions so the interaction reads as brightening rather than animated motion.

**Step 4: Run test to verify it passes**

Run: `node tests/verify-web-app-shell.mjs`
Expected: PASS

### Task 3: Final verification

**Files:**
- Modify: `tests/verify-web-app-shell.mjs`
- Modify: `styles/shared.css`

**Step 1: Run verification**

Run: `node tests/verify-web-app-shell.mjs`
Expected: PASS with no failures.

**Step 2: Review diff**

Run: `git diff -- styles/shared.css tests/verify-web-app-shell.mjs docs/plans/2026-03-27-topbar-nav-minimal-design.md docs/plans/2026-03-27-topbar-nav-minimal.md`
Expected: Diff shows only the approved nav simplification and documentation additions.
