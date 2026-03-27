# Task Plan: Refactor the workspace into a deployable Web App shell

## Goal
Rename the legacy `222.html` page into a maintainable multi-page Web App, split page-specific code into separate files, and add the first deployment-ready Web App shell for public employee access.

## Current Phase
Phase 5

## Phases
### Phase 1: Requirements & Discovery
- [x] Understand user intent
- [x] Identify constraints and requirements
- [x] Document findings in findings.md
- **Status:** complete

### Phase 2: Planning & Structure
- [x] Define target page structure and new file naming
- [x] Add regression checks for renamed pages and Web App assets
- [x] Document decisions with rationale
- **Status:** complete

### Phase 3: Implementation
- [x] Rename `222.html` into a real workspace page
- [x] Split canvas, projects, and assets into separate pages and scripts
- [x] Add Web App shell files and shared styles/scripts
- **Status:** complete

### Phase 4: Testing & Verification
- [x] Verify renamed paths, split pages, and Web App markers
- [x] Re-run UI and API checks
- [x] Fix any issues found
- **Status:** complete

### Phase 5: Delivery
- [x] Review all output files
- [x] Ensure deployment notes are clear
- [x] Deliver updated structure to user
- **Status:** complete

## Key Questions
1. What page names best describe the internal tool once it is no longer a throwaway `222.html` file?
2. How can the current single-page shell be split without losing shared data or existing interactions?
3. What minimum Web App shell is worth shipping now before auth exists?

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Rename the legacy main page to `workspace.html` | Gives the primary canvas page a stable, descriptive path for public deployment |
| Split the old single-page shell into `workspace.html`, `projects.html`, and `assets.html` | Matches the existing navigation model while making each page easier to maintain |
| Keep shared data in modules and shared styles/scripts | Avoids cloning business logic across pages while still separating page responsibilities |
| Add a minimal Web App shell now | Public employee access benefits from installability and offline basics even before login exists |
| Keep the current Node server | It already serves static pages and `/api/chat`, so it is the fastest route to deployment |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| Playwright CLI socket collisions during project-route verification | 1 | Replaced that verification with Chrome headless DOM inspection for the route target |

## Notes
- Keep the current Node server instead of introducing a new frontend framework
- Favor file names and routes that still make sense once login and deployment are added
