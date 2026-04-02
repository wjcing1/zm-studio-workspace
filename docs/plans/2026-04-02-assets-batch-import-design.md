# Assets Batch Import Design

**Date:** 2026-04-02

## Goal

Expand the repository-backed `assets` feed from a handful of archive previews into a real render library with roughly 40 visual-first cards, while keeping the existing `projects + assets` data model, hidden search metadata, and full-width masonry presentation.

## Approved Direction

Use local compressed preview images for the web experience and keep Drive as the source archive. Organize the new materials by project, but render them in one continuous Pinterest/Xiaohongshu-style feed. Keep tags hidden for AI/search only.

## Content Scope

- Keep the page visual-first: renders, effect images, showroom views, exhibition perspectives
- Exclude tables, lists, product configuration screenshots, and spreadsheet-like covers
- Expand the current feed using these project sources:
  - `PRJ-001` 迪拜2026电梯展
  - `PRJ-003` 草药展
  - `PRJ-004` 舒勇SHOW ROOM
  - `PRJ-005` MIDO 26 - Conant

## Asset Packaging

- Download original images from Google Drive with `gog`
- Convert them to lighter web JPEG previews with `sips`
- Store previews in project folders under `media/assets/<project-slug>/`
- Keep Drive folder/file links in asset records so every card can still jump back to source

## Data Shape

Keep the existing repository contract intact:

- `projects` holds project metadata and archive entry points
- `assets` holds one record per preview image with:
  - `projectId`
  - `groupName`
  - `sourceLabel`
  - `fileUrl`
  - `actionLabel`
  - `searchText`
  - `meta`

Hidden `meta` remains the place for structure useful to AI/search:

- `spaceType`
- `shotType`
- `viewAngle`
- `style`
- `colorMood`
- `materials`
- `keywords`

## Curation Rules

- Prefer 8-10 images per project for the first batch
- Use generic but truthful titles when the archive file names are not descriptive
- Keep metadata conservative when a precise view type cannot be confirmed from file names alone
- Preserve sort order so featured visuals appear earlier in the feed

## Verification

- Repository and API tests should confirm the richer asset pool and new project seed
- Static build should still export the snapshot fallback
- The preview server should continue to render the masonry feed from `/api/studio-data`
