import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { GoogleGenAI, Type } from '@google/genai';
import { ConfigLoader } from '../core/Config';
import { Logger } from '../core/Logger';
import { stripAnsi } from './testRunner/CommandExecutor';

const execAsync = promisify(exec);

export interface ToolExecutionResult {
  toolName: string;
  args: any;
  result: any;
  step: number;
  scenarioId?: number;
  scenarioTitle?: string;
}

export interface AgentRunResult {
  success: boolean;
  finalSummary: string;
  steps: ToolExecutionResult[];
  createdFiles: string[];
  executionLogs: Array<{ command: string; exitCode: number; stdout: string; stderr: string }>;
  error?: string;
}

export class GeminiAgentExecutor {
  private logger = Logger.getInstance();

  private getToolDeclarations() {
    return [
      {
        name: 'write_file',
        description: 'Create or overwrite a test file in the repository workspace.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            filePath: {
              type: Type.STRING,
              description: 'Relative path where the test file should be created/updated (e.g. "tests/v2/Service/investment/OrderPricingStrategy.test.ts" or "test/example_test.dart").',
            },
            content: {
              type: Type.STRING,
              description: 'Complete source code content for the test file.',
            },
          },
          required: ['filePath', 'content'],
        },
      },
      {
        name: 'run_command',
        description: 'Execute a test shell command inside the repository directory (e.g., "npx jest path/to/test.ts", "npx vitest run path/to/test.ts", "flutter test path/to/test").',
        parameters: {
          type: Type.OBJECT,
          properties: {
            command: {
              type: Type.STRING,
              description: 'Shell command string to execute in the repository directory.',
            },
          },
          required: ['command'],
        },
      },
      {
        name: 'read_file',
        description: 'Read contents of a specific file in the repository (use sparingly, max 1 read before writing).',
        parameters: {
          type: Type.OBJECT,
          properties: {
            filePath: {
              type: Type.STRING,
              description: 'Relative path of the file to read from repository root.',
            },
          },
          required: ['filePath'],
        },
      },
    ];
  }

  public async runAgentLoop(
    repoPath: string,
    initialPrompt: string,
    maxIterations: number = 15
  ): Promise<AgentRunResult> {
    const config = ConfigLoader.getInstance().getConfig();
    const apiKey = config.geminiApiKey;

    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured in environment or ConfigLoader.');
    }

    const ai = new GoogleGenAI({ apiKey });
    const steps: ToolExecutionResult[] = [];
    const createdFiles: string[] = [];
    const executionLogs: Array<{ command: string; exitCode: number; stdout: string; stderr: string }> = [];

    const systemInstruction = `You are a precision Autonomous Test Generator and Runner powered by the official Google Gen AI SDK.
Your sole mission is to WRITE a concrete test for the given scenario, RUN it via the CLI test runner, and verify it passes.

STRICT EXECUTION PROTOCOL:
1. Step 1 MUST be write_file: Write the complete test file at the recommended path. All necessary target source code, AST symbol signatures, and mock patterns are ALREADY provided in your prompt.
2. Step 2 MUST be run_command: Execute the test with the detected runner (e.g. "npx jest path/to/test.ts", "npx vitest run path/to/test.ts", "flutter test path/to/test").
3. Step 3 (Only if Step 2 failed): Read the error output, fix the test with write_file, and re-run with run_command.
4. Final Step: Output the structured Markdown executive summary.

STRICT CONSTRAINTS:
- Do NOT perform directory discovery or multiple file reads. All needed source code is already provided in the prompt.
- Your immediate priority is calling write_file. Reaching step limits without calling write_file is a critical failure.`;

    const contents: any[] = [
      {
        role: 'user',
        parts: [{ text: `${systemInstruction}\n\nTask Context & Instructions:\n${initialPrompt}` }],
      },
    ];

    const effectiveMaxIterations = maxIterations || config.maxAgentIterations || 15;
    const primaryModel = config.aiModel || 'gemini-3.6-flash';
    const geminiModels = Array.from(new Set([primaryModel, 'gemini-3.6-flash', 'gemini-3.5-flash']));

    let iteration = 0;
    let readFileCount = 0;
    let finalSummary = '';

    while (iteration < effectiveMaxIterations) {
      iteration++;
      this.logger.info(`[GeminiAgentExecutor] Step ${iteration}/${effectiveMaxIterations} starting...`);

      // Without this, a model that meanders (extra reads, hesitation) just silently burns the entire
      // turn budget - each turn being a full network round-trip - before the loop's own fallback summary
      // kicks in. Nudging it to wrap up as the budget runs low means most scenarios finish in fewer turns
      // rather than defaulting to the max on anything less than a clean first-try pass.
      const turnsRemaining = effectiveMaxIterations - iteration;
      if (turnsRemaining > 0 && turnsRemaining <= 2) {
        contents.push({
          role: 'user',
          parts: [
            {
              text: `⏰ Turn budget check: only ${turnsRemaining} turn(s) remain after this one. If run_command already reported a passing test, STOP taking further actions and output the final structured Markdown summary right now. Only continue if the test is still failing and you have one concrete fix left to try.`,
            },
          ],
        });
      }

      let response: any = null;
      let lastError = '';

      for (const model of geminiModels) {
        let attempts = 0;
        while (attempts < 3) {
          attempts++;
          try {
            response = await ai.models.generateContent({
              model,
              contents,
              config: {
                tools: [{ functionDeclarations: this.getToolDeclarations() as any }],
              },
            });
            break;
          } catch (err: any) {
            lastError = err.message || String(err);
            if ((lastError.includes('429') || lastError.includes('503') || lastError.includes('UNAVAILABLE') || lastError.includes('RESOURCE_EXHAUSTED')) && attempts < 3) {
              this.logger.warn(`[GeminiAgentExecutor] API spike/quota notice (${lastError.substring(0, 100)}...) on model '${model}'. Retrying in 2.5 seconds (attempt ${attempts}/3)...`);
              await new Promise((r) => setTimeout(r, 2500));
              continue;
            }
            break;
          }
        }
        if (response) break;
      }

      if (!response) {
        throw new Error(`Gemini Agent failed to get response: ${lastError}`);
      }

      const candidate = response.candidates?.[0];
      if (candidate && candidate.content) {
        contents.push(candidate.content);
      }

      const fnCalls = response.functionCalls;

      if (fnCalls && fnCalls.length > 0) {
        const call = fnCalls[0];
        const { name, args } = call;
        this.logger.info(`[GeminiAgentExecutor] Tool Call requested: '${name}'`, args);

        let toolOutput: any = {};

        try {
          if (name === 'list_files') {
            toolOutput = {
              error: 'Directory listing is disabled. All required source files and test target paths are already provided in your prompt. Call write_file directly.',
            };
          } else if (name === 'read_file') {
            if (createdFiles.length === 0 && readFileCount >= 1) {
              toolOutput = {
                error: 'Read budget exceeded (maximum 1 read permitted before writing). You already have the complete target source and AST intelligence in your prompt. You MUST call write_file now.',
              };
            } else {
              readFileCount++;
              const rel = args?.filePath || '';
              const targetFile = path.resolve(repoPath, rel);
              if (!targetFile.startsWith(path.resolve(repoPath))) {
                throw new Error('Access denied: file path outside repository.');
              }
              if (fs.existsSync(targetFile)) {
                const fileContent = fs.readFileSync(targetFile, 'utf-8');
                toolOutput = {
                  filePath: rel,
                  content: fileContent.length > 30000 ? fileContent.substring(0, 30000) + '\n...[truncated]' : fileContent,
                  notice: createdFiles.length === 0 ? 'CRITICAL: You have reviewed this file. Your NEXT tool call MUST be write_file to create the test.' : undefined,
                };
              } else {
                toolOutput = { error: `File '${rel}' not found.` };
              }
            }
          } else if (name === 'write_file') {
            const rel = args?.filePath || '';
            const content = args?.content || '';
            const targetFile = path.resolve(repoPath, rel);

            if (!targetFile.startsWith(path.resolve(repoPath))) {
              throw new Error('Access denied: target file path outside repository.');
            }

            const dir = path.dirname(targetFile);
            if (!fs.existsSync(dir)) {
              fs.mkdirSync(dir, { recursive: true });
            }

            fs.writeFileSync(targetFile, content, 'utf-8');
            if (!createdFiles.includes(rel)) {
              createdFiles.push(rel);
            }
            toolOutput = { success: true, filePath: rel, message: `Successfully written ${content.length} characters.` };
          } else if (name === 'run_command') {
            const cmd = args?.command || '';
            this.logger.info(`[GeminiAgentExecutor] Executing shell command: "${cmd}" inside ${repoPath}`);

            try {
              const { stdout: rawStdout, stderr: rawStderr } = await execAsync(cmd, {
                cwd: repoPath,
                timeout: config.agentCommandTimeoutMs || 60000,
                env: { ...process.env, CI: 'true' },
              });
              const stdout = stripAnsi(rawStdout.trim());
              const stderr = stripAnsi(rawStderr.trim());

              executionLogs.push({ command: cmd, exitCode: 0, stdout, stderr });
              toolOutput = {
                exitCode: 0,
                stdout: stdout.substring(0, 15000),
                stderr: stderr.substring(0, 5000),
                status: 'PASSED',
              };
            } catch (cmdErr: any) {
              const stdout = stripAnsi((cmdErr.stdout ? String(cmdErr.stdout) : '').trim());
              const stderr = stripAnsi((cmdErr.stderr ? String(cmdErr.stderr) : cmdErr.message || '').trim());
              const exitCode = typeof cmdErr.code === 'number' ? cmdErr.code : 1;

              executionLogs.push({ command: cmd, exitCode, stdout, stderr });
              toolOutput = {
                exitCode,
                stdout: stdout.substring(0, 15000),
                stderr: stderr.substring(0, 5000),
                status: 'FAILED',
                error: 'Command returned non-zero exit code.',
              };
            }
          } else {
            toolOutput = { error: `Unknown tool name: ${name}` };
          }
        } catch (err: any) {
          toolOutput = { error: err.message || String(err) };
        }

        steps.push({
          toolName: name,
          args,
          result: toolOutput,
          step: iteration,
        });

        contents.push({
          role: 'user',
          parts: [
            {
              functionResponse: {
                name,
                response: toolOutput,
              },
            },
          ],
        });
      } else {
        if (response.text) {
          finalSummary = response.text;
          break;
        }
      }
    }

    if (!finalSummary) {
      finalSummary = `Completed ${iteration} tool execution steps. Test files written: ${createdFiles.join(', ') || 'None'}.`;
    }

    return {
      success: true,
      finalSummary,
      steps,
      createdFiles,
      executionLogs,
    };
  }
}
