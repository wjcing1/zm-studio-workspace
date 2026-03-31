# Findings

- `scripts/workspace-page.js` re-renders the entire canvas using `innerHTML`, which makes focus-sensitive interactions easy to break if we do not explicitly restore editor focus.
- New text nodes are currently selected after creation, but they are not focused for typing.
- Node ports are only rendered for selected or hovered nodes, but hover changes do not currently force a rerender, so handles are effectively hidden until selection.
- Edge creation works on a narrow synthetic path today, but the saved `toSide` is inferred too simplistically from the source side.
- The closest external interaction reference is not Obsidian app source code. It is a mix of the official Canvas help docs and the `obsidian-advanced-canvas` plugin behavior.
- The git worktree contains unrelated user changes in `.data/boards/overview.json`, `.obsidian/workspace.json`, and `.data/boards/PRJ-002.json`; those files should be left untouched.
- The current board model recognizes `file` only as a compatibility alias that collapses into `image`; there is no first-class `file` node yet.
- Existing workspace rendering already has a legacy `image` card path and a separate `link` card path, so the lowest-risk upgrade is to add `file` beside them instead of replacing `image` immediately.
- The server currently has board/chat APIs and static file serving, but no upload route or body parser for binary attachments.
- The existing static handler can safely serve repo-local files, so storing uploads under `.data/uploads/...` can reuse current retrieval behavior without a second asset server.
