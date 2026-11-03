export interface ParsedCommitMeta {
  tier: 'pr-merge' | 'feature' | 'sync-merge';
  isPrMerge: boolean;
  isSyncMerge: boolean;
  prNumber: string | null;
  sourceBranch: string | null;
  ticketIds: string[];
  approvedBy: string[];
  cleanTitle: string;
  body: string;
}

export function parseCommitMeta(message: string, isMerge: boolean, parentsCount = 1): ParsedCommitMeta {
  const fullText = message || '';
  const lines = fullText.split('\n');
  const firstLine = lines[0]?.trim() || '';
  const body = lines.slice(1).join('\n').trim();

  // 1. Detect PR / Merge Request ID
  let prNumber: string | null = null;
  const prMatch = fullText.match(/(?:pull request|merge request|PR)\s*#?(\d+)/i) ||
                  fullText.match(/\(pull request #(\d+)\)/i);
  if (prMatch) {
    prNumber = prMatch[1];
  }

  // 2. Detect Source Branch
  let sourceBranch: string | null = null;
  const sourceMatch = firstLine.match(/Merged in ([^\s(]+)/i) ||
                      firstLine.match(/Merge pull request #\d+ from ([^\s/]+(?:\/[^\s]+)?)/i) ||
                      firstLine.match(/Merge branch '([^']+)'/i);
  if (sourceMatch) {
    sourceBranch = sourceMatch[1];
  }

  // 3. Detect Routine Pull/Sync Merge (e.g. "Merged lvaptpatchsandbox into routepayment_fix")
  const isSyncMerge =
    (isMerge || parentsCount > 1) &&
    !prNumber &&
    (/Merged\s+[^\s]+\s+into\s+[^\s]+/i.test(firstLine) ||
     /Merge branch '[^']+' of/i.test(firstLine) ||
     /Merge remote-tracking branch/i.test(firstLine));

  // 4. Detect Main PR Merge Commit
  const isPrMerge = (isMerge || parentsCount > 1) && (!!prNumber || (!isSyncMerge && /Merged in /i.test(firstLine)));

  // 5. Determine Visual Hierarchy Tier
  let tier: 'pr-merge' | 'feature' | 'sync-merge';
  if (isPrMerge) {
    tier = 'pr-merge'; // Tier 1: Most highlighted (First-parent PR release merge)
  } else if (isSyncMerge) {
    tier = 'sync-merge'; // Tier 3: Least highlighted (Routine sync merge)
  } else {
    tier = 'feature'; // Tier 2: Commits in between (feature/bugfix code changes)
  }

  // 6. Extract Ticket IDs (e.g. ADD-1, APPDEV-96, TICKET-123)
  const ticketIds: string[] = [];
  const ticketMatches = fullText.matchAll(/(?:ticket\s*id\s*:\s*|TICKET\s*ID\s*:\s*|\b)([A-Z]{2,10}-\d+)\b/gi);
  for (const m of ticketMatches) {
    const ticket = m[1].toUpperCase();
    if (!ticketIds.includes(ticket)) {
      ticketIds.push(ticket);
    }
  }

  // 7. Extract Approvers
  const approvedBy: string[] = [];
  const approverMatches = fullText.matchAll(/Approved-by:\s*([^\n\r,]+)/gi);
  for (const m of approverMatches) {
    const approver = m[1].trim();
    if (approver && !approvedBy.includes(approver)) {
      approvedBy.push(approver);
    }
  }

  return {
    tier,
    isPrMerge,
    isSyncMerge,
    prNumber,
    sourceBranch,
    ticketIds,
    approvedBy,
    cleanTitle: firstLine,
    body,
  };
}

export function getRepoWebUrls(remoteUrl?: string): {
  getPrUrl: (prNumber?: string | null) => string | null;
  getCommitUrl: (commitSha?: string | null) => string | null;
} {
  if (!remoteUrl) {
    return {
      getPrUrl: () => null,
      getCommitUrl: () => null,
    };
  }

  // Parse SSH (git@host:owner/repo.git) or HTTPS (https://host/owner/repo.git)
  const match = remoteUrl.match(/^(?:git@|https?:\/\/)([^:/]+)[:/]([^/]+\/[^/.]+)(?:\.git)?$/);
  if (!match) {
    return {
      getPrUrl: () => null,
      getCommitUrl: () => null,
    };
  }

  const host = match[1].toLowerCase();
  const ownerRepo = match[2];

  return {
    getPrUrl: (prNumber?: string | null) => {
      if (!prNumber) return null;
      if (host.includes('bitbucket.org')) {
        return `https://bitbucket.org/${ownerRepo}/pull-requests/${prNumber}`;
      }
      if (host.includes('github.com')) {
        return `https://github.com/${ownerRepo}/pull/${prNumber}`;
      }
      if (host.includes('gitlab.com')) {
        return `https://gitlab.com/${ownerRepo}/-/merge_requests/${prNumber}`;
      }
      return `https://${host}/${ownerRepo}/pull-requests/${prNumber}`;
    },
    getCommitUrl: (commitSha?: string | null) => {
      if (!commitSha) return null;
      if (host.includes('bitbucket.org')) {
        return `https://bitbucket.org/${ownerRepo}/commits/${commitSha}`;
      }
      if (host.includes('github.com')) {
        return `https://github.com/${ownerRepo}/commit/${commitSha}`;
      }
      if (host.includes('gitlab.com')) {
        return `https://gitlab.com/${ownerRepo}/-/commit/${commitSha}`;
      }
      return `https://${host}/${ownerRepo}/commits/${commitSha}`;
    },
  };
}

