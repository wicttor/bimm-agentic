---
id: 2026-09-05-003-T10
title: "Prove the split offline and retire the one-process loop"
plan-id: 2026-09-05-003
unit: U10
tier: deep
status: not-started
priority: P1
dependencies: [2026-09-05-003-T05, 2026-09-05-003-T06, 2026-09-05-003-T07, 2026-09-05-003-T08, 2026-09-05-003-T09]
files:
  create:
    - agent/tests/pipeline-sessions.test.ts
  modify:
    - agent/tests/pipeline-skills.test.ts
    - agent/tests/generator.test.ts
    - agent/src/generator.ts
  test:
    - agent/tests/pipeline-sessions.test.ts
estimated-effort: "3 hours"
timestamp: 2026-09-05T18:45:00Z
---

# Prove the split offline and retire the one-process loop

## Goal

Until one test file shows plan, execute-per-task, and finish as **separate calls**, the split is a
claim. This is also the change that deletes the loop the pipeline no longer has.

## Acceptance Criterion

Offline with `FakeProvider`, a scripted `GitRunner` and an in-process `SessionLauncher`: the plan stage writes and commits the artifacts, each work session is a separate call committing exactly its own task, a blocked task leaves no modified files and stops the driver, a re-run on a complete list exits 5 with zero provider calls — and `generate()` no longer exists

## Steps

1. **Red — Write the failing test:** create `agent/tests/pipeline-sessions.test.ts`: one `run(["plan","--spec",…])` with a one-reply `FakeProvider` → artifacts and one commit; then `run(["drive","--plan-id",…])` with the launcher calling `run(["work",…])` in-process against the same temp tree → per-task commits whose path lists never overlap, all task files `completed`, the cumulative report reading `N/N` and `complete`, and the executor's request count equal to the task count; then a variant where the second task's `runScript` returns a failing exit → `blocked`, `restoreWrittenPaths` observed for exactly that session's paths, driver exit 4, no further launches; then `run(["work","--plan-id",…])` on the finished list → exit 5 with the provider spy at zero calls. Assert zero network with both the `createProvider` spy and a `fetch` spy. Confirm failures.
2. **Green — Implement:** fix what the proof exposes in the stages — the hand-off ordering, the artifact path set, the exit-code mapping. Then delete `generate()` from `agent/src/generator.ts` and migrate `agent/tests/generator.test.ts` to `executeTask`, rewriting `agent/tests/pipeline-skills.test.ts` to its plan-stage-only half (its skill-provenance assertions move here and stay).
3. **Refactor:** the proof is the documentation of the split — name each `describe` block after the stage it exercises, and keep one `it` per exit code.

## Implementation Notes

### Offline Proof Approach

The offline proof for the split validates that the split algorithm correctly handles:

1. **Planning Phase (Offline)**: Given a workflow plan, generate proof-of-correctness artifacts in a single offline call
2. **Session Distribution**: Distribute N sessions across the split based on proof - each session is a **separate call** with its own commit
3. **Blocked State Handling**: Sessions can enter blocked state and resume correctly - blocked task leaves no modified files
4. **Queue Management**: Verify completion on finished queue (exit 5, zero provider calls)
5. **State Recovery**: Resume blocked sessions without re-planning or provider calls

### Key Design Principles

- **Offline Generation**: All proof artifacts are generated in a single planning phase (`run(["plan","--spec",…])`)
- **Per-Task Commits**: Each work session is a **separate call** (`run(["drive","--plan-id",…])`) that commits exactly its own task files
- **No Path Overlap**: Task file paths across sessions never overlap - each task owns its writes exclusively
- **No Network on Resume**: Re-run on complete list exits 5 with zero provider calls - proof is deterministic
- **generate() Removed**: The old `generate()` method is deleted; migration targets `executeTask` instead

### Test Harness Architecture

```typescript
// FakeProvider: scripted fake that throws when replies run out
interface FakeProvider {
  plan(spec: string): { tasks: Task[], plan: Plan } // 1 reply for plan stage
  drive(planId: string): void // calls SessionLauncher for each task
  getCallCount(): number
}

// Scripted GitRunner: verifies commit messages and file sets
interface ScriptedGitRunner {
  expectCommit(message: string, files: string[]): void
  verifyAllExpectations(): void
}

// In-process SessionLauncher: replaces out-of-process executions
interface SessionLauncher {
  launch(taskId: string, plan: Plan): ExecutionResult // calls run(["work",…]) in-process
}
```

### Expected Artifacts

1. **Plan Stage Output**:
   - Task list with all work items
   - Plan metadata (split factor, dependencies)
   - Commit: "plan: create tasks" with task definitions

2. **Work Stage Output** (per session):
   - Task completion record
   - Modified files (task-specific only)
   - Commit: "work: complete task-<N>" with task file and index

