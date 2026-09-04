---
id: 2026-09-04-001-T05
title: "Sandboxed tool registry"
plan-id: 2026-09-04-001
unit: U4
tier: deep
status: not-started
priority: P0
dependencies: [2026-09-04-001-T03]
files:
  create:
    - agent/src/tools/registry.ts
    - agent/src/tools/fs.ts
    - agent/src/tools/shell.ts
  modify: []
  test:
    - agent/tests/tools.test.ts
estimated-effort: "5 hours"
timestamp: 2026-09-04T22:00Z
---

# Sandboxed tool registry

## Goal
Let the model act on the workspace only through validated, allow-listed tools whose results feed back into the loop. Every rejection must be returned as a structured `tool_result` error, never thrown out of the loop.

## Acceptance Criterion
`read_file`, `write_file`, and `list_files` are confined to the output directory and `run_command` accepts only an allow-listed set of npm scripts, with every rejection returned to the model as a structured `tool_result` error rather than thrown out of the loop.

## Steps
1. **Red — Write the failing test:** add `agent/tests/tools.test.ts` asserting: (a) traversal: `write_file("../../../etc/passwd")` -> rejected, nothing written; (b) outside root: `read_file` of a reference-tree absolute path -> rejected; (c) shell allow-list: `rm -rf .` -> rejected; `typecheck` -> executed; (d) unknown tool name -> error listing available tools; (e) oversized write above per-file byte cap -> rejected with reason. Run and confirm failure (tools don't exist yet).
2. **Green — Implement:** create `agent/src/tools/registry.ts` (tool dispatch, allow-list, error-as-result contract), `agent/src/tools/fs.ts` (`read_file`, `write_file`, `list_files` with path sandboxing), `agent/src/tools/shell.ts` (`run_command` with npm script allow-list).
3. **Refactor:** ensure all rejections produce structured `tool_result` errors (not thrown exceptions); verify the per-file byte cap is configurable; confirm the allow-list is exhaustive.

## Test Scenarios
- Traversal: `write_file("../../../etc/passwd")` -> rejected, nothing written
- Outside root: `read_file` of a reference-tree absolute path -> rejected
- Shell allow-list: `rm -rf .` -> rejected; `typecheck` -> executed
- Unknown tool name -> error listing available tools
- Oversized write above the per-file byte cap -> rejected with reason

## Acceptance Criteria
- [ ] read_file, write_file, list_files confined to output dir and run_command accepts only allow-listed npm scripts, with rejections returned as structured tool_result errors

## Dependencies
- 2026-09-04-001-T03: LLM adapter must define the tool-call/tool-result types that the registry consumes and produces

## Notes
- Inspired by pi SDK's narrow tool allow-lists and `excludeTools` pattern (prior art, not a dependency).
- The `run_command` allow-list is restricted to the boilerplate's npm scripts (`typecheck`, `test`, `build`, etc.).
- Per-file byte cap prevents model from emitting excessively large files.
