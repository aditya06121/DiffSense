import { GoogleGenAI } from '@google/genai';
import { DiffService, MergeCommitDetails, BranchComparisonDetails } from './DiffService';
import { ConfigLoader } from '../core/Config';

// This full code-review pass is one of the larger, slower AI calls in the app (diff context up to 45K
// chars). It used to be recomputed, uncached, from every caller - the Diff Explorer's own /analyze
// endpoint, AND again unconditionally inside Stage 2 test generation for the same commit. An in-memory,
// process-lifetime cache (keyed off the resolved commit/branch shas, not the raw route params, so it's
// shared correctly across callers that pass slightly different sha forms) removes that duplicate call
// without touching git or the working tree - unlike the AssetCacheService pattern used elsewhere, this
// never needs to check out a branch or commit anything, so it's safe to use from a read-only route.
const ANALYSIS_CACHE_MAX_ENTRIES = 100;

function cacheGet<T>(cache: Map<string, T>, key: string, forceRefresh: boolean): T | undefined {
  if (forceRefresh) return undefined;
  return cache.get(key);
}

function cacheSet<T>(cache: Map<string, T>, key: string, value: T): void {
  if (cache.size >= ANALYSIS_CACHE_MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.set(key, value);
}

export class GeminiAnalysisService {
  private diffService: DiffService;
  private mergeCommitAnalysisCache = new Map<string, Awaited<ReturnType<GeminiAnalysisService['analyzeMergeCommit']>>>();
  private branchComparisonAnalysisCache = new Map<string, Awaited<ReturnType<GeminiAnalysisService['analyzeBranchComparison']>>>();

  constructor(diffService: DiffService) {
    this.diffService = diffService;
  }

  private async callModel(promptText: string, extraConfig?: Record<string, any>): Promise<string> {
    const config = ConfigLoader.getInstance().getConfig();
    const apiKey = config.geminiApiKey;

    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured in environment or ConfigLoader.');
    }

    const ai = new GoogleGenAI({ apiKey });
    const primaryModel = config.aiModel || 'gemini-3.6-flash';
    const geminiModels = Array.from(new Set([primaryModel, 'gemini-3.6-flash', 'gemini-3.5-flash']));
    let result = '';
    let lastError = '';

    for (const model of geminiModels) {
      let attempts = 0;
      while (attempts < 3) {
        attempts++;
        try {
          const response = await ai.models.generateContent({
            model,
            contents: promptText,
            ...(extraConfig ? { config: extraConfig } : {}),
          });

          if (response && response.text) {
            result = response.text;
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
      if (result) break;
    }

    if (!result) {
      throw new Error(`Failed to generate Gemini AI response: ${lastError}`);
    }

    return result;
  }

  public async generateMarkdown(promptText: string): Promise<string> {
    return this.callModel(promptText);
  }

  public async generateJson<T = any>(promptText: string, responseSchema: Record<string, any>): Promise<T> {
    const text = await this.callModel(promptText, { responseMimeType: 'application/json', responseSchema });
    return JSON.parse(text) as T;
  }

  public async analyzeMergeCommit(repoId: string, sha: string, forceRefresh = false): Promise<{
    success: boolean;
    commitSha: string;
    shortSha: string;
    authorName: string;
    message: string;
    summary: MergeCommitDetails['summary'];
    analysis: string;
    error?: string;
  }> {
    // 1. Fetch detailed first-parent diff patch
    const diffData = await this.diffService.getMergeCommitDetails(repoId, sha);

    // Cache key uses the resolved full commit sha, not the raw route param - the Diff Explorer route and
    // Stage 2 test generation can pass slightly different sha forms (short vs full) for the same commit.
    const cacheKey = `${repoId}:${diffData.commitSha}`;
    const cached = cacheGet(this.mergeCommitAnalysisCache, cacheKey, forceRefresh);
    if (cached) return cached;

    // 2. Format diff patch context for AI Model
    let diffContext = `Merge Commit SHA: ${diffData.commitSha} (${diffData.shortSha})\n`;
    diffContext += `Author: ${diffData.authorName}\n`;
    diffContext += `Message: ${diffData.message}\n`;
    diffContext += `Summary: ${diffData.summary.totalFiles} files changed (+${diffData.summary.totalAdditions} -${diffData.summary.totalDeletions})\n\n`;

    diffData.files.forEach((f, idx) => {
      diffContext += `=== File [${idx + 1}/${diffData.files.length}]: ${f.newPath || f.oldPath} (${f.type}, +${f.additions} -${f.deletions}) ===\n`;
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
      diffContext = diffContext.substring(0, 45000) + '\n\n... [Diff truncated for AI context limit] ...';
    }

    const promptText = `You are an expert AI Software Architect and Senior Code Reviewer.
Analyze the following first-parent git merge commit diff patch and generate a clean, structured Markdown code analysis report.

Format your response strictly using the following Markdown sections:

### 📋 Executive Summary
Provide a concise overview of what this change accomplishes and its primary goal.

### ➕ Additions & New Features
List key new capabilities, components, services, or files introduced.

### ✏️ Modifications & Refactors
List logic adjustments, code refactors, structural changes, or parameter updates in existing files.

### 🗑️ Deletions & Reversals
List deleted code, removed files, or reverted behaviors.

### ⚠️ Risk & Impact Assessment
Highlight potential regression risks, breaking changes, testing recommendations, or performance considerations.

Here is the Code Diff / Patch to analyze:
${diffContext}
`;

    // 3. Call AI Model API via @google/genai SDK
    const analysisMarkdown = await this.generateMarkdown(promptText);

    const result = {
      success: true,
      commitSha: diffData.commitSha,
      shortSha: diffData.shortSha,
      authorName: diffData.authorName,
      message: diffData.message,
      summary: diffData.summary,
      analysis: analysisMarkdown,
    };
    cacheSet(this.mergeCommitAnalysisCache, cacheKey, result);
    return result;
  }

  public async analyzeBranchComparison(
    repoId: string,
    baseBranch: string,
    compareBranch: string,
    forceRefresh = false
  ): Promise<{
    success: boolean;
    baseBranch: string;
    compareBranch: string;
    baseSha: string;
    compareSha: string;
    summary: BranchComparisonDetails['summary'];
    analysis: string;
  }> {
    // 1. Fetch diff of compareBranch relative to baseBranch's merge-base
    const diffData = await this.diffService.getBranchComparisonDetails(repoId, baseBranch, compareBranch);

    // Cache key uses the resolved shas, not the mutable branch names - a branch can move, but the diff
    // between two fixed commits never changes.
    const cacheKey = `${repoId}:${diffData.baseSha}:${diffData.compareSha}`;
    const cached = cacheGet(this.branchComparisonAnalysisCache, cacheKey, forceRefresh);
    if (cached) return cached;

    // 2. Format diff patch context for AI Model
    let diffContext = `Base Branch: ${diffData.baseBranch} (${diffData.baseShortSha})\n`;
    diffContext += `Compare Branch: ${diffData.compareBranch} (${diffData.compareShortSha})\n`;
    diffContext += `Merge Base: ${diffData.mergeBaseSha}\n`;
    diffContext += `Compare branch is ${diffData.aheadBy} commit(s) ahead and ${diffData.behindBy} commit(s) behind base.\n`;
    diffContext += `Summary: ${diffData.summary.totalFiles} files changed (+${diffData.summary.totalAdditions} -${diffData.summary.totalDeletions})\n\n`;

    diffData.files.forEach((f, idx) => {
      diffContext += `=== File [${idx + 1}/${diffData.files.length}]: ${f.newPath || f.oldPath} (${f.type}, +${f.additions} -${f.deletions}) ===\n`;
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
      diffContext = diffContext.substring(0, 45000) + '\n\n... [Diff truncated for AI context limit] ...';
    }

    const promptText = `You are an expert AI Software Architect and Senior Code Reviewer.
Analyze the following git branch comparison diff (everything introduced by the compare branch relative to the base branch's common ancestor) and generate a clean, structured Markdown code analysis report.

Format your response strictly using the following Markdown sections:

### 📋 Executive Summary
Provide a concise overview of what this branch introduces and its primary goal.

### ➕ Additions & New Features
List key new capabilities, components, services, or files introduced.

### ✏️ Modifications & Refactors
List logic adjustments, code refactors, structural changes, or parameter updates in existing files.

### 🗑️ Deletions & Reversals
List deleted code, removed files, or reverted behaviors.

### ⚠️ Risk & Impact Assessment
Highlight potential regression risks, breaking changes, testing recommendations, or performance considerations.

Here is the Code Diff / Patch to analyze:
${diffContext}
`;

    // 3. Call AI Model API via @google/genai SDK
    const analysisMarkdown = await this.generateMarkdown(promptText);

    const result = {
      success: true,
      baseBranch: diffData.baseBranch,
      compareBranch: diffData.compareBranch,
      baseSha: diffData.baseSha,
      compareSha: diffData.compareSha,
      summary: diffData.summary,
      analysis: analysisMarkdown,
    };
    cacheSet(this.branchComparisonAnalysisCache, cacheKey, result);
    return result;
  }
}