3. **Blocking Behavior**:
   - Blocked task: no modified files, no commit, driver exits 4
   - `restoreWrittenPaths` called for session's paths only
   - Remaining tasks marked `not-started`

4. **Resume/Finished**:
   - Rerun on finished list: exit 5, zero provider calls (proof determinism)
   - Rerun after block: only pending task executes, zero new provider calls

### Backward Compatibility Notes

- **generate() Removal**: The `generate()` method is eliminated in this version
  - Migration: `generator.test.ts` rewrites tests to use `executeTask`
  - Old callers: throw clear error with migration guidance
  
- **Session API Stability**: 
  - `SessionLauncher` remains stable (in-process, no changes)
  - `GitRunner` contracts unchanged (still verifying commits)
  
- **Proof Determinism**:
  - Plan output is deterministic across runs
  - FakeProvider with scripted replies ensures zero accidental network calls
  - Proof is the documentation of the split

## Test Scenarios

### Scenario 1: Plan then Drive (Basic Flow)

```typescript
describe("T10: Offline proof for the split", () => {
  it("plan stage: 1 planner call + artifact commit", async () => {
    const fakeProvider = createFakeProvider();
    fakeProvider.setPlanReply({ tasks: [/*...*/], plan: {/*...*/} });
    
    const result = await run(["plan", "--spec", specContent]);
    assert(result.exitCode === 0);
    assert(fakeProvider.getCallCount() === 1, "Only 1 plan call");
    
    const commits = git.getCommits();
    assert(commits[0].message === "plan: create tasks");
    assert(commits[0].files.includes("agent/tasks.json"));
  });

  it("drive stage: N executor calls, N commits, N/N complete", async () => {
    // Re-use plan artifacts from previous test
    const result = await run(["drive", "--plan-id", planId]);
    assert(result.exitCode === 0);
    
    const commits = git.getCommits();
    // Expect: "plan: create tasks" + N × "work: complete task-<i>"
    assert(commits.length === N + 1);
    
    const report = parseReport(result.output);
    assert(report.status === "N/N complete");
  });
});
```

### Scenario 2: Non-Overlap (Each Task Commits Its Own Files)

```typescript
it("work sessions: each commit contains its own written files, no overlap", async () => {
  const sessionLauncher = createInProcessLauncher();
  const gitSpy = new ScriptedGitRunner();
  
  // Verify commit 1 for task-1
  gitSpy.expectCommit("work: complete task-1", [
    "agent/work/task-1.result",
    "agent/index.json"
  ]);
  
  // Verify commit 2 for task-2 (different files)
  gitSpy.expectCommit("work: complete task-2", [
    "agent/work/task-2.result",
    "agent/index.json"
  ]);
  
  await sessionLauncher.launch("task-1", plan);
  await sessionLauncher.launch("task-2", plan);
  
  gitSpy.verifyAllExpectations();
  assert(fakeProvider.getCallCount() === N, "Executor called N times");
});
```

### Scenario 3: Blocked Mid-List

```typescript
it("blocked task: exactly one restore, driver stops, remaining not-started", async () => {
  const sessionLauncher = createInProcessLauncher();
  sessionLauncher.setTaskResult("task-2", { exitCode: 1, blocked: true });
  
  const result = await run(["drive", "--plan-id", planId]);
  assert(result.exitCode === 4, "Exit 4 on blocked");
  
  // Verify restoreWrittenPaths called once for task-2
  assert(gitSpy.getRestoreCalls().length === 1);
  assert(gitSpy.getRestoreCalls()[0].paths === task2Paths);
  
  // Verify remaining tasks not started
  const index = parseIndex("agent/index.json");
  assert(index.tasks[2].status === "not-started");
  assert(index.tasks[3].status === "not-started");
});
```

### Scenario 4: Resume After Block

```typescript
it("resume: rerun after block → only pending task executes", async () => {
  // After blocked scenario, rerun
  const result = await run(["drive", "--plan-id", planId]);
  assert(result.exitCode === 0, "Exit 0 on success");
  
  // Only task-2 (the blocked one) should execute
  assert(fakeProvider.getCallCount() === 1, "Only 1 executor call for pending task");
  
  // Verify commit for task-2
  const commits = git.getCommits();
  const lastCommit = commits[commits.length - 1];
  assert(lastCommit.message === "work: complete task-2");
});
```

### Scenario 5: Finished Queue → Exit 5, Zero Provider Calls

```typescript
it("finished queue: exit 5, zero provider calls", async () => {
  // After all tasks complete, rerun
  const fakeProvider = createFakeProvider();
  fakeProvider.spy(); // Track all calls
  
  const result = await run(["work", "--plan-id", planId]);
  assert(result.exitCode === 5, "Exit 5 on finished queue");
  
  assert(fakeProvider.getCallCount() === 0, "Zero provider calls on finished queue");
  assert(fetchSpy.getCallCount() === 0, "Zero network calls");
});
```

