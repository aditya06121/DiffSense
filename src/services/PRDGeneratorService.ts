import PDFDocument from 'pdfkit';
import { GoogleGenAI } from '@google/genai';
import { DiffService, MergeCommitDetails } from './DiffService';
import { AssetCacheService } from './AssetCacheService';
import { MarkdownPdfRenderer } from './MarkdownPdfRenderer';
import { ConfigLoader } from '../core/Config';
import { Logger } from '../core/Logger';

export interface PRDData {
  repoId: string;
  commitSha: string;
  shortSha: string;
  authorName: string;
  commitMessage: string;
  prNumber?: string | null;
  summary: MergeCommitDetails['summary'];
  prdMarkdown: string;
  createdAt: string;
  fromCache?: boolean;
  cachedOnBranch?: string;
  cachePath?: string;
}

export class PRDGeneratorService {
  private diffService: DiffService;
  private assetCacheService?: AssetCacheService;
  private logger = Logger.getInstance();

  constructor(diffService: DiffService, assetCacheService?: AssetCacheService) {
    this.diffService = diffService;
    this.assetCacheService = assetCacheService;
  }

  public async generatePRD(repoId: string, sha: string, forceRefresh = false): Promise<PRDData> {
    this.logger.info(`[PRDGeneratorService] Generating PRD for repo '${repoId}', commit '${sha}'...`);

    // 1. Get first-parent diff details
    const diffData = await this.diffService.getMergeCommitDetails(repoId, sha);

    // 2. Enforce First-Parent PR Merge requirement
    const isFirstParent = (diffData.parents && diffData.parents.length > 1);
    if (!isFirstParent) {
      throw new Error(`PRD Generation is restricted to First-Parent PR Merge commits only. Commit '${diffData.shortSha}' is an intermediate commit.`);
    }

    // 3. Check for cached PRD on the dedicated test branch
    let prKey = `commit-${diffData.shortSha}`;
    let prNumber: string | null = null;
    let testBranch = 'release-patch-tests';
    let assetPath = `automation-assets/${prKey}-prd.json`;

    if (this.assetCacheService) {
      const meta = this.assetCacheService.parsePrMetadata(diffData.message, diffData.shortSha);
      prKey = meta.prKey;
      prNumber = meta.prNumber;
      testBranch = meta.testBranch;
      assetPath = this.assetCacheService.getAssetPath(prKey, 'prd');

      if (!forceRefresh) {
        const cached = await this.assetCacheService.getCachedAsset<PRDData>(repoId, testBranch, assetPath);
        if (cached) {
          this.logger.info(`[PRDGeneratorService] Cache HIT! Returning cached PRD for ${prKey} on ${testBranch}.`);
          return cached;
        }
      }
    }

    // 2. Fetch Gemini API key
    const config = ConfigLoader.getInstance().getConfig();
    const apiKey = config.geminiApiKey;

    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured in environment or ConfigLoader.');
    }

    // 3. Build diff context for PRD generation
    let diffContext = `Repository ID: ${repoId}\nCommit SHA: ${diffData.commitSha}\nAuthor: ${diffData.authorName}\nCommit Message: ${diffData.message}\nTotal Files Changed: ${diffData.summary.totalFiles} (+${diffData.summary.totalAdditions} -${diffData.summary.totalDeletions})\n\n`;

    diffData.files.forEach((f) => {
      diffContext += `--- FILE: ${f.newPath || f.oldPath} (${f.type}, +${f.additions} -${f.deletions}) ---\n`;
      f.hunks.forEach((h) => {
        diffContext += `${h.header}\n`;
        h.lines.forEach((l) => {
          const sign = l.type === 'ADDITION' ? '+' : l.type === 'DELETION' ? '-' : ' ';
          diffContext += `${sign} ${l.content}\n`;
        });
      });
      diffContext += '\n';
    });

    if (diffContext.length > 45000) {
      diffContext = diffContext.substring(0, 45000) + '\n\n... [Diff truncated for PRD context limit] ...';
    }

    const promptText = `You are a Principal Product Manager & Senior Software Architect. Analyze the following Git merge commit diff and patch changelog to write a comprehensive, highly formal Product Requirement Document (PRD) and Technical Specification.

Structure your PRD into these exact Markdown sections:

# Product Requirement Document (PRD) & Technical Specification

## 1. Executive Summary & Business Intent
Provide a clear high-level summary of what problem this feature solves, its business value, and target user persona.

## 2. User Stories & Acceptance Criteria
List key user stories in standard format ("As a... I want to... So that...") along with measurable acceptance criteria.

## 3. Technical Architecture & System Changes
Detail the code modules, classes, structural modifications, data flows, or dependency changes introduced.

## 4. API & Interface Specifications
Specify any REST endpoints, UI component contracts, parameters, or schema models added or modified.

## 5. Security, Performance & Risk Assessment
Highlight potential edge cases, security implications, breaking changes, or performance bounds to monitor.

## 6. Verification & Test Rollout Plan
Provide testing strategies (Unit, Integration, E2E), deployment checklist, and monitoring metrics.

Here is the Code Diff / Patch to analyze:
${diffContext}`;

    const ai = new GoogleGenAI({ apiKey });
    const primaryModel = config.aiModel || 'gemini-3.6-flash';
    const geminiModels = Array.from(new Set([primaryModel, 'gemini-3.6-flash', 'gemini-3.5-flash']));
    let prdMarkdown = '';
    let lastError = '';

    for (const model of geminiModels) {
      let attempts = 0;
      while (attempts < 3) {
        attempts++;
        try {
          const response = await ai.models.generateContent({
            model,
            contents: promptText,
          });

          if (response && response.text) {
            prdMarkdown = response.text;
            break;
          }
        } catch (err: any) {
          lastError = err.message || String(err);
          if ((lastError.includes('429') || lastError.includes('503') || lastError.includes('UNAVAILABLE') || lastError.includes('RESOURCE_EXHAUSTED')) && attempts < 3) {
            await new Promise((r) => setTimeout(r, 2500));
            continue;
          }
          break;
        }
      }
      if (prdMarkdown) break;
    }

    if (!prdMarkdown) {
      throw new Error(`Failed to generate PRD from Gemini API: ${lastError}`);
    }

    const prdData: PRDData = {
      repoId,
      commitSha: diffData.commitSha,
      shortSha: diffData.shortSha,
      authorName: diffData.authorName,
      commitMessage: diffData.message,
      prNumber,
      summary: diffData.summary,
      prdMarkdown,
      createdAt: new Date().toISOString(),
    };

    // 4. Cache and commit PRD into the dedicated test branch under automation-assets/
    if (this.assetCacheService) {
      try {
        await this.assetCacheService.saveAndCommitAsset(
          repoId,
          testBranch,
          diffData.commitSha,
          assetPath,
          prdData,
          `chore(assets): cache PRD specification for ${prKey}`,
          {
            filename: `automation-assets/${prKey}-prd.md`,
            content: prdMarkdown,
          }
        );
        prdData.cachedOnBranch = testBranch;
        prdData.cachePath = assetPath;
      } catch (e: any) {
        this.logger.warn(`[PRDGeneratorService] Could not persist PRD asset to '${testBranch}': ${e.message}`);
      }
    }

    return prdData;
  }

  public async generatePdfBuffer(prdData: PRDData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          margin: 40,
          size: 'A4',
          bufferPages: true,
        });

        const buffers: Buffer[] = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));

        const renderer = new MarkdownPdfRenderer(doc);
        renderer.renderHeader(prdData);
        renderer.renderMarkdown(prdData.prdMarkdown);
        renderer.addPageNumbers();

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }
}
