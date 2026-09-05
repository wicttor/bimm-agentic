// Boilerplate contract, read out of the reference files (task 2026-09-04-001-T07).
//
// Every model call this agent makes has to carry the same non-negotiable rules, and the way to keep
// three prompt builders honest is to make none of them own the rules. This module reads the rules
// out of the boilerplate itself — the same read-only tree the scaffolder copies from — and renders
// them as text, so a rule can only ever be wrong in one place: the file it came from.
//
// Design rules this module holds itself to:
//
//   1. No rule payload is written here. Not an export name, not a field name, not a pixel threshold,
//      not a compiler-option name. The names of the *files* are hardcoded (that is the contract
//      between the boilerplate and the agent); the contents of the rules are not. `agent/tests/
//      prompts.test.ts` asserts the payload ban by reading these modules back off disk, and proves
//      the same property behaviourally by editing a temp copy of the tree and re-rendering.
//   2. A missing file is fatal, an empty file is not. If a reference file is absent, the agent is
//      pointed at something that is not the boilerplate and every downstream prompt would be a
//      guess, so `deriveRules` throws and names the path. If a file is present but yields nothing
//      for one rule, that rule is *omitted* and recorded in `warnings`, which the renderer prints
//      into the prompt: the model is told the contract is incomplete rather than handed a silently
//      narrower one.
//   3. Reading happens once, here, at prompt-build time, straight off the filesystem. Not through
//      the T05 sandbox: the sandbox confines what the *model* may touch, and the reference tree is
//      the harness's own read-only input, outside the output directory by construction. Same
//      reasoning the skill loader gets in T15.
//   4. The rendered block is deterministic and root-independent, so callers can cache it, diff it in
//      a run trace, and share one instance across the planner, generator and repair prompts.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { Message } from "../llm/provider.ts";

/** A prompt is the subset of `CompleteRequest` the builders own; T03's adapters take it verbatim. */
export interface Prompt {
  system: string;
  messages: Message[];
}

// ---------------------------------------------------------------------------
// Reference-file layout
// ---------------------------------------------------------------------------
// These are the only path literals in the prompt library, and they describe the *structure* of the
// boilerplate, not its domain. A variant spec that renames files (T14) renames them here, once.

/** The app's own compiler contract. */
export const TS_CONFIG_FILE = "tsconfig.json";
/** Where the runnable verification scripts are declared. */
export const PACKAGE_JSON_FILE = "package.json";
/** Shared type declarations. */
export const TYPES_FILE = "src/types.ts";
/** The GraphQL documents the generated code must reuse. */
export const OPERATIONS_FILE = "src/graphql/queries.ts";
/** The mock data whose image dimensions encode the responsive contract. */
export const FIXTURE_DATA_FILE = "src/mocks/data.ts";
/** The MSW resolvers that already exist. */
export const HANDLER_FILE = "src/mocks/handlers.ts";

/** Directories whose files are quoted to the model as few-shot examples. */
export const DEFAULT_EXEMPLAR_DIRS = ["src/components", "src/__tests__"] as const;

/** Ceiling on a quoted exemplar file, so one verbose reference cannot crowd out the rules. */
const MAX_EXEMPLAR_CHARS = 6_000;

/** Repo root, derived from this module's own location: `agent/src/prompts/` up three. */
export const DEFAULT_REFERENCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

// ---------------------------------------------------------------------------
// Derived shape
// ---------------------------------------------------------------------------

export interface AliasRule {
  /** The import prefix, e.g. the `@/` in `@/types`. */
  prefix: string;
  /** The directory it resolves to, e.g. `src/`. */
  target: string;
}

export interface ModelField {
  name: string;
  /** The declaration's own type text, verbatim. */
  type: string;
}

export interface ModelType {
  name: string;
  /** Import specifier for the declaring file, alias-resolved. */
  module: string;
  fields: ModelField[];
}

export type OperationKind = "query" | "mutation" | "subscription";

export interface OperationVariable {
  name: string;
  type: string;
}

