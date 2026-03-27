# Findings & Decisions

## Requirements
- The user wants the project to evolve into a Web App for employees, reachable over the public internet.
- The user wants the legacy `222.html` name replaced with a real page name.
- The user wants the current monolithic page structure split so each primary page has its own code.
- Login is planned for a later phase, so this refactor should prepare for future auth instead of implementing it now.

## Research Findings
- The current app still keeps canvas, projects, and assets inside one large HTML shell plus one large client script.
- The current splash flow points into `222.html`, so renaming the main page requires updating the splash target too.
- There is currently no `manifest`, `service worker`, install prompt, or mobile Web App metadata in the project.
- The current Node server is already sufficient for static assets plus `/api/chat`, so a framework switch is unnecessary for this phase.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Rename the main app shell to `workspace.html` | Replaces placeholder naming with a route that can survive deployment |
| Split the experience into `workspace.html`, `projects.html`, and `assets.html` | Aligns code ownership with the current navigation model |
| Add shared modules for data and formatting helpers | Keeps page-specific scripts smaller and easier to maintain |
| Add shared CSS plus page-specific CSS | Prevents duplicated base styling while keeping page layout concerns isolated |
| Add a minimal Web App shell during the refactor | Avoids another structural pass right before deployment |
| Keep a redirect shim for `222.html` if needed | Helps avoid breaking older local links during the rename |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| The app is outgrowing the original single-page `222.html` structure | Move to named pages with shared modules instead of continuing to expand the monolith |
| Playwright CLI socket reuse made one browser test flaky | Switched the project-route verification to a Chrome headless DOM dump instead of the session-based CLI |

## Resources
- `/Users/jiachenwang/Desktop/ai工作室/222.html`
- `/Users/jiachenwang/Desktop/ai工作室/开屏动画.html`
- `/Users/jiachenwang/Desktop/ai工作室/app.js`
- `/Users/jiachenwang/Desktop/ai工作室/server.mjs`
- `/Users/jiachenwang/Desktop/ai工作室/studio-data.mjs`
- `/Users/jiachenwang/Desktop/ai工作室/tests`

## Visual/Browser Findings
- The current app already behaves like three separate areas: workspace canvas, projects ledger, and assets with assistant.
- That natural separation makes the page split low-risk compared with inventing a brand-new routing model.
- After the refactor, the dedicated `workspace.html?project=PRJ-002` route renders `Dark Matter E-commerce`, Milan metadata, and connection paths as expected.

---
*Update this file after every 2 view/browser/search operations*
*This prevents visual information from being lost*
