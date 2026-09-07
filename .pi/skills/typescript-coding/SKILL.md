---
name: typescript-coding
description: Use when implementing, refactoring, or reviewing TypeScript code in this project.
---

# TypeScript Coding

Follow the existing project style before introducing new abstractions.

## Workflow

1. Inspect nearby code before editing.
2. Keep changes scoped to the user request.
3. Prefer existing registry, runtime, and agent interfaces.
4. Run `npm.cmd run build` after TypeScript edits.
5. Mention any files that were already modified before the task.

## Project Conventions

- Runtime orchestration belongs in `src/runtime`.
- Agent behavior belongs in `src/agents`.
- Shared domain types belong in `src/types.ts`.
- Dynamically loaded tools live in `src/tools`.
- Dynamically loaded skills live under `.pi/skills`, `.agents/skills`, or `skills`.
