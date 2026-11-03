import * as fs from 'fs';
import * as path from 'path';
import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import { RepositoryManager } from '../repository/RepositoryManager';
import { WorkspaceManager } from '../repository/WorkspaceManager';
import { GitClient } from '../repository/GitClient';
import { JobExecutor } from '../core/JobExecutor';
import { CommitService } from '../services/CommitService';
import { DiffService } from '../services/DiffService';
import { GeminiAnalysisService } from '../services/GeminiAnalysisService';
import { GeminiTestGeneratorService } from '../services/GeminiTestGeneratorService';
import { TestScenarioService } from '../services/TestScenarioService';
import { PRDGeneratorService } from '../services/PRDGeneratorService';
import { AssetCacheService } from '../services/AssetCacheService';
import { createRepositoryRouter } from './routes/repositoryRoutes';
import { createJobRouter } from './routes/jobRoutes';
import { createCommitRouter } from './routes/commitRoutes';
import { createCompareRouter } from './routes/compareRoutes';
import { Logger } from '../core/Logger';

export function createApiServer(
  repoManager: RepositoryManager,
  workspaceManager: WorkspaceManager,
  executor: JobExecutor,
  gitClient: GitClient
): Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // Instantiate services
  const commitService = new CommitService(gitClient, workspaceManager);
  const diffService = new DiffService(gitClient, workspaceManager);
  const geminiAnalysisService = new GeminiAnalysisService(diffService);
  const assetCacheService = new AssetCacheService(gitClient, workspaceManager, repoManager);
  const geminiTestGeneratorService = new GeminiTestGeneratorService(
    diffService,
    geminiAnalysisService,
    workspaceManager,
    repoManager,
    executor,
    assetCacheService
  );
  const prdGeneratorService = new PRDGeneratorService(diffService, assetCacheService);
  const testScenarioService = new TestScenarioService(
    diffService,
    geminiAnalysisService,
    workspaceManager,
    repoManager,
    executor,
    assetCacheService
  );

  // Health check endpoint
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'UP',
      service: 'AI Agent Repository Automation Engine',
      version: '3.0.0',
      timestamp: new Date().toISOString(),
    });
  });

  // Mount API routers
  app.use('/api/repositories', createRepositoryRouter(repoManager, workspaceManager, executor));
  app.use('/api/repositories', createCommitRouter(commitService, diffService, geminiAnalysisService, geminiTestGeneratorService, prdGeneratorService, testScenarioService, assetCacheService));
  app.use('/api/repositories', createCompareRouter(diffService, geminiAnalysisService, geminiTestGeneratorService, testScenarioService));
  app.use('/api/jobs', createJobRouter(executor, repoManager, workspaceManager));

  // Serve static Dashboard UI (React SPA built into web/dist)
  const webDistPath = path.join(process.cwd(), 'web', 'dist');
  if (fs.existsSync(webDistPath)) {
    app.use(express.static(webDistPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(webDistPath, 'index.html'));
    });
  } else {
    app.get('/', (_req: Request, res: Response) => {
      res.status(404).send('Web UI build not found. Please run "npm run build" to build the React application.');
    });
  }

  return app;
}

export function startServer(
  repoManager: RepositoryManager,
  workspaceManager: WorkspaceManager,
  executor: JobExecutor,
  gitClient: GitClient,
  port: number = 3001
) {
  const logger = Logger.getInstance();
  const app = createApiServer(repoManager, workspaceManager, executor, gitClient);

  const server = app.listen(port, () => {
    logger.info(`🚀 REST API Backend listening on http://localhost:${port}`);
    logger.info(`   - Repositories API: http://localhost:${port}/api/repositories`);
    logger.info(`   - Commits & Diff Explorer API: http://localhost:${port}/api/repositories/:id/commits`);
    logger.info(`   - Jobs API: http://localhost:${port}/api/jobs`);
    logger.info(`   - Health Check: http://localhost:${port}/api/health`);
  });

  return server;
}
