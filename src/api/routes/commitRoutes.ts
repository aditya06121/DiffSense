import { Router, Request, Response } from 'express';
import { CommitService } from '../../services/CommitService';
import { DiffService } from '../../services/DiffService';
import { GeminiAnalysisService } from '../../services/GeminiAnalysisService';

import { GeminiTestGeneratorService } from '../../services/GeminiTestGeneratorService';
import { TestScenarioService } from '../../services/TestScenarioService';
import { PRDGeneratorService } from '../../services/PRDGeneratorService';
import { AssetCacheService } from '../../services/AssetCacheService';

export function createCommitRouter(
  commitService: CommitService,
  diffService: DiffService,
  geminiAnalysisService?: GeminiAnalysisService,
  geminiTestGeneratorService?: GeminiTestGeneratorService,
  prdGeneratorService?: PRDGeneratorService,
  testScenarioService?: TestScenarioService,
  assetCacheService?: AssetCacheService
): Router {
  const router = Router({ mergeParams: true });

  // GET /api/repositories/:id/commits - Fetch commit history for a repository & branch
  router.get('/:id/commits', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const branch = req.query.branch ? String(req.query.branch) : undefined;
      const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 30;

      const result = await commitService.getCommitHistory(id, branch, page, limit);
      res.json({ success: true, repoId: id, branch: branch || 'HEAD', ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/repositories/:id/commits/:sha/diff - Fetch first-parent diff details for a commit
  router.get('/:id/commits/:sha/diff', async (req: Request, res: Response) => {
    try {
      const { id, sha } = req.params;
      const details = await diffService.getMergeCommitDetails(id, sha);
      res.json({ success: true, repoId: id, ...details });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/repositories/:id/commits/:sha/analyze - Trigger AI Code Analysis for a commit
  router.post('/:id/commits/:sha/analyze', async (req: Request, res: Response) => {
    try {
      const { id, sha } = req.params;
      const { forceRefresh } = req.body || {};
      const shouldForce = forceRefresh === true || req.query.forceRefresh === 'true';

      if (!geminiAnalysisService) {
        return res.status(500).json({ success: false, error: 'GeminiAnalysisService is not initialized.' });
      }
      const result = await geminiAnalysisService.analyzeMergeCommit(id, sha, shouldForce);
      res.json({ repoId: id, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/repositories/:id/commits/:sha/cache-status - Inspect cached assets on the -tests branch
  router.get('/:id/commits/:sha/cache-status', async (req: Request, res: Response) => {
    try {
      const { id, sha } = req.params;
      const diffData = await diffService.getMergeCommitDetails(id, sha);
      const isFirstParent = (diffData.parents && diffData.parents.length > 1);

      if (!assetCacheService || !isFirstParent) {
        return res.json({
          success: true,
          repoId: id,
          commitSha: sha,
          isFirstParent: !!isFirstParent,
          cached: { prd: false, existingTests: false, aiTests: false, scenarios: false },
        });
      }

      const meta = assetCacheService.parsePrMetadata(diffData.message, diffData.shortSha);
      const prdPath = assetCacheService.getAssetPath(meta.prKey, 'prd');
      const testsPath = assetCacheService.getAssetPath(meta.prKey, 'existing-tests');
      const aiTestsPath = assetCacheService.getAssetPath(meta.prKey, 'ai-tests');
      const scenariosPath = assetCacheService.getAssetPath(meta.prKey, 'scenarios');

      const [prdCached, existingTestsCached, aiTestsCached, scenariosCached] = await Promise.all([
        assetCacheService.getCachedAsset(id, meta.testBranch, prdPath),
        assetCacheService.getCachedAsset(id, meta.testBranch, testsPath),
        assetCacheService.getCachedAsset(id, meta.testBranch, aiTestsPath),
        assetCacheService.getCachedAsset(id, meta.testBranch, scenariosPath),
      ]);

      res.json({
        success: true,
        repoId: id,
        commitSha: sha,
        isFirstParent: true,
        prNumber: meta.prNumber,
        testBranch: meta.testBranch,
        cached: {
          prd: !!prdCached,
          existingTests: !!existingTestsCached,
          aiTests: !!aiTestsCached,
          scenarios: !!scenariosCached,
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/repositories/:id/commits/:sha/run-existing-tests - Run pre-existing codebase tests (Stage 1)
  router.post('/:id/commits/:sha/run-existing-tests', async (req: Request, res: Response) => {
    try {
      const { id, sha } = req.params;
      const { customInstructions, forceRefresh } = req.body || {};
      const shouldForce = forceRefresh === true || req.query.forceRefresh === 'true';

      if (!geminiTestGeneratorService) {
        return res.status(500).json({ success: false, error: 'GeminiTestGeneratorService is not initialized.' });
      }

      const result = await geminiTestGeneratorService.runExistingTests(id, sha, customInstructions, shouldForce);
      res.json(result);
    } catch (err: any) {
      const isRestricted = err.message && err.message.includes('restricted to First-Parent');
      res.status(isRestricted ? 400 : 500).json({ success: false, error: err.message, isFirstParentRequired: isRestricted });
    }
  });

  // POST /api/repositories/:id/commits/:sha/test-scenarios - Propose candidate test scenarios (no code written yet)
  router.post('/:id/commits/:sha/test-scenarios', async (req: Request, res: Response) => {
    try {
      const { id, sha } = req.params;
      const { forceRefresh } = req.body || {};
      const shouldForce = forceRefresh === true || req.query.forceRefresh === 'true';

      if (!testScenarioService) {
        return res.status(500).json({ success: false, error: 'TestScenarioService is not initialized.' });
      }

      const result = await testScenarioService.proposeScenariosForCommit(id, sha, shouldForce);
      res.json({ success: true, repoId: id, ...result });
    } catch (err: any) {
      const isRestricted = err.message && err.message.includes('restricted to First-Parent');
      res.status(isRestricted ? 400 : 500).json({ success: false, error: err.message, isFirstParentRequired: isRestricted });
    }
  });

  // POST /api/repositories/:id/commits/:sha/generate-tests - Write & run tests for user-selected scenarios (Stage 2),
  // committing the result to a dedicated "<sourceBranch>-tests" branch.
  router.post('/:id/commits/:sha/generate-tests', async (req: Request, res: Response) => {
    try {
      const { id, sha } = req.params;
      const { sourceBranch, scenarios, forceRefresh } = req.body || {};
      const shouldForce = forceRefresh === true || req.query.forceRefresh === 'true';

      if (!geminiTestGeneratorService) {
        return res.status(500).json({ success: false, error: 'GeminiTestGeneratorService is not initialized.' });
      }
      if (!sourceBranch) {
        return res.status(400).json({ success: false, error: '"sourceBranch" is required to name the dedicated tests branch.' });
      }
      if (!Array.isArray(scenarios) || scenarios.length === 0) {
        return res.status(400).json({ success: false, error: 'At least one selected "scenarios" entry is required.' });
      }

      const result = await geminiTestGeneratorService.generateAndRunTests(id, sha, sourceBranch, scenarios, shouldForce);
      res.json(result);
    } catch (err: any) {
      const isRestricted = err.message && err.message.includes('restricted to First-Parent');
      res.status(isRestricted ? 400 : 500).json({ success: false, error: err.message, isFirstParentRequired: isRestricted });
    }
  });

  // POST /api/repositories/:id/commits/:sha/prd - Generate Product Requirement Document (PRD)
  router.post('/:id/commits/:sha/prd', async (req: Request, res: Response) => {
    try {
      const { id, sha } = req.params;
      const { forceRefresh } = req.body || {};
      const shouldForce = forceRefresh === true || req.query.forceRefresh === 'true';

      if (!prdGeneratorService) {
        return res.status(500).json({ success: false, error: 'PRDGeneratorService is not initialized.' });
      }
      const prdData = await prdGeneratorService.generatePRD(id, sha, shouldForce);
      res.json({ success: true, ...prdData });
    } catch (err: any) {
      const isRestricted = err.message && err.message.includes('restricted to First-Parent');
      res.status(isRestricted ? 400 : 500).json({ success: false, error: err.message, isFirstParentRequired: isRestricted });
    }
  });

  // GET /api/repositories/:id/commits/:sha/prd/pdf - Download PRD PDF Report
  router.get('/:id/commits/:sha/prd/pdf', async (req: Request, res: Response) => {
    try {
      const { id, sha } = req.params;
      if (!prdGeneratorService) {
        return res.status(500).json({ success: false, error: 'PRDGeneratorService is not initialized.' });
      }
      const prdData = await prdGeneratorService.generatePRD(id, sha, false);
      const pdfBuffer = await prdGeneratorService.generatePdfBuffer(prdData);

      const filename = `PRD-${id}-${sha.substring(0, 7)}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(pdfBuffer);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
