# Findings & Decisions

## Requirements
- The user wants the final `222` version to run.
- The workspace only contains static files: `111.html`, `222.html`, and `index.html`.
- A local runnable result is more useful than a source-only file.
- The user wants projects and canvas to be structurally linked, so opening a project should lead to that project's own board.

## Research Findings
- `222.html` starts with `import React...` and contains JSX components, so it is not a valid static HTML document.
- `index.html` is already a plain runnable HTML page, which shows this workspace expects static delivery rather than a bundled React app.
- The final page references Tailwind-style utility classes and `lucide-react`, which will not work in a raw `.html` file without a React build setup or runtime transform.
- The OpenAI docs MCP server was not available in this session, so official OpenAI docs had to be checked through the web fallback instead.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Rebuild `222.html` as a self-contained HTML page | Fastest path to a reliable runnable result in this workspace |
| Verify with a browser after the rewrite | Confirms the page really renders, not just that the file exists |
| Implement the final page in plain HTML/CSS/JS | Avoids external build tooling while preserving the intended experience |
| Add a root redirect file | Makes `http://127.0.0.1:4173/` open the final page immediately |
| Add a Node server with `/api/chat` | Real AI answers require a backend proxy so the key stays off the client |
| Share studio data through `studio-data.mjs` | Keeps the page UI and the AI context synchronized |
| Introduce overview and per-project canvas boards | Preserves one canvas renderer while making projects directly navigable |
| Keep AI prompt data separate from canvas layout data | Prevents project-board internals from bloating the OpenAI request context |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| `222.html` is mislabeled source code instead of HTML | Use it as a design/spec and convert it into real HTML/CSS/JS |
| `Wireframe Models` asset card collapsed in the assets view | Fixed the card sizing so it no longer depends on the raw image aspect ratio, and replaced the broken image URL |
| AI chat needed to answer project and location questions safely | Added a server proxy, shared project metadata, and a right-side assistant panel |
| Projects and canvas were visually separate systems | Added project-linked boards, canvas breadcrumb/context UI, and per-project navigation from the ledger |

## Resources
- `/Users/jiachenwang/Desktop/ai工作室/222.html`
- `/Users/jiachenwang/Desktop/ai工作室/index.html`
- `/Users/jiachenwang/Desktop/ai工作室/tests/verify-222.mjs`
- `/Users/jiachenwang/Desktop/ai工作室/app.js`
- `/Users/jiachenwang/Desktop/ai工作室/server.mjs`
- `/Users/jiachenwang/Desktop/ai工作室/studio-data.mjs`
- `/Users/jiachenwang/Desktop/ai工作室/docs/plans/2026-03-26-assets-ai-chat-design.md`
- `/Users/jiachenwang/Desktop/ai工作室/docs/plans/2026-03-26-assets-ai-chat.md`

## Visual/Browser Findings
- Browser snapshot of `http://127.0.0.1:4173/222.html` shows raw source text starting with `import React...` rendered on the page instead of the intended UI.
- The current browser failure is not a JavaScript crash; it is the browser interpreting JSX source as text/html content.
- After the rewrite, browser snapshot shows the intended UI shell: `zm studio` header, `Canvas / Projects / Assets` navigation, the canvas cards, and the data views.
- Final browser verification shows no console errors after adding a favicon data URL.
- The initial `Assets` screenshot showed `Wireframe Models` collapsing into a thin strip; measured card height was `24px` with `48px` of content.
- Root cause was twofold: the card height followed the image too closely, and the `Wireframe Models` image URL returned `404`.
- Final `Assets` screenshot shows all six cards rendered at stable heights with working imagery.
- After the AI feature was added, the `Assets` page renders as a two-column layout with a right-side assistant panel, starter prompts, a message history, and a composer.
- Triggering a starter prompt without `OPENAI_API_KEY` now returns a controlled in-UI error message rather than breaking the page.
- Final browser verification shows `PRJ-002` opens `Dark Matter E-commerce` inside the canvas view, displays Milan metadata, renders four connection paths, and returns cleanly to `Studio Overview`.

---
*Update this file after every 2 view/browser/search operations*
*This prevents visual information from being lost*
