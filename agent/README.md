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
│   ├── plan.ts                     # Spec → Task list (uses LLM)
│   ├── generator.ts                # Task → Code file (uses LLM + tool calls)
│   ├── repair.ts                   # Repair loop: validate → fix
│   ├── validate.ts                 # Run typecheck + tests
│   ├── tracer.ts                   # Log all calls for debugging/replay
│   ├── prompts/
│   │   ├── planner.ts              # Planner prompt template
│   │   ├── generator.ts            # Generator prompt template
│   │   ├── repair.ts               # Repair prompt template
│   │   └── exemplars.ts            # Extract rules from boilerplate
│   ├── llm/
│   │   ├── provider.ts             # LlmProvider interface
│   │   ├── anthropic.ts            # Anthropic/Claude adapter
│   │   ├── openai.ts               # OpenAI/GPT adapter
│   │   └── fake.ts                 # FakeProvider for testing
│   ├── tools/
│   │   ├── file-ops.ts             # write_file tool
│   │   ├── shell.ts                # exec_shell tool
│   │   └── inspect.ts              # read_file, list_dir tools
│   └── trace-cli.ts                # Trace replay command
├── tests/
│   ├── generalization.test.ts      # Spec-driven generalization proof
│   ├── e2e-pipeline.test.ts        # Full pipeline test
│   ├── planner.test.ts
│   ├── generator.test.ts
│   ├── repair.test.ts
│   └── ... (other component tests)
├── skills/
│   └── (Optional skill modules for prompt injection)
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
npx ts-node agent/src/index.ts --spec specs/car-inventory.md --out generated-app

# Or with a variant spec (demonstrates generalization)
npx ts-node agent/src/index.ts --spec docs/examples/variant-specs/variant-rename.md --out generated-book

# With specific provider override
npx ts-node agent/src/index.ts --spec specs/car-inventory.md --provider openai --model gpt-4o
```

### 4. Verify Output

```bash
cd generated-app
npm install
npm run typecheck
npm run test
npm run dev  # Run dev server at localhost:5173
```

## CLI Flags

| Flag | Required | Default | Description |
|------|----------|---------|-------------|
| `--spec` | Yes | — | Path to spec file (relative or absolute) |
| `--out` | No | `generated-app` | Output directory for generated app |
| `--provider` | No | Auto-detect | `anthropic` or `openai` |
| `--model` | No | `claude-sonnet-4-5` (Claude) or `gpt-4o` (GPT) | LLM model ID |
| `--max-retries` | No | `3` | Outer repair-loop retry count |
| `--max-iterations` | No | `8` | Inner tool-loop retry count per task |
| `--dry-run` | No | `false` | Resolve config only; no API calls |
| `--skills-dir` | No | `agent/skills` | Path to skill modules for injection |

## Configuration

Environment variables (required exactly one):

- **`ANTHROPIC_API_KEY`** — Anthropic API key (for Claude models)
- **`OPENAI_API_KEY`** — OpenAI API key (for GPT models)

Optional:
- **`LLM_PROVIDER`** — Override auto-detection: `anthropic` or `openai`

## Testing

```bash
# Run all agent tests
npm run agent:test

# Run generalization test (variant spec proof)
npm run agent:test -- generalization.test.ts

# Run specific test file
npm run agent:test -- planner.test.ts

# Watch mode
npm run agent:test:watch

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

1. **Config** — CLI flags + env → `AgentConfig`
2. **Scaffold** — Copy boilerplate to output
3. **Exemplars** — Extract rules from boilerplate → `DerivedRules`
4. **Plan** — Spec + rules → LLM → `Task[]`
5. **Generate** — For each task:
   - Build context (spec + rules + exemplars + prior outputs)
   - Call LLM with `write_file` tool
   - Parse JSON, validate syntax
   - Write file or retry
6. **Validate** — `npm run typecheck` + `npm run test`
7. **Repair** — If failures, send errors to LLM + retry (outer loop)
8. **Tracer** — Log all requests/responses for replay

### Key Components

| Component | Responsibility |
|-----------|-----------------|
| **Planner** | Decompose spec into ordered, dependency-aware tasks |
| **Generator** | Generate code file-by-file with per-task context |
| **Repair Loop** | Validate and iterate until typecheck/tests pass |
| **Validator** | Execute TypeScript checks and unit tests |
| **Tracer** | Record all LLM calls for debugging/replay |
| **Context Builder** | Pack spec + rules + exemplars into prompt; respect token budget |
| **LLM Adapters** | Wrap provider APIs (Anthropic, OpenAI) with unified interface |

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

See [Architecture Doc](../docs/plans/architectures/cli-agentic-architecture.md#4-cost-analysis) for detailed breakdown.

## Generalization: Variant Spec

The agent is **not hardcoded to Car Inventory**. It's spec-driven.

**Proof:**

```bash
# Run with variant spec (Book Inventory)
npx ts-node agent/src/index.ts \
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
npx ts-node agent/src/index.ts trace replay docs/samples/e2e/run-2026-09-05T04-47-08 --out replay-output

# Modify trace and re-run to test different responses
# (Edit trace JSON files, then replay)
```

## Debugging

### Verbose Logging

```bash
DEBUG=* npx ts-node agent/src/index.ts --spec specs/car-inventory.md
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

| Decision | Why | Tradeoff |
|----------|-----|----------|
| **Custom two-loop** | Full control over retry strategy | More code than using a framework |
| **Explicit tracer** | Perfect debuggability | Adds disk I/O and storage (~1–10 MB/run) |
| **Strict TypeScript** | Catches bugs early | Slows generation (full typecheck per task) |
| **Spec-driven (not code-gen config)** | Easier for non-technical spec authors | Planner must be smart (calls LLM every run) |
| **Rejected pi-SDK** | Need full visibility into loop logic | More code than using a higher-level framework |

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

1. Create `agent/skills/my-skill/SKILL.md` with frontmatter + markdown body
2. Skill is auto-discovered by `discoverSkills()` and injected into relevant prompts

## License

See root LICENSE file.

## Questions?

Refer to the main [README.md](../README.md) or [Architecture Doc](../docs/plans/architectures/cli-agentic-architecture.md) for more details.
