export type DetectedFramework = 'vitest' | 'jest' | 'mocha' | 'flutter' | 'dart' | 'pytest' | 'npm' | 'none';

export interface TestCommandExecution {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

// A test/install invocation as data — bin + argv, never a shell string. CommandExecutor passes this
// straight to execFile, so there is no shell to inject into no matter what a file path contains.
export interface RunSpec {
  bin: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}

export interface CodebaseTestRunResult {
  runner: DetectedFramework;
  testCommand: string | null;
  impactedTestFiles?: string[];
  installExecution?: TestCommandExecution;
  testExecution?: TestCommandExecution;
  passed: boolean;
  isDiffScoped: boolean;
  statusMessage?: string;
}

export interface AdapterContext {
  repoPath: string;
  // Changed files already filtered of noise (.md, lockfiles) — used for impact matching and bypass messages.
  changedFiles: string[];
  impactedTestFiles: string[];
}

export interface PlanResult {
  // null spec means "nothing to run" — the orchestrator returns statusMessage as a bypass result
  // without touching dependency installation at all.
  spec: RunSpec | null;
  isDiffScoped: boolean;
  bypassMessage?: string;
}

// One implementation per test ecosystem. Diff-scoping and the "bypass when no pre-existing test matches
// the diff" behavior live inside plan() as part of the contract every adapter must honor — that's what
// prevents a framework silently falling out of parity with the others (which is what happened before this
// refactor: mocha and the generic npm fallback quietly never got diff-scoping because nothing forced them to).
export interface TestFrameworkAdapter {
  readonly id: DetectedFramework;

  detect(repoPath: string): boolean;

  // Filesystem marker indicating dependencies are already installed (node_modules, .dart_tool, .venv).
  depsMarkerPath(repoPath: string): string | null;

  // The install command run when depsMarkerPath is missing or a manifest file changed.
  defaultInstallSpec(repoPath: string): RunSpec | null;

  plan(ctx: AdapterContext): PlanResult;

  // Extra packages this framework needs beyond defaultInstallSpec (e.g. Jest needs ts-jest/@types/jest
  // installed via --no-save even when they aren't declared in the repo's package.json). Optional — only
  // Node frameworks with an npx-resolved toolchain need this.
  toolingPackages?(repoPath: string): string[];
  isToolingSatisfied?(repoPath: string): boolean;

  // Strips framework-specific noise (e.g. Jest/ts-jest's own warnings) from stderr for display. Optional,
  // and scoped to the adapter that knows what its own noise looks like — never applied globally, so it
  // can never accidentally eat a real error line from a different tool.
  postProcessStderr?(stderr: string): string;
}
