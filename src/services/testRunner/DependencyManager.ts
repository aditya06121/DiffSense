import * as fs from 'fs';
import { Logger } from '../../core/Logger';
import { CommandExecutor } from './CommandExecutor';
import { RunSpec, TestCommandExecution, TestFrameworkAdapter } from './types';

const MANIFEST_CHANGE_PATTERN =
  /package\.json|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|pubspec\.yaml|pubspec\.lock|requirements\.txt|setup\.py|pytest\.ini/i;

function toolingInstallSpec(repoPath: string, packages: string[]): RunSpec {
  return {
    bin: 'npm',
    args: ['install', '--no-save', '--legacy-peer-deps', '--no-audit', ...packages],
    cwd: repoPath,
  };
}

// Owns every "do we need to install something, and what" decision, separated from both the adapters
// (which only describe *what* an install looks like) and the executor (which only knows how to run one).
export class DependencyManager {
  private logger = Logger.getInstance();

  constructor(private executor: CommandExecutor) {}

  public hasManifestChange(changedFiles: string[]): boolean {
    return (changedFiles || []).some((f) => MANIFEST_CHANGE_PATTERN.test(f));
  }

  private depsAppearInstalled(adapter: TestFrameworkAdapter, repoPath: string): boolean {
    const marker = adapter.depsMarkerPath(repoPath);
    if (!marker) return true;
    return fs.existsSync(marker);
  }

  // The full dependency install (npm install / pip install / flutter pub get / ...), run only when the
  // marker dir is missing or a manifest file changed in this diff.
  public async ensureDeps(
    adapter: TestFrameworkAdapter,
    repoPath: string,
    changedFiles: string[],
    installTimeoutMs: number
  ): Promise<TestCommandExecution | undefined> {
    const installSpec = adapter.defaultInstallSpec(repoPath);
    if (!installSpec) return undefined;

    const installedAlready = this.depsAppearInstalled(adapter, repoPath);
    const manifestChanged = this.hasManifestChange(changedFiles);

    if (installedAlready && !manifestChanged) {
      this.logger.info(
        `[DependencyManager] Dependency cache is warm and valid for ${adapter.id} (manifests unchanged). Skipping full dependency install.`
      );
      return undefined;
    }

    this.logger.info(
      `[DependencyManager] Dependencies need installation for ${adapter.id} (manifest changed or deps missing). Running: "${installSpec.bin} ${installSpec.args.join(' ')}"`
    );
    return this.executor.run(installSpec, installTimeoutMs);
  }

  // Proactive, best-effort provisioning of framework-specific tooling (e.g. ts-jest) that a plain
  // `npm install` wouldn't add because it isn't declared in the repo's own package.json.
  public async ensureToolingProactively(
    adapter: TestFrameworkAdapter,
    repoPath: string,
    installTimeoutMs: number
  ): Promise<TestCommandExecution | undefined> {
    if (!adapter.toolingPackages || !adapter.isToolingSatisfied) return undefined;
    if (adapter.isToolingSatisfied(repoPath)) return undefined;

    this.logger.info(`[DependencyManager] Tooling missing for ${adapter.id}. Auto-provisioning via npm install --no-save...`);
    return this.executor.run(toolingInstallSpec(repoPath, adapter.toolingPackages(repoPath)), installTimeoutMs);
  }

  // Called after a test run fails with a "missing dependency"-shaped error — reinstalls unconditionally
  // (we already know from the failure that something's missing, so there's no marker check to consult).
  public async forceReinstall(
    adapter: TestFrameworkAdapter,
    repoPath: string,
    installTimeoutMs: number
  ): Promise<TestCommandExecution | undefined> {
    if (adapter.toolingPackages) {
      return this.executor.run(toolingInstallSpec(repoPath, adapter.toolingPackages(repoPath)), installTimeoutMs);
    }
    const installSpec = adapter.defaultInstallSpec(repoPath);
    if (!installSpec) return undefined;
    return this.executor.run(installSpec, installTimeoutMs);
  }
}
