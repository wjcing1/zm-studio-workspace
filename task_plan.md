# Task Plan: Run and extend the final `222.html` page

## Goal
Make `222.html` runnable in a browser, fix the assets layout, add a server-backed AI chat panel to the `Digital Assets` page, and link each project to its own dedicated canvas.

## Current Phase
Phase 5

## Phases
### Phase 1: Requirements & Discovery
- [x] Understand user intent
- [x] Identify constraints and requirements
- [x] Document findings in findings.md
- **Status:** complete

### Phase 2: Planning & Structure
- [x] Define technical approach
- [x] Create project structure if needed
- [x] Document decisions with rationale
- **Status:** complete

### Phase 3: Implementation
- [x] Execute the plan step by step
- [x] Write code to files before executing
- [x] Test incrementally
- **Status:** complete

### Phase 4: Testing & Verification
- [x] Verify all requirements met
- [x] Document test results in progress.md
- [x] Fix any issues found
- **Status:** complete

### Phase 5: Delivery
- [x] Review all output files
- [x] Ensure deliverables are complete
- [x] Deliver to user
- **Status:** complete

## Key Questions
1. Is `222.html` a real HTML file or JSX/React source saved with the wrong extension?
2. What is the smallest change that preserves the intended UI while making it runnable without a build system?

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Treat `222.html` as the user's final target page | The user explicitly pointed to `222` as the final version to run |
| Rebuild `222.html` as self-contained HTML/CSS/JS | The workspace is a static-file setup, so removing the build requirement is the fastest reliable path |
| Add `index.html` redirect to `222.html` | Makes the local server root usable immediately |
| Move shared portfolio knowledge into a module | Keeps the frontend renderer and AI backend on the same source of truth |
| Replace the temporary static server with a Node app server | Required to expose `/api/chat` without exposing the OpenAI key in the browser |
| Split canvas state into overview and per-project boards | Lets the project ledger and canvas stay structurally connected instead of acting as separate pages |
| Persist camera and nodes per board in `localStorage` | Preserves edits independently for the overview canvas and each project canvas |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| `222.html` is JSX, not runnable HTML | 1 | Convert it into a browser-runnable document instead of trying to open it directly |
| Missing `index.html` during exploration | 1 | Ignore it as reference material, then create a redirecting root entry as part of delivery |
| MCP OpenAI docs server was unavailable | 1 | Fell back to official OpenAI docs on `developers.openai.com` and `platform.openai.com` |

## Notes
- Avoid replacing unrelated files unless necessary
- Prefer a self-contained page over introducing a full React toolchain
