# Assets Masonry Feed Design

## Goal

Refactor the `assets` page from grouped project sections into a continuous visual feed that feels closer to Xiaohongshu Web or Pinterest, while preserving repository-backed search, project linkage, and hidden metadata for AI/search.

## Current Baseline

The page currently has a strong repository-backed data flow:

- browser pages load assets through `/api/studio-data` with static JSON fallback
- the `assets` dataset already carries `projectId`, `groupName`, `actionLabel`, `searchText`, and hidden `meta`
- the main UI groups cards by project, then by asset group

This works structurally, but the visual behavior is still archive-like and sectioned rather than scrollable, image-led, and discovery-oriented.

## Approved Direction

The user approved a full-page continuous waterfall layout instead of preserving project sections.

That means:

- no large project headers in the main feed
- all cards flow in one continuous masonry-style stream
- project identity remains visible at card level through a compact pill or caption
- hidden metadata remains invisible in the UI and continues to power search

## Options Considered

### 1. CSS columns masonry feed

Use a single feed container with CSS columns so cards stack vertically with varying heights.

Pros:

- closest visual match to Xiaohongshu/Pinterest web feeds
- minimal runtime logic
- easy to keep responsive

Cons:

- DOM order flows top-to-bottom per column rather than left-to-right rows
- exact cross-column alignment is less controllable

### 2. JavaScript-calculated masonry grid

Measure card heights and place items into computed rows or columns.

Pros:

- more precise placement control
- easier to fine-tune feature-card spans

Cons:

- more complex and brittle than needed
- introduces more moving parts for a page that should stay static-friendly

### 3. Hybrid editorial layout

Use a few hero cards first, then a masonry stream below.

Pros:

- strong visual impact
- good for featured renders

Cons:

- feels less like a continuous discovery feed
- adds extra layout rules before the larger content-import pass

## Recommended Approach

Use **CSS columns masonry feed**.

This best matches the desired product feeling while staying compatible with the current repository-backed architecture and static fallback build. It also avoids adding JS-heavy layout code before the upcoming large-scale asset ingestion pass.

## UI Design

### Feed Structure

- Replace project section wrappers with one continuous `asset-feed`
- Each card becomes an `inline-block` item inside the feed so CSS columns can stack them naturally
- Use responsive column counts so desktop feels Pinterest-like and mobile collapses to one column

### Card Anatomy

Each card keeps:

- image preview
- compact project source pill
- asset title
- source label
- `Open project`
- `Open archive`

Each card drops:

- large section-level project title blocks
- visible group-level wrapping UI

### Visual Direction

- More card-like and editorial, less “admin archive”
- Softer hover lift and lighter chrome around cards
- Card heights vary naturally from image crop and content size
- Featured assets may be visually emphasized, but not through separate layout sections

## Search and Data Behavior

The repository contract does not change:

- `searchText` and `meta` remain hidden fields
- search still matches title, project name, source label, and hidden metadata
- `projectId` still powers `Open project`
- `fileUrl` and `actionLabel` still power the archive action

The UI change is presentation-only on top of the current repository-backed data shape.

## Testing Strategy

Update source-level tests first to lock the new contract:

- renderer should expose a continuous feed container rather than project sections
- CSS should use masonry-style column rules
- cards should still expose project actions and hidden-search behavior

Keep existing repository/API tests intact, because the data model is not changing.

## Risks

### Reading flow

CSS-column masonry reads top-to-bottom within columns rather than row-first. This is acceptable because the page is meant to feel like a discovery feed rather than a structured table.

### Overlay density

If too much metadata stays on every card, the masonry feed will feel heavy. The card overlay should stay concise and rely on search for deeper discovery.

### Future asset volume

This design should scale better to 40-50 cards than large grouped sections, but it may eventually need lazy-loading or pagination if the archive grows much larger.

## Success Criteria

The refactor is successful when:

- the main assets area feels like one continuous masonry feed
- project source remains obvious on every card
- hidden metadata remains search-only
- repository/API/static fallback behavior stays unchanged
