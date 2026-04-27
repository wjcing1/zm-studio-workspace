# Workspace Long-Term Memory V1 Design

## Goal

Add a minimal long-term memory layer to the workspace AI copilot so it can remember durable project and board context across requests without adding a new frontend management surface.

## Product Scope

This V1 only applies to the workspace assistant exposed through `/api/workspace-assistant`.

Included:

- `project`-scoped memory
- `board`-scoped memory
- server-side retrieval before the model call
- server-side extraction and persistence after the model response
- local-file persistence that matches the current board snapshot architecture

Excluded:

- asset-page memory
- user/team memory
- vector search
- memory management UI
- delete / pin / edit controls
- comments, mentions, or notification workflows

## Current System Constraints

- The workspace assistant sends the current conversation plus board/focus context from the browser to `/api/workspace-assistant`.
- The server normalizes that context, builds a single system prompt, and calls OpenAI.
- Board persistence already uses a local-file store, so a local-file memory store will fit the existing deployment model.

## V1 Approach

V1 uses a `memory-store` plus a `workspace-memory` helper module.

Flow:

1. The browser includes `projectId` in the workspace assistant request when available.
2. The server loads relevant `project` and `board` memories before the model call.
3. The server injects a short `Long-term memory` section into the workspace system prompt.
4. After the model returns, the server heuristically extracts durable memory candidates from the latest user message and workspace scope.
5. The server upserts those memory items into the local-file memory store.

This keeps the implementation small, deterministic, and testable without introducing another model call or an embeddings dependency.

## Memory Model

Each memory item is stored as structured JSON:

```json
{
  "id": "mem_xxx",
  "scopeType": "project",
  "scopeId": "PRJ-001",
  "memoryType": "preference",
  "summary": "Default to concise milestone-oriented board summaries for this project.",
  "facts": [
    "Prefer concise milestone-oriented summaries"
  ],
  "tags": ["default", "summary"],
  "sourceKind": "chat",
  "sourceRef": "board:PRJ-001",
  "confidence": 0.84,
  "lastUsedAt": "2026-03-30T12:00:00.000Z",
  "createdAt": "2026-03-30T12:00:00.000Z",
  "updatedAt": "2026-03-30T12:00:00.000Z"
}
```

V1 memory types:

- `preference`
- `constraint`
- `decision`
- `fact`

## Extraction Strategy

V1 extraction is heuristic, not agentic.

We only persist memories when the latest user message strongly suggests durability, for example:

- `记住`
- `以后`
- `默认`
- `本项目`
- `不要`
- `不能`
- `优先`
- `保持`
- `always`
- `default`
- `remember`
- `prefer`

This reduces false positives and avoids turning ordinary chat into noisy memory.

## Retrieval Strategy

Memories are ranked using a simple weighted score:

- exact scope match
- `project` and `board` scopes only
- keyword overlap between the latest user message and the memory summary/facts/tags
- recency bonus

The server injects only the top few memories into the prompt.

## Prompt Integration

The workspace system prompt keeps its existing board-editing contract and adds a short memory block before the live workspace context.

Structure:

1. assistant rules
2. long-term memory
3. workspace context

The response contract remains unchanged:

```json
{"reply":"...","operations":[]}
```

## Persistence Layout

Add a new `.data/memory/` directory beside `.data/boards/`.

Suggested file layout:

- `.data/memory/project__PRJ-001.json`
- `.data/memory/board__overview.json`

Each file stores:

```json
{
  "scopeType": "project",
  "scopeId": "PRJ-001",
  "items": []
}
```

## Risks

- Heuristic extraction may miss some useful memories.
- Over-aggressive extraction may store noisy preferences.
- Prompt bloat could hurt response quality if too many memories are injected.

Mitigations:

- only extract from strong durability cues
- cap injected memories
- keep summaries short
- keep the data model structured so V2 can add editing and embeddings later

## V1 Success Criteria

- The workspace assistant can recall previously stored project/board preferences across requests.
- Memory survives server restarts because it is persisted on disk.
- The assistant prompt remains compatible with existing board-edit operations.
- New memory behavior is covered by focused regression tests.
