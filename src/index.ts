import * as path from 'path';
import { ConfigLoader } from './core/Config';
import { Logger } from './core/Logger';
import { WorkspaceManager } from './repository/WorkspaceManager';
import { GitClient } from './repository/GitClient';
import { RepositoryManager } from './repository/RepositoryManager';
import { JobExecutor } from './core/JobExecutor';
import { UpdateJob } from './jobs/UpdateJob';
import { startServer } from './api/server';

async function main() {
  const logger = Logger.getInstance();
  logger.info('====================================================');
  logger.info('   AI Agent Repository Automation Engine (Phase 3)  ');
  logger.info('====================================================');

  try {
    // 1. Load Configuration
    const configLoader = ConfigLoader.getInstance();
    const config = configLoader.getConfig();
    logger.info(`Loaded configuration from ${config.configPath}`);
    logger.info(`Workspace Root: ${config.workspaceDir}`);

    // 2. Prepare Workspace Directory Structure
    const workspaceManager = new WorkspaceManager(config.workspaceDir);
    workspaceManager.prepareWorkspace();

    // 3. Attach file logging sink
    const logFilePath = path.join(workspaceManager.getLogsDir(), 'engine.log');
    logger.setLogFile(logFilePath);
    logger.info(`File logging active at ${logFilePath}`);

    // 4. Initialize Core Components
    const gitClient = new GitClient({
      sshKeyPath: config.sshKeyPath,
      strictHostKeyChecking: config.strictHostKeyChecking,
    });
    const repoManager = new RepositoryManager(gitClient, workspaceManager);
    const executor = new JobExecutor();

    // 5. Start Express REST API Backend Server
    const PORT = parseInt(process.env.PORT || '3001', 10);
    startServer(repoManager, workspaceManager, executor, gitClient, PORT);

    // 6. Initial Sync Cycle for all Configured Repositories
    const repositoryEntries = Object.entries(config.repositories);
    logger.info(`Found ${repositoryEntries.length} configured repositories: ${Object.keys(config.repositories).join(', ')}`);

    for (const [repoId, repoCfg] of repositoryEntries) {
      logger.info(`Queueing initial UpdateJob for repository '${repoId}'...`);
      const updateJob = new UpdateJob(
        repoId,
        repoCfg.ssh,
        repoCfg.defaultBranch || 'main',
        repoManager,
        workspaceManager
      );

      await executor.execute(updateJob);
    }

    logger.info('Initial Sync Cycle Completed.');
    logger.info('REST API Backend with Commit History & Diff Explorer is ready.');
    logger.info('Periodic background sync is disabled. Repository updates are handled on-demand.');

  } catch (err: any) {
    logger.error('Fatal initialization error in Repository Automation Engine:', err);
    process.exit(1);
  }
}

// Handle unexpected signals gracefully
process.on('SIGINT', () => {
  Logger.getInstance().info('Shutdown signal received (SIGINT). Exiting Engine.');
  process.exit(0);
});

process.on('SIGTERM', () => {
  Logger.getInstance().info('Shutdown signal received (SIGTERM). Exiting Engine.');
  process.exit(0);
});

main();