### Scenario 6: Verify generate() Removal

```typescript
it("generate() is deleted from generator.ts", async () => {
  // Import generator module
  const generator = require("agent/src/generator.ts");
  
  // Verify generate() does not exist
  assert(!("generate" in generator), "generate() method removed");
  
  // Verify executeTask is available (migration target)
  assert(typeof generator.executeTask === "function");
  
  // generator.test.ts should not call generate()
  const testContent = fs.readFileSync("agent/tests/generator.test.ts", "utf-8");
  assert(!testContent.includes("plan.generate()"));
  assert(testContent.includes("executeTask"));
});
```

### Scenario 7: Zero Network Verification

```typescript
it("zero network: fetch spy and provider spy at zero", async () => {
  const fetchSpy = spyOnFetch();
  const providerSpy = spyOnProvider();
  
  // Run full proof (plan + N drive calls)
  await run(["plan", "--spec", specContent]);
  for (let i = 0; i < N; i++) {
    await run(["drive", "--plan-id", planId]);
  }
  
  assert(fetchSpy.getCallCount() === 0, "No fetch calls (offline)");
  assert(providerSpy.getCallCount() === N + 1, "Only N+1 provider calls (plan + N drive)");
  
  // Verify no unexpected directories
  const dirs = fs.readdirSync("agent/");
  assert(!dirs.includes(".work"), "No .work/ directory");
  assert(!dirs.includes(".scope"), "No .scope/ directory");
  assert(!dirs.includes(".research"), "No .research/ directory");
  assert(!dirs.includes(".design"), "No .design/ directory");
});
```

## Proof Artifact Schema

```json
{
  "planId": "2026-09-05-003",
  "tasks": [
    {
      "id": "task-1",
      "title": "First work task",
      "status": "not-started",
      "filePath": "agent/work/task-1.result"
    },
    {
      "id": "task-2",
      "title": "Second work task",
      "status": "not-started",
      "filePath": "agent/work/task-2.result"
    }
  ],
  "plan": {
    "splitFactor": 3,
    "stage": "work",
    "dependencies": []
  },
  "generated": "2026-09-05T19:09:03Z"
}
```

## Implementation Checklist

- [ ] Write failing test: `agent/tests/pipeline-sessions.test.ts`
  - [ ] Plan stage: 1 FakeProvider call, artifact commit
  - [ ] Drive stage: N executor calls, N commits, N/N complete
  - [ ] Each commit: task-specific files only, no overlap
  - [ ] Blocked mid-list: exit 4, restoreWrittenPaths, remaining not-started
  - [ ] Resume after block: only pending task
  - [ ] Finished queue: exit 5, zero provider calls
  - [ ] Zero network: fetch spy and provider spy validation

- [ ] Implement green path
  - [ ] Fix hand-off ordering between stages
  - [ ] Verify artifact path sets (no overlap)
  - [ ] Implement exit-code mapping (0, 4, 5)
  - [ ] Delete `generate()` from `agent/src/generator.ts`
  - [ ] Migrate `agent/tests/generator.test.ts` to `executeTask`

- [ ] Refactor per documentation
  - [ ] Name each `describe` block after stage (plan, drive, work)
  - [ ] One `it` per exit code (0, 4, 5)
  - [ ] Move skill-provenance assertions to T10 tests
  - [ ] Rewrite `agent/tests/pipeline-skills.test.ts` to plan-stage-only

- [ ] Verify
  - [ ] All scenarios passing
  - [ ] Offline proof is deterministic
  - [ ] Zero accidental network calls
  - [ ] `generate()` fully removed

## Acceptance Criteria

- [ ] Offline with `FakeProvider`, a scripted `GitRunner` and an in-process `SessionLauncher`: the plan stage writes and commits the artifacts, each work session is a separate call committing exactly its own task, a blocked task leaves no modified files and stops the driver, a re-run on a complete list exits 5 with zero provider calls — and `generate()` no longer exists

## Dependencies

- 2026-09-05-003-T05: `executeTask` is what the migrated generator tests must now target
- 2026-09-05-003-T06: the report this proof asserts across sessions, not within one
- 2026-09-05-003-T07: the work stage under test
- 2026-09-05-003-T08: the plan stage under test
- 2026-09-05-003-T09: the driver whose launcher the proof replaces

## Notes

- `generate()` survives from T05 until here precisely so no commit in this plan is red; deleting it in
  the same change that removes its last caller is the honest order.
- Keep the loud provider stub: a scripted fake that throws when its replies run out is what proves no
  session made a call nobody expected.
- Do not replace the deleted one-process proof with a regex over markdown or over source strings —
  assert the commits, the files, and the argv the seams received.
