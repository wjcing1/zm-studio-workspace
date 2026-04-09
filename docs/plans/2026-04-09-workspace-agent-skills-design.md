# Workspace Agent Skills Design

**Date:** 2026-04-09

## Goal

Let the online Workspace Agent use repo-owned skills that stay compatible with the current Codex or Claude Code `SKILL.md` format, starting with `architectural_prompt_architect`.

## Product Direction

- Skills must run on the hosted app, so the server cannot depend on a developer's local `~/.codex/skills`.
- The app should still speak the same skill format the team already uses, so moving a skill into the Workspace Agent should mostly mean copying its `SKILL.md` into the repo and adding a thin adapter only when needed.
- Skills must not bloat every Workspace AI request. The assistant should keep a lightweight catalog in the base system prompt and only inject detailed skill content when a skill is explicitly requested or strongly implied by the message or canvas context.

## Scope For This Iteration

- Add a repo-owned `workspace-skills/` catalog that stores skills in compatible `SKILL.md` format.
- Mirror `architectural_prompt_architect` into that catalog.
- Add a server-side loader that reads skill frontmatter, descriptions, headings, and lightweight adapter metadata.
- Always advertise enabled skills in the Workspace Agent system prompt as a compact capability table.
- Support explicit invocation with `@architectural_prompt_architect`.
- Support implicit activation through adapter triggers.
- Expose the available Workspace Agent skills through `/api/studio-data`.

## Non-Goals For This Iteration

- No local-home skill loading on Render or other hosted environments.
- No executor-backed skill runtime for script-heavy skills.
- No full admin console yet.
- No per-user skill assignment yet.

## Architecture

### Repo-Owned Skill Catalog

Each workspace skill lives under `workspace-skills/<skill-id>/`.

Required files:

- `SKILL.md`

Optional files:

- `workspace-adapter.json`
- `resources/*`

`SKILL.md` remains the source of truth for the skill's name, description, and behavioral instructions. The adapter file only carries Workspace-Agent-specific metadata such as aliases, trigger keywords, default enabled state, and which sections are safe to inject into the model prompt.

### Two-Stage Prompt Loading

Every Workspace AI request gets:

1. A compact skill catalog summary in the system prompt with:
   - skill id
   - display name
   - description
   - aliases
2. Zero or more detailed skill blocks, but only when a skill is activated.

Activation happens when:

- the user explicitly mentions `@skill-id` or an alias
- the user message matches configured triggers
- the board context matches configured triggers

### Prompt Injection Rules

Detailed skill injection uses only selected sections from the skill file. The first version of `architectural_prompt_architect` should inject:

- `Overview`
- `When to Use`
- `Mandatory Check`
- `Narrative Intent Gate`
- `Physics Consistency Gate`
- `Output Policy`

This preserves the current Workspace Agent contract. The model still must return:

```json
{"reply":"...","operations":[]}
```

The skill changes how the assistant reasons, not how the API speaks.

### Compatibility Model

Three compatibility modes keep the catalog extensible:

- `prompt-safe`
  Use directly with section injection.
- `prompt-safe-with-resources`
  Inject selected sections plus a small adapter-approved resource subset.
- `executor-required`
  Expose only the catalog entry for now. Full execution comes later.

This allows future skills such as OSM analysis to appear in the catalog before the hosted app has the heavy backend needed to fully run them.

### Data Exposure

`/api/studio-data` should return Workspace Agent skill metadata so the frontend can show what is available without shipping full skill documents to the browser.

The first shape can be:

```json
{
  "assistant": {
    "greeting": "...",
    "starters": [],
    "skills": [
      {
        "id": "architectural_prompt_architect",
        "name": "architectural_prompt_architect",
        "description": "...",
        "aliases": ["architectural-prompt-architect"],
        "defaultEnabled": true
      }
    ]
  }
}
```

## Testing Strategy

- Add a skill-loader regression test that proves repo-owned `SKILL.md` files can be parsed and activated by explicit mention and by trigger phrase.
- Extend `/api/studio-data` verification to ensure skills are exposed to the frontend.
- Keep existing Workspace AI API tests green to prove the core contract still holds.

## Follow-Up After This Iteration

- Workspace-level enable or disable overrides in SQLite
- Frontend skill toggles in the Workspace AI panel
- Resource-aware section injection for heavier prompt skills
- Executor-backed support for tool or script heavy skills
