# Topbar Nav Minimal Design

**Date:** 2026-03-27

## Goal

Simplify the top navigation so the three primary destinations read as plain links on the right edge, with the current page indicated only by brighter text and icon color.

## Approved Direction

The user selected the most minimal option:

- Remove the outer pill or bubble treatment around the nav group.
- Remove any filled active-state bubble behind individual nav items.
- Keep state change feedback limited to color and brightness changes.

## Visual Behavior

- The brand stays on the left.
- The three page links remain right-aligned.
- Inactive links stay muted.
- Hovered and active links brighten without background fill.
- Transition behavior should feel lighter than the current pill-based treatment and avoid motion-heavy emphasis.

## Scope

- Modify shared topbar navigation styles only.
- Update the shell verification test to reflect the simplified appearance.
- Do not change page structure or navigation destinations.
