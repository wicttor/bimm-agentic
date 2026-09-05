# Agent — Agentic Code Generation System

This is the core agent implementation for spec-driven code generation. It transforms natural-language specifications into working React + TypeScript applications.

## Overview

The agent implements a **two-loop architecture**:

- **Inner loop**: Generates code file-by-file with tool-use retry for localized failures
- **Outer loop**: Validates and repairs full-app failures (typecheck/test)

See [docs/plans/architectures/cli-agentic-architecture.md](../docs/plans/architectures/cli-agentic-architecture.md) for detailed design documentation.

## Directory Structure

```
agent/
├── src/
│   ├── index.ts                    # CLI entry point
│   ├── config.ts                   # Config resolution (flags, env, provider)
│   ├── scaffold.ts                 # Copy boilerplate to output dir
│   ├── plan.ts                     # Spec → Task list, run through the `plan` skill (LLM)
│   ├── plan-schema.ts              # The one schema object: validator and model contract agree
│   ├── plan-artifacts.ts           # Renders + writes the plan document and one task file per task
│   ├── work-artifacts.ts           # Records task outcomes: status, AC box, index tick, work report
│   ├── generator.ts                # Task → Code file, run through the `work` skill (LLM + tools)
│   ├── skill-prompts.ts            # Injects the `plan` / `work` skills as binding procedures
│   ├── skills.ts                   # Discovers `<skillsDir>/*/SKILL.md`, loads phase modules
│   ├── context.ts                  # Token-budgeted context assembly (spec, rules, dependencies)
│   ├── agent-loop.ts               # Inner tool-calling loop, bounded by --max-iterations
│   ├── repair.ts                   # Repair loop: validate → fix
│   ├── validate.ts                 # Run typecheck + tests
│   ├── parse-tsc.ts / parse-vitest.ts # Compiler/test output → structured errors
│   ├── tracer.ts                   # Log all calls for debugging/replay
│   ├── prompts/
│   │   ├── planner.ts              # Planner prompt: rules + plan skill + output contract
│   │   ├── generator.ts            # Executor prompt: task + AC + work skill's Execute phase
│   │   ├── repair.ts               # Repair prompt template
│   │   └── exemplars.ts            # Extract rules and exemplars from the boilerplate
│   ├── llm/
│   │   ├── provider.ts             # LlmProvider interface, typed error taxonomy, retry plumbing
│   │   ├── anthropic.ts            # Anthropic/Claude adapter
│   │   ├── openai.ts               # OpenAI/GPT adapter
│   │   ├── openrouter.ts           # OpenRouter adapter
│   │   └── fake.ts                 # FakeProvider for offline tests and --dry-run
│   ├── tools/
│   │   ├── registry.ts             # Tool definitions + dispatch (read_file, write_file, list_files, run_command)
│   │   ├── fs.ts                   # Sandbox-relative file tools
│   │   └── shell.ts                # Allow-listed npm-script runner
│   └── trace-cli.ts                # Trace replay command
├── tests/
│   ├── pipeline-skills.test.ts     # Offline proof of the whole skill-driven run (one run() call)
│   ├── generalization.test.ts      # Spec-driven generalization proof
│   ├── e2e-pipeline.test.ts        # Full pipeline test
│   ├── plan.test.ts / plan-artifacts.test.ts / work-artifacts.test.ts
│   ├── prompts.test.ts / skills.test.ts / generator.test.ts / repair.test.ts
│   └── ... (other component tests)
├── skills/
│   └── README.md                   # Skill format reference; the skills themselves live in
│                                   # `.agents/skills/` at the repository root (the default
│                                   # `--skills-dir`)
└── README.md (this file)
```

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up API Key

Create a `.env` file (or export the env var):

```bash
# For Anthropic/Claude
export ANTHROPIC_API_KEY=sk-ant-...

# OR for OpenAI/GPT
export OPENAI_API_KEY=sk-...
```

Alternatively, copy `.env.example` and fill in one key:

```bash
cp .env.example .env
# Edit .env with your API key
```

### 3. Generate From a Spec

```bash
# Using the provided Car Inventory spec
npx tsx agent/src/index.ts --spec specs/car-inventory.md --out generated-app

# Or with a variant spec (demonstrates generalization)
npx tsx agent/src/index.ts --spec docs/examples/variant-specs/variant-rename.md --out generated-book

# With specific provider override
npx tsx agent/src/index.ts --spec specs/car-inventory.md --provider openai --model gpt-5-nano

# Resolve everything and stop, with zero network calls
npx tsx agent/src/index.ts --spec specs/car-inventory.md --dry-run
```

A run leaves three durable outputs: the generated app in `--out`, one plan document and one task file
per task under `--artifacts-dir` (default `docs/`), and one closing work report in the task index. See
[Skill-Driven Pipeline](#skill-driven-pipeline-plan--work).

### 4. Verify Output

```bash
cd generated-app
npm install
npm run typecheck
npm run test
npm run dev  # Run dev server at localhost:5173
```

## CLI Flags

| Flag               | Required | Default                                                     | Description                                                                    |
| ------------------ | -------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `--spec`           | Yes      | —                                                           | Path to spec file (relative or absolute)                                       |
| `--out`            | No       | `generated-app`                                             | Output directory for generated app (must be empty or absent)                    |
| `--provider`       | No       | Auto-detect from whichever API key is set                   | `anthropic`, `openai` or `openrouter`                                          |
| `--model`          | No       | `claude-sonnet-4-5` / `gpt-5-nano` / `z-ai/glm-5.3-flash`    | LLM model ID for the resolved provider                                         |
| `--max-retries`    | No       | `3`                                                         | Outer repair-loop retry count                                                  |
| `--max-iterations` | No       | `8`                                                         | Inner tool-loop retry count per task                                           |
| `--dry-run`        | No       | `false`                                                     | Resolve config only; no provider is instantiated, no API calls                 |
| `--skills-dir`     | No       | `.agents/skills`                                            | Directory scanned for `<id>/SKILL.md`; pass a missing path to run without skills |
| `--artifacts-dir`  | No       | `docs`                                                      | Where the durable workflow records go: `<dir>/plans/` and `<dir>/tasks/<plan-id>/` |

`--artifacts-dir` deliberately points **outside** `--out`: the plan document and task files are records
of the run, not part of the generated app, so regenerating an app never rewrites its own plan.

## Configuration

Environment variables (required exactly one):

- **`ANTHROPIC_API_KEY`** — Anthropic API key (for Claude models)
- **`OPENAI_API_KEY`** — OpenAI API key (for GPT models)
- **`OPENROUTER_API_KEY`** — OpenRouter API key

Optional:

- **`LLM_PROVIDER`** — Override auto-detection: `anthropic`, `openai` or `openrouter`

No key is needed for `--dry-run` or for the test suite, which drives the pipeline through
`FakeProvider` and asserts zero network calls.

## Testing

```bash
# Run all agent tests
npm run agent:test

# Run generalization test (variant spec proof)
npm run agent:test -- generalization.test.ts

# Run the offline skill-pipeline proof
npm run agent:test -- pipeline-skills.test.ts

# Run specific test file
npm run agent:test -- plan.test.ts

# Watch mode (no `agent:test:watch` script exists; run vitest in watch directly)
npx vitest --config agent/vitest.config.ts

# Check TypeScript (agent code)
npm run agent:typecheck
```

## Architecture Highlights

### Two-Loop Design

```
Outer Repair Loop (max 3 retries)
  ├─ Inner Task Loop (max 8 retries per task)
  │   ├─ Plan: Spec → Tasks (using LLM)
  │   ├─ Generate: For each task
  │   │   ├─ Build context
  │   │   ├─ Call LLM with tools
  │   │   ├─ Parse + validate output
  │   │   └─ Retry if invalid
  │   └─ Tracer: Record all calls
  ├─ Validate: Run typecheck + tests
  └─ Repair: If validation fails, loop back
```

### Data Flow

1. **Config** — CLI flags + env → `AgentConfig` (fails before any network call)
2. **Scaffold** — Copy boilerplate to `--out`; a non-empty output is refused, never overwritten
3. **Exemplars** — Extract rules from boilerplate → `DerivedRules`
4. **Plan** — one LLM call that runs the **`plan` skill's five phases in one autopilot pass**
   (Scope → Research → Design → Generate → Tasks). The answer is a `write_plan` tool call validated
   against `plan-schema.ts`, cycle-checked and topologically sorted → `Task[]`
5. **Register the plan** — `plan-artifacts.ts` renders the plan document and **one task file per
   task** (one Acceptance Criterion, one test file, Red → Green → Refactor) plus both indexes
6. **Generate** — for each task file, one executor call that runs the **`work` skill's Execute
   phase**: budgeted context (spec + rules + exemplars + prior outputs), `write_file` for the task's
   test first and its implementation second, bounded by `--max-iterations`
7. **Record** — `work-artifacts.ts` flips each task's `status`, ticks its AC box and the index line,
   and writes one closing work report. Forward-only: a `completed` task is never re-opened
8. **Validate / Repair** — `npm run typecheck` + `npm run test` in the generated app; failures go
   back to the model, up to `--max-retries`
9. **Tracer** — every request/response is recorded for replay

### Skill-Driven Pipeline: plan → work

The agent does not carry its own hand-written idea of what planning and execution mean. It loads the
repository's own workflow skills and executes them as the binding procedure for each call:

| Stage            | Skill invoked | Modules inlined        | What the model is told                                          |
| ---------------- | ------------- | ---------------------- | --------------------------------------------------------------- |
| Planner call     | `plan`        | `generate`, `tasks`    | Run all five phases in one pass; Phase 5 (Tasks) is never skipped |
| Executor call(s) | `work`        | `execute`              | Triage/Prepare are done; this call is exactly one task's Execute |

Both prompts pin what the skills assume but cannot have here:

- **`interactionMode: autopilot`** — there is no user in the loop, so every "ask the user" and every
  phase-gate confirmation is void and the recommended option is taken silently.
- **Skill text is capped** at `SKILL_BLOCK_MAX_BYTES` (40 KB) per prompt, and any phase module that is
  not inlined or does not fit is named in the block — an omission is reported, never silent.
- **The output contract wins**: the harness parses the answer, so where a skill says "produce a
  markdown artifact", the JSON contract stated later in the same prompt overrides it.
- `--skills-dir` pointing at a directory with no skills degrades to the plain planner/executor prompt;
  the run still plans, executes and records.

The proof is `agent/tests/pipeline-skills.test.ts`: one `run()` call with a scripted provider asserts
the plan document, the task files, the recorded statuses, which skill names which request's system
turn, and that zero network calls were attempted.

### What a run writes — and what it deliberately skips

Written:

- `--out/` — the generated app (scaffold plus the task files the model wrote)
- `<artifactsDir>/plans/<plan-id>-<slug>.md` — the plan document
- `<artifactsDir>/plans/index.md` — one row per plan (idempotent: an existing row is never duplicated)
- `<artifactsDir>/tasks/<plan-id>/T<NN>-<slug>.md` — one task file per task
- `<artifactsDir>/tasks/<plan-id>/index.md` — the checklist, ticked forward, plus exactly one
  `## Work Report — <plan-id>-run` block (replaced in place on a re-run, never stacked)

Skipped on purpose:

- `docs/plans/.scope/`, `.research/`, `.design/` — the plan skill's interactive phase dumps
- `docs/plans/.work/.triage/`, `.prepare/`, `.execute/`, `.review/` — the work skill's phase dumps
- `docs/learn/` writes — learnings are captured by the separate `/learn` skill, never by a run

The reasoning those files would record still happens, inside the single planner response; the files
are skipped because a code-generation run already keeps a full request/response trace, and four extra
markdown dumps per task would be duplicate cost with no additional audit value. If an artifact cannot
be written, the run logs one error naming the reason and continues: the generated app is the product.

### Key Components

| Component            | Responsibility                                                                  |
| -------------------- | ------------------------------------------------------------------------------- |
| **Planner**          | Run the `plan` skill in one autopilot pass; decompose the spec into ordered tasks |
| **Plan artifacts**   | Render and write the plan document, one task file per task, and both indexes      |
| **Generator**        | Run the `work` skill's Execute phase per task file, with per-task context         |
| **Work artifacts**   | Record outcomes forward-only: status, AC box, index tick, one work report         |
| **Skill prompts**    | Load `SKILL.md` + phase modules and pin them as binding procedure                |
| **Repair Loop**      | Validate and iterate until typecheck/tests pass                                 |
| **Validator**        | Execute TypeScript checks and unit tests                                        |
| **Tracer**           | Record all LLM calls for debugging/replay                                        |
| **Context Builder**  | Pack spec + rules + exemplars into prompt; respect token budget                  |
| **LLM Adapters**     | Wrap provider APIs (Anthropic, OpenAI, OpenRouter) with one interface             |

## Failure Modes & Mitigation

See [Architecture Doc](../docs/plans/architectures/cli-agentic-architecture.md#3-failure-modes-and-mitigation) for:

- Malformed JSON from LLM
- Circular task dependencies
- TypeScript errors
- Test failures
- LLM stall detection
- Trace replay for debugging

## Cost Analysis

**Typical run (Car Inventory spec):**

- ~5–7 LLM calls (1 plan + 4 generators + 0–2 repairs)
- ~3500 input tokens, ~12200 output tokens
- ~$0.08 with Claude Sonnet 4.5 (actual: depends on retries)

> These figures pre-date the skill injection. Each prompt now also carries the `plan` or `work` skill
> (up to 40 KB per prompt), so real input tokens are higher than the numbers above; re-measure from a
> trace before quoting them.

See [Architecture Doc](../docs/plans/architectures/cli-agentic-architecture.md#4-cost-analysis) for detailed breakdown.

## Generalization: Variant Spec

The agent is **not hardcoded to Car Inventory**. It's spec-driven.

**Proof:**

```bash
# Run with variant spec (Book Inventory)
npx tsx agent/src/index.ts \
  --spec docs/examples/variant-specs/variant-rename.md \
  --out generated-book-inventory
```

**Expected output:**

- Files: `src/useBooks.ts`, `src/BookList.tsx`, `src/AddBookForm.tsx`
- Hook: `useBooks()` (not `useCars()`)
- No "Car" references in generated code
- Typechecks and tests pass

See [Variant Sample](../docs/samples/variant/variant-run-2026-09-05/) for real output.

## Extending to Other Frameworks

To target Vue, Angular, Python, etc.:

1. **Swap boilerplate** — Use template for new framework
2. **Update exemplars** — Extract new type signatures and patterns
3. **Adjust constraints** — Update `DerivedRules` for new framework conventions
4. **Reuse loops** — Planner, generator, repair, tracer remain unchanged

See [Architecture Doc](../docs/plans/architectures/cli-agentic-architecture.md#5-generalization-strategy) for details.

## Trace Replay

Replay a previous run with recorded LLM responses (useful for debugging without re-running expensive API calls):

```bash
# Replay from a saved trace directory
npx tsx agent/src/index.ts trace replay docs/samples/e2e/run-2026-09-05T04-47-08 --out replay-output

# Modify trace and re-run to test different responses
# (Edit trace JSON files, then replay)
```

## Debugging

### Verbose Logging

```bash
DEBUG=* npx tsx agent/src/index.ts --spec specs/car-inventory.md
```

### Inspect Trace Files

Each run creates a trace directory with all LLM calls and responses:

```
docs/samples/e2e/run-2026-09-05T04-47-08/traces/
├── call-1-planner.json
├── call-2-generator-task1.json
├── call-3-generator-task2.json
└── ... (one file per LLM call)
```

Examine these to debug generation issues without re-running LLM calls.

## Tradeoffs & Design Decisions

| Decision                              | Why                                   | Tradeoff                                      |
| ------------------------------------- | ------------------------------------- | --------------------------------------------- |
| **Custom two-loop**                   | Full control over retry strategy      | More code than using a framework              |
| **Explicit tracer**                   | Perfect debuggability                 | Adds disk I/O and storage (~1–10 MB/run)      |
| **Strict TypeScript**                 | Catches bugs early                    | Slows generation (full typecheck per task)    |
| **Spec-driven (not code-gen config)** | Easier for non-technical spec authors | Planner must be smart (calls LLM every run)   |
| **Rejected pi-SDK**                   | Need full visibility into loop logic  | More code than using a higher-level framework |

See [Architecture Doc](../docs/plans/architectures/cli-agentic-architecture.md#6-tradeoffs) for full discussion.

## Contributing & Development

### Running Tests

```bash
npm run agent:test
npm run agent:typecheck
```

### Adding a New Prompt Template

1. Create `agent/src/prompts/my-prompt.ts`
2. Export a `createMyPrompt(context: Context): string` function
3. Use in the appropriate component (planner, generator, etc.)
4. Add tests in `agent/tests/prompts.test.ts`

### Adding a Skill

1. Create `<skillsDir>/my-skill/SKILL.md` — frontmatter with `name` and `description` (and optional
   `when-to-use`), then the markdown body. The default `--skills-dir` is `.agents/skills` at the
   repository root; `agent/skills/README.md` documents the format.
2. Skill is auto-discovered by `discoverSkills()`; a prompt builder that names a skill id loads it with
   `loadSkillBundle()` and reports anything it could not inline.
3. Run `npx tsx agent/src/index.ts --spec ... --dry-run` to confirm the resolved `skills=` path, then
   the suite: `npm run agent:test`.

## License

See root LICENSE file.

## Questions?

Refer to the main [README.md](../README.md) or [Architecture Doc](../docs/plans/architectures/cli-agentic-architecture.md) for more details.
