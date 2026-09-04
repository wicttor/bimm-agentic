---
slug: spawn-real-cli-entry-in-tests
type: workflow
domain: testing
priority: normal
applicability:
  current_project: 8
  general: 7
tags: [testing, cli, node, vitest]
confidence: high
summary: Test the real CLI process contract by spawning `node agent/src/index.ts` via execFileSync with a scrubbed env (Node >=23.6 type-stripping, no tsx), pairing it with an isDirectExecution() guard so importing run() never auto-executes main.
created_at: 2026-09-04T23:17:00Z
updated_at: 2026-09-04T23:17:00Z
source:
  type: candidate
  reference: 2026-09-04-002-review#4
  extracted_at: 2026-09-04T23:17:00Z
related: [dry-run-zero-network-proven-by-injection-spies, test-config-isolation-behaviorally-not-regex]
---

# Spawn the Real CLI Entry in Tests (No tsx, No New npm Scripts)

## Convention

Agent CLI tests assert the **process** contract — real exit codes and real stderr — by spawning the
actual entry file:

```ts
execFileSync("node", [cliPath, "--spec", SPEC_REL, "--dry-run"], {
  cwd: repoRoot,
  env: { PATH: process.env.PATH },          // scrubbed: no API keys leak from the developer shell
  encoding: "utf8",
});
```

- Run TypeScript sources directly with `node` (Node ≥ 23.6 type-stripping; repo floor documented
  as ≥ 20.6 for `--env-file`, verified on v26) — **no `tsx`, no new devDependency, no `package.json`
  script churn** just to make a file spawnable.
- Every entry-point module keeps its auto-run behind an `isDirectExecution()` guard
  (`import.meta.url === pathToFileURL(resolve(process.argv[1])).href`) so vitest can `import`
  `run(argv, deps)` without executing `main`.
- Catch non-zero exits around `execFileSync` and inspect `e.status` / `e.stderr` — a thrown
  `ERR_..._failed` with `status: 2` *is* the assertion passing.

## Why

In-process tests (spy-injected `run()`) prove logic; they cannot prove `process.exitCode`, flag
parsing from a real argv, or that the file is runnable at all as the deliverable advertises
(`README.md` promises a CLI). The previous task's AC literally says "exits with an error". Keeping
this spawn-based avoids smuggling test-only scripts into the shipped package.json.

## How

1. Write the testable core as `export async function run(argv, deps): Promise<exitCode>` with
   injectable `env`/`createProvider`/`log`/`error`.
2. Bottom of the entry file: `if (isDirectExecution()) { run(...).then(c => process.exitCode = c) }`.
3. In the test, `spawnCli(args, env)` helper wraps execFileSync and normalizes
   `{status, stdout, stderr}`; assert on status and message substrings (`ANTHROPIC_API_KEY`,
   `dry-run`).
4. Keep spawned env minimal (`PATH` only + what the test sets) so machine state can't flip results.

## Related Learnings

- `dry-run-zero-network-proven-by-injection-spies` — the in-process half of the same suite.
- `test-config-isolation-behaviorally-not-regex` — same behavior-over-text philosophy; `wiring.test.ts`
  set the execSync precedent.

## Source

Task 2026-09-04-001-T02 (commit `253cdf9`) — `agent/tests/config.test.ts`, "the real CLI entry
point is runnable" block.
