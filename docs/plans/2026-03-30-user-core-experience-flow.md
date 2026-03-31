# User Core Experience Flow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Produce a presentation-ready markdown document containing the approved user core experience flowchart for ZM Studio.

**Architecture:** Keep the final deliverable as a standalone markdown doc in `docs/` so it can be reused in presentations, product reviews, and strategy discussions. Structure the chart as one clear main journey plus supporting capability rails, and keep every node tied to the current repository's real pages and documented capabilities.

**Tech Stack:** Markdown, Mermaid

---

### Task 1: Record the approved flowchart design

**Files:**
- Create: `docs/plans/2026-03-30-user-core-experience-flow-design.md`
- Test: `rg -n "Main Journey|Supporting Capability Rails|Messaging Principle" docs/plans/2026-03-30-user-core-experience-flow-design.md`

**Step 1: Write the design record**

Capture:

- the presentation audience
- the approved `main journey + supporting capabilities` structure
- the exact mainline nodes
- the supporting rails
- the one-sentence product message

**Step 2: Verify the design record exists**

Run: `rg -n "Main Journey|Supporting Capability Rails|Messaging Principle" docs/plans/2026-03-30-user-core-experience-flow-design.md`
Expected: the command prints the matching section headers

### Task 2: Create the presentation-ready flowchart document

**Files:**
- Create: `docs/user-core-experience-flow.md`
- Test: `rg -n "^```mermaid|主线旅程|支撑能力" docs/user-core-experience-flow.md`

**Step 1: Write the final markdown artifact**

Add:

- a short positioning sentence
- one Mermaid chart
- presenter notes for how to explain the chart

**Step 2: Verify the chart markers exist**

Run: `rg -n "^```mermaid|主线旅程|支撑能力" docs/user-core-experience-flow.md`
Expected: the command prints the Mermaid block and the key section names

### Task 3: Verify the final deliverable is easy to find

**Files:**
- Modify: none
- Test: `test -f docs/user-core-experience-flow.md && test -f docs/plans/2026-03-30-user-core-experience-flow-design.md`

**Step 1: Run the verification command**

Run: `test -f docs/user-core-experience-flow.md && test -f docs/plans/2026-03-30-user-core-experience-flow-design.md`
Expected: exit code `0`