export interface GraphQlOperation {
  /** The exported constant name the generated code imports. */
  exportName: string;
  kind: OperationKind;
  /** The operation name inside the document, which is what the mock resolvers match on. */
  operationName: string;
  module: string;
  variables: OperationVariable[];
}

export interface MockHandler {
  kind: OperationKind;
  operationName: string;
}

/**
 * One responsive tier.
 *
 * `width`/`height` are the fixture image dimensions; `minPx`/`maxPx` are the viewport range that
 * image is meant for. Each tier's ceiling is its own image width, and its floor is the tier below
 * plus one pixel — which is how the breakpoint table is read out of image dimensions rather than
 * written down.
 */
export interface BreakpointTier {
  field: string;
  width: number;
  height: number;
  minPx: number | null;
  maxPx: number | null;
}

export interface BreakpointRule {
  tiers: BreakpointTier[];
}

export interface ExemplarFile {
  /** Repo-relative path, for the quoted header. */
  path: string;
  /** Alias-resolved import specifier for the same file. */
  module: string;
  contents: string;
  truncated: boolean;
}

export interface DerivedRules {
  /** Absolute path of the tree the rules were read from. Never rendered into a prompt. */
  referenceRoot: string;
  alias: AliasRule | null;
  types: ModelType[];
  operations: GraphQlOperation[];
  handlers: MockHandler[];
  /** Discriminator values the mock fixtures use, as the exemplars spell them. */
  typenames: string[];
  breakpoints: BreakpointRule | null;
  /** Strictness switches the app's own config has enabled, in declaration order. */
  strictFlags: string[];
  scripts: { typecheck: boolean; test: boolean };
  exemplars: ExemplarFile[];
  /** Every file that was read, in read order — the prompt's provenance for a run trace. */
  sources: string[];
  /** Rules the tree could not answer. Surfaced in the prompt, never swallowed. */
  warnings: string[];
}

export interface DeriveOptions {
  /** Root of the read-only boilerplate; defaults to this repository's root. */
  referenceRoot?: string;
  /** Directories quoted as few-shot examples; defaults to the component and test exemplar dirs. */
  exemplarDirs?: readonly string[];
}

/** The reference tree is not the boilerplate. Unrecoverable, because every prompt depends on it. */
export class ReferenceFileError extends Error {
  /** Repo-relative path of the file that could not be read. */
  readonly referencePath: string;

  // Declared and assigned rather than written as a constructor parameter property: the agent runs
  // under Node's strip-only type removal (`node agent/src/index.ts`, no tsx), which rejects them.
  constructor(referencePath: string, message: string) {
    super(message);
    this.name = "ReferenceFileError";
    this.referencePath = referencePath;
  }
}

// ---------------------------------------------------------------------------
// Readers — one per reference file
// ---------------------------------------------------------------------------

function readReference(root: string, rel: string): string {
  const abs = join(root, rel);
  if (!existsSync(abs)) {
    throw new ReferenceFileError(
      rel,
      `cannot build prompts: required reference file "${rel}" was not found under "${root}". ` +
        `The boilerplate rules are read from that file, so the prompt would otherwise assert an ` +
        `unverified contract. Point the agent at the repository whose boilerplate it generates into.`,
    );
  }
  return readFileSync(abs, "utf8");
}

function jsonReference(root: string, rel: string): Record<string, unknown> {
  const text = readReference(root, rel);
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Falls through to the shared failure below.
  }
  throw new ReferenceFileError(rel, `cannot build prompts: reference file "${rel}" is not a JSON object.`);
}

