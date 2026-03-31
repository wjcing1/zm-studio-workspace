# User Core Experience Flow Design

## Goal

Create a presentation-ready user core experience flowchart that explains how ZM Studio turns project entry, canvas thinking, AI collaboration, and accumulated context into one continuous experience.

## Audience

- Founders and internal team members who need a crisp product narrative
- External partners or clients who need to quickly understand the product value
- Future product planning conversations that need one stable story baseline

## Recommended Diagram Structure

Use a `main journey + supporting capabilities` layout.

Why this format:

- It keeps the user story easy to follow in a presentation.
- It still exposes the product moat behind the journey instead of making the product look like a simple whiteboard.
- It maps well to the current repository and capability workbook.

## Main Journey

The approved mainline is:

1. `开屏进入`
2. `进入项目总览 / 项目台账`
3. `打开某个项目画布`
4. `在画布中组织信息与方案`
5. `调用 AI Copilot 共创和改板`
6. `团队共同推进`
7. `沉淀项目记忆与快照`
8. `下一次继续推进决策与交付`

## Supporting Capability Rails

The diagram should attach these supporting rails to the main journey:

- `项目数据与资产数据`
- `实时协同`
- `长期记忆与持久化`

These rails are not the story by themselves, but they make the main journey believable and differentiated.

## Source Alignment

The flow should stay grounded in the current product and docs:

- splash entry via `index.html` -> `开屏动画.html`
- project navigation and ledger via `projects.html`
- project-linked spatial work via `workspace.html`
- AI board collaboration via the workspace assistant flow
- realtime collaboration and persistence via the current collaboration and board snapshot architecture
- long-term memory via the existing workspace long-term memory v1 design

## Messaging Principle

This diagram should communicate one core sentence:

`用户不是在不同工具之间跳转，而是在一个连续空间里进入项目、整理信息、与 AI 和团队共同推进，并把上下文持续沉淀下来。`

## Final Diagram Direction

The final artifact should be a standalone markdown file with:

- one Mermaid flowchart
- a one-line positioning statement
- short presenter notes that explain how to narrate the chart in a meeting
