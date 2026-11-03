import {
  Repository,
  BranchInfo,
  PaginatedCommits,
  MergeCommitDetails,
  BranchComparisonDetails,
  TestScenario,
  ScenarioTestGeneratorResult,
  PRDData,
  JobResult,
  SystemHealth,
} from '../types';

const API_BASE = ''; // Uses relative URLs, handled by Vite proxy in dev and Express in prod

export async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  });

  const data = await res.json();
  if (!res.ok || data.success === false) {
    throw new Error(data.error || `Request failed with status ${res.status}`);
  }
  return data;
}

export const api = {
  // System Health
  async getHealth(): Promise<SystemHealth> {
    const res = await fetch(`${API_BASE}/api/health`);
    return await res.json();
  },

  // Repositories
  async getRepositories(): Promise<Repository[]> {
    const data = await fetchJson<{ success: boolean; repositories: Repository[] }>('/api/repositories');
    return data.repositories;
  },

  async addRepository(payload: { id: string; ssh: string; defaultBranch?: string }): Promise<Repository> {
    const data = await fetchJson<{ success: boolean; repository: Repository }>('/api/repositories', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return data.repository;
  },

  async updateRepository(id: string, payload: Partial<{ ssh: string; defaultBranch: string }>): Promise<void> {
    await fetchJson(`/api/repositories/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  async deleteRepository(id: string): Promise<void> {
    await fetchJson(`/api/repositories/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  async getBranches(repoId: string): Promise<BranchInfo> {
    return await fetchJson<BranchInfo>(`/api/repositories/${encodeURIComponent(repoId)}/branches`);
  },

  // Commits & Diffs
  async getCommits(repoId: string, branch: string, page = 1, limit = 50): Promise<PaginatedCommits> {
    return await fetchJson<PaginatedCommits>(
      `/api/repositories/${encodeURIComponent(repoId)}/commits?branch=${encodeURIComponent(branch)}&page=${page}&limit=${limit}`
    );
  },

  async getCommitDiff(repoId: string, sha: string): Promise<MergeCommitDetails> {
    return await fetchJson<MergeCommitDetails>(
      `/api/repositories/${encodeURIComponent(repoId)}/commits/${encodeURIComponent(sha)}/diff`
    );
  },

  async getBranchComparison(repoId: string, base: string, compare: string): Promise<BranchComparisonDetails> {
    return await fetchJson<BranchComparisonDetails>(
      `/api/repositories/${encodeURIComponent(repoId)}/compare?base=${encodeURIComponent(base)}&compare=${encodeURIComponent(compare)}`
    );
  },

  // AI Code Analysis
  async analyzeCommit(repoId: string, sha: string): Promise<{ analysis: string }> {
    return await fetchJson<{ analysis: string }>(
      `/api/repositories/${encodeURIComponent(repoId)}/commits/${encodeURIComponent(sha)}/analyze`,
      { method: 'POST' }
    );
  },

  async analyzeBranchComparison(repoId: string, base: string, compare: string): Promise<{ analysis: string }> {
    return await fetchJson<{ analysis: string }>(
      `/api/repositories/${encodeURIComponent(repoId)}/compare/analyze`,
      {
        method: 'POST',
        body: JSON.stringify({ base, compare }),
      }
    );
  },

  // Codebase Tests (Stage 1)
  async runExistingTests(repoId: string, sha: string, forceRefresh = false): Promise<any> {
    return await fetchJson(
      `/api/repositories/${encodeURIComponent(repoId)}/commits/${encodeURIComponent(sha)}/run-existing-tests`,
      { method: 'POST', body: JSON.stringify({ forceRefresh }) }
    );
  },

  async runExistingTestsBranch(repoId: string, base: string, compare: string): Promise<any> {
    return await fetchJson(
      `/api/repositories/${encodeURIComponent(repoId)}/compare/run-existing-tests`,
      {
        method: 'POST',
        body: JSON.stringify({ base, compare }),
      }
    );
  },

  // Test Scenarios
  async getTestScenarios(repoId: string, sha: string, forceRefresh = false): Promise<TestScenario[]> {
    const data = await fetchJson<{ success: boolean; scenarios: TestScenario[] }>(
      `/api/repositories/${encodeURIComponent(repoId)}/commits/${encodeURIComponent(sha)}/test-scenarios`,
      { method: 'POST', body: JSON.stringify({ forceRefresh }) }
    );
    return data.scenarios;
  },

  async getTestScenariosBranch(repoId: string, base: string, compare: string): Promise<TestScenario[]> {
    const data = await fetchJson<{ success: boolean; scenarios: TestScenario[] }>(
      `/api/repositories/${encodeURIComponent(repoId)}/compare/test-scenarios`,
      {
        method: 'POST',
        body: JSON.stringify({ base, compare }),
      }
    );
    return data.scenarios;
  },

  // Generate Tests (Stage 2)
  async generateTests(repoId: string, sha: string, sourceBranch: string, scenarios: TestScenario[], forceRefresh = false): Promise<ScenarioTestGeneratorResult> {
    return await fetchJson<ScenarioTestGeneratorResult>(
      `/api/repositories/${encodeURIComponent(repoId)}/commits/${encodeURIComponent(sha)}/generate-tests`,
      {
        method: 'POST',
        body: JSON.stringify({ sourceBranch, scenarios, forceRefresh }),
      }
    );
  },

  async generateTestsBranch(repoId: string, base: string, compare: string, scenarios: TestScenario[]): Promise<ScenarioTestGeneratorResult> {
    return await fetchJson<ScenarioTestGeneratorResult>(
      `/api/repositories/${encodeURIComponent(repoId)}/compare/generate-tests`,
      {
        method: 'POST',
        body: JSON.stringify({ base, compare, scenarios }),
      }
    );
  },

  // PRD Generation
  async generatePrd(repoId: string, sha: string, forceRefresh = false): Promise<PRDData> {
    return await fetchJson<PRDData>(
      `/api/repositories/${encodeURIComponent(repoId)}/commits/${encodeURIComponent(sha)}/prd`,
      { method: 'POST', body: JSON.stringify({ forceRefresh }) }
    );
  },

  // Cache Inspection
  async getCacheStatus(repoId: string, sha: string): Promise<{
    success: boolean;
    isFirstParent: boolean;
    prNumber?: string | null;
    testBranch?: string;
    cached: { prd: boolean; existingTests: boolean; aiTests: boolean; scenarios: boolean };
  }> {
    return await fetchJson(
      `/api/repositories/${encodeURIComponent(repoId)}/commits/${encodeURIComponent(sha)}/cache-status`
    );
  },

  getPrdPdfUrl(repoId: string, sha: string): string {
    return `${API_BASE}/api/repositories/${encodeURIComponent(repoId)}/commits/${encodeURIComponent(sha)}/prd/pdf`;
  },

  // Jobs
  async triggerSync(repoId?: string, branch?: string): Promise<any> {
    return await fetchJson('/api/jobs/sync', {
      method: 'POST',
      body: JSON.stringify({ repoId, branch }),
    });
  },

  async getActiveJobs(): Promise<{ success: boolean; activeRepos: string[] }> {
    return await fetchJson<{ success: boolean; activeRepos: string[] }>('/api/jobs/active');
  },

  async triggerCheckout(repoId: string, branch: string): Promise<any> {
    return await fetchJson('/api/jobs/checkout', {
      method: 'POST',
      body: JSON.stringify({ repoId, branch }),
    });
  },

  async getJobHistory(): Promise<JobResult[]> {
    const data = await fetchJson<{ success: boolean; history: JobResult[] }>('/api/jobs/history');
    return data.history;
  },
};

