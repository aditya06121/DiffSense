import { Router, Request, Response } from 'express';
import { DiffService } from '../../services/DiffService';
import { GeminiAnalysisService } from '../../services/GeminiAnalysisService';
import { GeminiTestGeneratorService } from '../../services/GeminiTestGeneratorService';
import { TestScenarioService } from '../../services/TestScenarioService';

export function createCompareRouter(
  diffService: DiffService,
  geminiAnalysisService?: GeminiAnalysisService,
  geminiTestGeneratorService?: GeminiTestGeneratorService,
  testScenarioService?: TestScenarioService
): Router {
  const router = Router({ mergeParams: true });

  // GET /api/repositories/:id/compare?base=<branch>&compare=<branch> - Fetch diff between two branches
  router.get('/:id/compare', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const base = req.query.base ? String(req.query.base) : undefined;
      const compare = req.query.compare ? String(req.query.compare) : undefined;

      if (!base || !compare) {
        return res.status(400).json({ success: false, error: 'Both "base" and "compare" query params are required.' });
      }

      const details = await diffService.getBranchComparisonDetails(id, base, compare);
      res.json({ success: true, repoId: id, ...details });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/repositories/:id/compare/analyze - Trigger AI Code Analysis for a branch comparison
  router.post('/:id/compare/analyze', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { base, compare, forceRefresh } = req.body || {};
      const shouldForce = forceRefresh === true || req.query.forceRefresh === 'true';

      if (!base || !compare) {
        return res.status(400).json({ success: false, error: 'Both "base" and "compare" fields are required.' });
      }
      if (!geminiAnalysisService) {
        return res.status(500).json({ success: false, error: 'GeminiAnalysisService is not initialized.' });
      }

      const result = await geminiAnalysisService.analyzeBranchComparison(id, base, compare, shouldForce);
      res.json({ repoId: id, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/repositories/:id/compare/run-existing-tests - Run pre-existing codebase tests against the compare branch (Stage 1)
  router.post('/:id/compare/run-existing-tests', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { base, compare, customInstructions } = req.body || {};

      if (!base || !compare) {
        return res.status(400).json({ success: false, error: 'Both "base" and "compare" fields are required.' });
      }
      if (!geminiTestGeneratorService) {
        return res.status(500).json({ success: false, error: 'GeminiTestGeneratorService is not initialized.' });
      }

      const result = await geminiTestGeneratorService.runExistingTestsForBranchComparison(id, base, compare, customInstructions);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/repositories/:id/compare/test-scenarios - Propose candidate test scenarios for a branch comparison
  router.post('/:id/compare/test-scenarios', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { base, compare } = req.body || {};

      if (!base || !compare) {
        return res.status(400).json({ success: false, error: 'Both "base" and "compare" fields are required.' });
      }
      if (!testScenarioService) {
        return res.status(500).json({ success: false, error: 'TestScenarioService is not initialized.' });
      }

      const result = await testScenarioService.proposeScenariosForBranchComparison(id, base, compare);
      res.json({ success: true, repoId: id, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/repositories/:id/compare/generate-tests - Write & run tests for user-selected scenarios against the
  // compare branch (Stage 2), committing the result to a dedicated "<compareBranch>-tests" branch.
  router.post('/:id/compare/generate-tests', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { base, compare, scenarios } = req.body || {};

      if (!base || !compare) {
        return res.status(400).json({ success: false, error: 'Both "base" and "compare" fields are required.' });
      }
      if (!geminiTestGeneratorService) {
        return res.status(500).json({ success: false, error: 'GeminiTestGeneratorService is not initialized.' });
      }
      if (!Array.isArray(scenarios) || scenarios.length === 0) {
        return res.status(400).json({ success: false, error: 'At least one selected "scenarios" entry is required.' });
      }

      const result = await geminiTestGeneratorService.generateAndRunTestsForBranchComparison(id, base, compare, scenarios);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
