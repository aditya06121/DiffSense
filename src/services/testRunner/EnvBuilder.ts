import * as fs from 'fs';
import * as path from 'path';

// .env.test first, falling back to .env.example for placeholder values so repos that require env vars
// just to boot don't crash outright. The real .env is deliberately excluded from this list - loading it
// here would let a test run silently hit real credentials/databases/external services (both a safety
// risk and a source of nondeterministic results depending on what happens to be sitting in a dev's .env).
const ENV_CANDIDATES = ['.env.test', '.env.example'];

export function buildExecutionEnv(repoPath: string): Record<string, string> {
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    NODE_ENV: 'test',
    CI: 'true',
    PORT: '0',
  };

  for (const file of ENV_CANDIDATES) {
    const fullPath = path.join(repoPath, file);
    if (!fs.existsSync(fullPath)) continue;
    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx <= 0) continue;
        const key = trimmed.substring(0, eqIdx).trim();
        const val = trimmed
          .substring(eqIdx + 1)
          .trim()
          .replace(/^['"]|['"]$/g, '');
        if (!env[key]) {
          env[key] = val;
        }
      }
    } catch {
      // Ignore unreadable env files
    }
  }

  return env;
}