function stringMap(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Resolve a repo-relative source path to the specifier generated code should import.
 *
 * `src/graphql/queries.ts` becomes `@/graphql/queries` when the app config maps the prefix; without
 * an alias the honest answer is the path itself.
 */
function importSpecifier(relPath: string, alias: AliasRule | null): string {
  const withoutExtension = relPath.replace(/\.(?:ts|tsx)$/, "");
  if (alias && relPath.startsWith(alias.target)) {
    return `${alias.prefix}${withoutExtension.slice(alias.target.length)}`;
  }
  return withoutExtension;
}

interface ParsedAlias {
  alias: AliasRule | null;
  strictFlags: string[];
  sources: string[];
  warnings: string[];
}

/**
 * Strictness switches are read, never named: a boolean `true` on an option whose name is `strict`
 * or `no` + a capital is the compiler telling us it is enforcing something.
 *
 * `noEmit` matches the pattern but silences output rather than tightening checks, so it is the one
 * option excluded. Anything the boilerplate adds later (a stricter `noImplicit*`, say) shows up in
 * the prompt with no edit here — that direction of drift is the useful one.
 */
const STRICTNESS_OPTION = /^(?:strict|no[A-Z])/;
const NON_DIAGNOSTIC_OPTIONS = new Set(["noEmit"]);

function parseTsConfig(options: Record<string, unknown>): Pick<ParsedAlias, "alias" | "strictFlags"> {
  const paths = stringMap(options["paths"]);
  let alias: AliasRule | null = null;
  for (const [pattern, targets] of Object.entries(paths)) {
    if (!pattern.endsWith("*") || !Array.isArray(targets)) continue;
    const target = targets.find((entry): entry is string => typeof entry === "string");
    if (target === undefined || !target.endsWith("*")) continue;
    alias = { prefix: pattern.slice(0, -1), target: target.slice(0, -1) };
    break;
  }

  const strictFlags = Object.entries(options)
    .filter(
      ([name, value]) =>
        value === true && STRICTNESS_OPTION.test(name) && !NON_DIAGNOSTIC_OPTIONS.has(name),
    )
    .map(([name]) => name);

  return { alias, strictFlags };
}

/** `export interface Name { field: Type; … }` — the declarations generated code must reuse. */
function parseTypes(text: string, module: string): ModelType[] {
  const types: ModelType[] = [];
  for (const block of text.matchAll(/export\s+interface\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
    const body = block[2] as string;
    const fields: ModelField[] = [];
    for (const field of body.matchAll(/(\w+)\s*:\s*([^;]+);/g)) {
      fields.push({ name: field[1] as string, type: (field[2] as string).trim() });
    }
    types.push({ name: block[1] as string, module, fields });
  }
  return types;
}

/**
 * `export const NAME = gql\`query OpName($a: T!) …\`` — the documents that already exist.
 *
 * Only the operation header is read; the selection set belongs to the file, and the model sees the
 * file's contents through the exemplars rather than a lossy summary of it here.
 */
function parseOperations(text: string, module: string): GraphQlOperation[] {
  const operations: GraphQlOperation[] = [];
  for (const declaration of text.matchAll(
    /export\s+const\s+(\w+)\s*=\s*gql\s*`([\s\S]*?)`/g,
  )) {
    const document = declaration[2] as string;
    const header = document.slice(0, document.indexOf("{") === -1 ? document.length : document.indexOf("{"));
    const signature = /^\s*(query|mutation|subscription)\s+(\w+)/.exec(header);
    if (signature === null) continue;
    const variables: OperationVariable[] = [];
    for (const variable of header.matchAll(/\$(\w+)\s*:\s*([\w[\]!]+)/g)) {
      variables.push({ name: variable[1] as string, type: variable[2] as string });
    }
    operations.push({
      exportName: declaration[1] as string,
      kind: signature[1] as OperationKind,
      operationName: signature[2] as string,
      module,
      variables,
    });
  }
  return operations;
}

/** `graphql.query("OpName", …)` — the resolvers a generated file must not duplicate. */
function parseHandlers(text: string): MockHandler[] {
  const handlers: MockHandler[] = [];
  for (const resolver of text.matchAll(/graphql\.(query|mutation|subscription)\s*\(\s*["'](\w+)["']/g)) {
    handlers.push({ kind: resolver[1] as OperationKind, operationName: resolver[2] as string });
  }
  return handlers;
}

/** The discriminator convention, as the test exemplar actually spells it. */
function parseTypenames(exemplars: readonly ExemplarFile[]): string[] {
  const found = new Set<string>();
  for (const exemplar of exemplars) {
    for (const match of exemplar.contents.matchAll(/__typename\s*:\s*["'](\w+)["']/g)) {
      found.add(match[1] as string);
    }
  }
  return [...found].sort();
}

interface ImageEntry {
  field: string;
  width: number;
  height: number;
}

/**
 * Every property whose value is a dimensioned image URL.
 *
 * The boilerplate ships one image per responsive slot at the slot's real width, so the fixture
 * encodes the breakpoint table: the small asset is the ceiling for the tier below it, because the
 * asset *is* that wide. Reading the rule out of the dimensions means no slot names and no pixel
 * thresholds are written down here.
 */
function parseImages(text: string): ImageEntry[] {
  const entries: ImageEntry[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(/(\w+)\s*:\s*["'`]([^"'`]*?(\d+)x(\d+)[^"'`]*)["'`]/g)) {
    const field = match[1] as string;
    const entry: ImageEntry = {
      field,
      width: Number(match[3]),
      height: Number(match[4]),
    };
    const key = `${field}:${entry.width}x${entry.height}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(entry);
  }
  return entries;
}

/**
 * Fold image dimensions into viewport tiers, narrowest first.
 *
 * A slot that ships several sizes is ambiguous, so the narrowest one wins the ordering and the
 * caller gets a warning rather than a table that quietly picked one.
 */
function toBreakpointRule(entries: readonly ImageEntry[]): {
  breakpoints: BreakpointRule | null;
  warning: string | null;
} {
  if (entries.length === 0) {
    return { breakpoints: null, warning: null };
  }
  const narrowest = new Map<string, ImageEntry>();
  for (const entry of entries) {
    const current = narrowest.get(entry.field);
    if (current === undefined || entry.width < current.width) narrowest.set(entry.field, entry);
  }
  const ordered = [...narrowest.values()].sort((a, b) => a.width - b.width);
  const tiers: BreakpointTier[] = ordered.map((entry, index) => ({
    field: entry.field,
    width: entry.width,
    height: entry.height,
    minPx: index === 0 ? null : (ordered[index - 1] as ImageEntry).width + 1,
    maxPx: index === ordered.length - 1 ? null : entry.width,
  }));
  const warning =
    ordered.length < 2
      ? `responsive tiers: only one image size was found in ${FIXTURE_DATA_FILE}, so no breakpoint table could be derived`
      : null;
  return { breakpoints: { tiers }, warning };
}

/** Reads the tree and returns the rules; pure with respect to everything but the reference files. */
export function deriveRules(options: DeriveOptions = {}): DerivedRules {
  const root = resolve(options.referenceRoot ?? DEFAULT_REFERENCE_ROOT);
  const warnings: string[] = [];

  const tsConfig = jsonReference(root, TS_CONFIG_FILE);
  const compilerOptions = stringMap(tsConfig["compilerOptions"]);
  const { alias, strictFlags } = parseTsConfig(compilerOptions);
  if (alias === null) {
    warnings.push(`import alias: no path alias is configured in ${TS_CONFIG_FILE}, so no alias rule could be derived`);
  }
  if (strictFlags.length === 0) {
    warnings.push(`compiler options: no strictness switch is enabled in ${TS_CONFIG_FILE}`);
  }

  const packageJson = jsonReference(root, PACKAGE_JSON_FILE);
  // The two script names the T06 gate runs; the rule only claims the ones the app actually defines.
  const declaredScripts = stringMap(packageJson["scripts"]);
  const scripts = {
    typecheck: "typecheck" in declaredScripts,
    test: "test" in declaredScripts,
  };

  const typesModule = importSpecifier(TYPES_FILE, alias);
  const types = parseTypes(readReference(root, TYPES_FILE), typesModule);
  if (types.length === 0) {
    warnings.push(`shared types: no exported interface was found in ${TYPES_FILE}, so nothing could be derived about the model`);
  }

  const operationsModule = importSpecifier(OPERATIONS_FILE, alias);
  const operations = parseOperations(readReference(root, OPERATIONS_FILE), operationsModule);
  if (operations.length === 0) {
    warnings.push(`GraphQL operations: no exported document was found in ${OPERATIONS_FILE}, so the reuse rule could not be derived`);
  }

  const fixtureText = readReference(root, FIXTURE_DATA_FILE);
  const { breakpoints, warning: breakpointWarning } = toBreakpointRule(parseImages(fixtureText));
  if (breakpointWarning !== null) warnings.push(breakpointWarning);
  if (breakpoints === null && breakpointWarning === null) {
    warnings.push(
      `responsive images: no dimensioned image URL was found in ${FIXTURE_DATA_FILE}, so no breakpoint table could be derived`,
    );
  }

  const handlers = parseHandlers(readReference(root, HANDLER_FILE));
  if (handlers.length === 0) {
    warnings.push(`mock handlers: no resolver was found in ${HANDLER_FILE}, so the do-not-redefine rule could not be derived`);
  }

  const exemplarDirs = options.exemplarDirs ?? DEFAULT_EXEMPLAR_DIRS;
  const exemplars: ExemplarFile[] = [];
  for (const dir of [...exemplarDirs].sort()) {
    const abs = join(root, dir);
    if (!existsSync(abs)) continue;
    for (const name of readdirSync(abs).sort()) {
      if (!/\.tsx$/.test(name)) continue;
      const rel = `${dir}/${name}`;
      const raw = readReference(root, rel);
      const truncated = raw.length > MAX_EXEMPLAR_CHARS;
      exemplars.push({
        path: rel,
        module: importSpecifier(rel, alias),
        contents: truncated ? `${raw.slice(0, MAX_EXEMPLAR_CHARS)}\n… truncated …\n` : raw,
        truncated,
      });
    }
  }

  const typenames = parseTypenames(exemplars);
  if (typenames.length === 0) {
    warnings.push(`fixture discriminator: no mock object in the exemplars carries a __typename, so that convention could not be derived`);
  }
  if (exemplars.length === 0) {
    warnings.push(
      `exemplars: no component or test files were found under ${[...exemplarDirs].sort().join(", ")}, so the generator has no reference implementation to follow`,
    );
  }

  const sources = [
    TS_CONFIG_FILE,
    PACKAGE_JSON_FILE,
    TYPES_FILE,
    OPERATIONS_FILE,
    FIXTURE_DATA_FILE,
    HANDLER_FILE,
    ...exemplars.map((exemplar) => exemplar.path),
  ];

  return {
    referenceRoot: root,
    alias,
    types,
    operations,
    handlers,
    typenames,
    breakpoints,
    strictFlags,
    scripts,
    exemplars,
    sources,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Rendering — the one place rule prose is written
// ---------------------------------------------------------------------------

function andList(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function formatRange(tier: BreakpointTier): string {
  if (tier.minPx === null && tier.maxPx !== null) return `<= ${tier.maxPx}px`;
  if (tier.minPx !== null && tier.maxPx === null) return `>= ${tier.minPx}px`;
  if (tier.minPx !== null && tier.maxPx !== null) return `${tier.minPx}px-${tier.maxPx}px`;
  return "any width";
}
/**
 * The hard-rules block, shared verbatim by all three prompt builders.
 *
 * Everything a model must not get wrong is stated once, in the imperative, with the payload quoted
 * from the file it came from and the file named alongside it.
 */
export function renderRules(rules: DerivedRules): string {
  const lines: string[] = [
    "Hard rules — read from the project's own boilerplate at prompt-build time, so they are facts about these files, not preferences:",
  ];

  if (rules.alias !== null) {
    lines.push(
      `- Path alias: ${rules.alias.prefix} maps to ${rules.alias.target} in \`${TS_CONFIG_FILE}\`. Import shared modules through ${rules.alias.prefix}, never with \`../\` hops.`,
    );
  }

  for (const type of rules.types) {
    const fieldNames = type.fields.map((field) => field.name).join(", ");
    lines.push(
      `- Shared types: \`${type.name}\` is exported by \`${type.module}\` — fields: ${fieldNames || "(none declared)"}. Import it with \`import type { ${type.name} } from "${type.module}"\`; do not redefine, rename or widen it.`,
    );
  }

  if (rules.operations.length > 0) {
    const exports = rules.operations.map(
      (operation) => `${operation.exportName} (${operation.kind} ${operation.operationName})`,
    );
    lines.push(
      `- GraphQL operations: \`${rules.operations[0]?.module ?? ""}\` already exports ${andList(exports)}. Import them from that module and do not redefine a query or mutation document; never create a second \`gql\` document for an operation that exists.`,
    );
  }

  for (const operation of rules.operations.filter((candidate) => candidate.variables.length > 0)) {
    const variables = operation.variables.map((variable) => `$${variable.name}: ${variable.type}`).join(", ");
    const ask =
      operation.kind === "mutation"
        ? "A form has to supply exactly those variables."
        : "Call it with exactly those variables.";
    lines.push(
      `- Operation variables: ${operation.exportName} (${operation.kind} ${operation.operationName}) takes ${variables}. ${ask}`,
    );
  }

  if (rules.handlers.length > 0) {
    const resolvers = rules.handlers.map((handler) => `${handler.kind} ${handler.operationName}`);
    lines.push(
      `- Mock handlers: \`${importSpecifier(HANDLER_FILE, rules.alias)}\` already answers ${andList(resolvers)}. The in-memory MSW store is the database: do not redefine a handler for an operation that already exists, and do not add a fetch layer.`,
    );
  }

  for (const type of rules.types) {
    if (!rules.typenames.includes(type.name)) continue;
    lines.push(
      `- Fixtures: any mock object standing in for \`${type.name}\` must carry \`__typename: "${type.name}"\` — the convention the existing test exemplar uses, without which Apollo reads the response as a cache miss.`,
    );
  }
  for (const typename of rules.typenames.filter((name) => !rules.types.some((type) => type.name === name))) {
    lines.push(
      `- Fixtures: mock objects for \`${typename}\` must carry \`__typename: "${typename}"\`, matching the existing exemplar.`,
    );
  }

  if (rules.breakpoints !== null) {
    const tiers = rules.breakpoints.tiers.map(
      (tier) => `the \`${tier.field}\` image (${tier.width}x${tier.height}) for viewports ${formatRange(tier)}`,
    );
    lines.push(`- Responsive images: choose the field by viewport width — ${tiers.join("; ")}.`);
  }

  const gate = [
    rules.scripts.typecheck ? "npm run typecheck" : null,
    rules.scripts.test ? "npm run test" : null,
  ].filter((name): name is string => name !== null);
  lines.push(
    `- Compiler options: \`${TS_CONFIG_FILE}\` enables ${rules.strictFlags.length > 0 ? rules.strictFlags.join(", ") : "(nothing recorded)"}.${gate.length > 0 ? ` Generated code must pass ${gate.join(" and ")} inside the generated app with these settings untouched.` : ""}`,
  );

  if (rules.warnings.length > 0) {
    lines.push("Rules that could not be derived from the reference files — do not assume a substitute:");
    for (const warning of rules.warnings) lines.push(`- ${warning}`);
  }

  lines.push(`(Derived from: ${rules.sources.join(", ")}.)`);
  return lines.join("\n");
}

/** True for the file names this agent treats as tests. */
export function isTestPath(filePath: string): boolean {
  return /\.test\.tsx?$/.test(filePath) || filePath.includes("__tests__");
}

/**
 * The few-shot block.
 *
 * Component work gets the component exemplar; test work gets both, because the test exemplar is the
 * only place the mocking pattern is visible. Files are quoted as they are, truncation included.
 */
export function renderExemplars(rules: DerivedRules, taskFile: string): string {
  const wantsTests = isTestPath(taskFile);
  const chosen = rules.exemplars.filter((exemplar) =>
    wantsTests ? true : !isTestPath(exemplar.path),
  );
  if (chosen.length === 0) return "";
  const blocks = chosen.map(
    (exemplar) => `\`\`tsx title="${exemplar.path}"\n${exemplar.contents}\`\`\``,
  );
  return [
    wantsTests
      ? "Reference implementations from the boilerplate. Follow their shape — these files compile and pass today:"
      : "Reference implementation from the boilerplate. Follow its shape — it compiles and passes today:",
    ...blocks,
  ].join("\n\n");
}
