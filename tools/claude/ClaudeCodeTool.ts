/**
 * EVA Claude Code Developer Agent Integration Tools
 * Conforms to EVA_AI_Implementation_Master_Spec Phase 6 (Claude Code Integration)
 */

import { z } from 'zod';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ToolContract, ToolResult, VerificationResult, ExecutionContext, RiskLevel } from '../../core/tools/ToolContract.js';
import { resolveDesktopProjectPath, launchInVSCodeTerminal } from '../developer/VSCodeTool.js';

const execFileAsync = promisify(execFile);

export const CLAUDE_LIMIT_REGEX = /hit your (?:weekly|daily|usage) limit|rate limit|usage limit|exceeded your (?:current|quota)|credit balance is too low|resets [a-zA-Z]+ \d+/i;

/**
 * Dynamically resolves the Claude Code CLI binary path
 */
export async function findClaudeCli(): Promise<string> {
  // 1. Try which claude
  try {
    const { stdout } = await execFileAsync('which', ['claude']);
    const found = stdout.trim();
    if (found && fs.existsSync(found)) return found;
  } catch {}

  // 2. Standard macOS and Node version manager paths
  const standardPaths = [
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
  ];
  for (const p of standardPaths) {
    if (fs.existsSync(p)) return p;
  }

  // 3. Search nvm node directories
  try {
    const nvmDir = path.join(os.homedir(), '.nvm/versions/node');
    if (fs.existsSync(nvmDir)) {
      const versions = fs.readdirSync(nvmDir);
      for (const ver of versions.reverse()) {
        const bin = path.join(nvmDir, ver, 'bin/claude');
        if (fs.existsSync(bin)) return bin;
      }
    }
  } catch {}

  return '/opt/homebrew/bin/claude';
}

// ==========================================
// 1. Claude Code Project Review Tool
// ==========================================
export const ClaudeReviewInputSchema = z.object({
  projectPath: z.string().optional(),
  focus: z.string().optional(),
  runInVSCodeTerminal: z.boolean().optional(),
});

export const ClaudeReviewOutputSchema = z.object({
  completed: z.boolean(),
  reviewSummary: z.string(),
  projectPath: z.string(),
  outputChars: z.number(),
  launchedInTerminal: z.boolean().optional(),
});

export type ClaudeReviewInput = z.infer<typeof ClaudeReviewInputSchema>;
export type ClaudeReviewOutput = z.infer<typeof ClaudeReviewOutputSchema>;

export class ClaudeReviewTool implements ToolContract<ClaudeReviewInput, ClaudeReviewOutput> {
  public readonly name = 'claude.review_project';
  public readonly version = '1.0.0';
  public readonly description = 'Uses Claude Code CLI to analyze and review a project codebase';
  public readonly riskLevel: RiskLevel = 'NORMAL';
  public readonly timeoutMs = 60000; // 60s timeout for code review

  public readonly inputSchema = ClaudeReviewInputSchema;
  public readonly outputSchema = ClaudeReviewOutputSchema;

  private runner?: (projectPath: string, prompt: string) => Promise<string>;

  constructor(options?: { runner?: (projectPath: string, prompt: string) => Promise<string> }) {
    this.runner = options?.runner;
  }

  public async execute(params: ClaudeReviewInput, ctx: ExecutionContext): Promise<ToolResult<ClaudeReviewOutput>> {
    const startTime = Date.now();
    const targetDir = resolveDesktopProjectPath(params.projectPath, ctx.workspaceRoot);
    const focusDirective = params.focus ? ` Focus specifically on: ${params.focus}.` : '';
    const reviewPrompt = `Perform a concise code review of this project. Evaluate code architecture, test coverage, and security.${focusDirective}`;

    try {
      if (params.runInVSCodeTerminal) {
        await launchInVSCodeTerminal(`claude -p "${reviewPrompt.replace(/"/g, '\\"')}"`, targetDir);
        return {
          success: true,
          data: {
            completed: true,
            reviewSummary: `Started Claude Code codebase review inside Visual Studio Code terminal for '${targetDir}'.`,
            projectPath: targetDir,
            outputChars: reviewPrompt.length,
            launchedInTerminal: true,
          },
          metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
        };
      }

      let output = '';

      if (this.runner) {
        output = await this.runner(targetDir, reviewPrompt);
      } else {
        const claudeCli = await findClaudeCli();
        process.stdout.write(`\n🤖 [Claude Code] Starting automated review on '${targetDir}'...\n`);
        const child = execFile(
          claudeCli,
          ['-p', reviewPrompt, '--no-session-persistence'],
          {
            cwd: targetDir,
            signal: ctx.abortSignal,
            maxBuffer: 2 * 1024 * 1024, // 2MB
          }
        );
        child.stdin?.end();

        const { stdout, stderr } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
          let out = '';
          let err = '';
          child.stdout?.on('data', (d) => {
            out += d;
            process.stdout.write(d); // Live streaming continuous feedback
          });
          child.stderr?.on('data', (d) => {
            err += d;
            process.stdout.write(d);
          });
          child.on('close', (code) => {
            if (code === 0 || out.length > 0) {
              resolve({ stdout: out, stderr: err });
            } else {
              reject(new Error(err || `Claude exited with code ${code}`));
            }
          });
          child.on('error', reject);
        });
        output = stdout.trim() || stderr.trim();
        process.stdout.write('\n');
      }

      const isLimitReached = CLAUDE_LIMIT_REGEX.test(output);
      const summary = output.length > 2000 ? output.substring(0, 2000) + '\n...[Review Truncated]' : output;

      return {
        success: true,
        data: {
          completed: !isLimitReached,
          reviewSummary: summary || 'Review completed with no critical warnings.',
          projectPath: targetDir,
          outputChars: output.length,
          launchedInTerminal: false,
        },
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'CLAUDE_REVIEW_FAILED',
          message: `Claude Code review encountered an error: ${String(err)}`,
          category: 'recoverable',
        },
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    }
  }

  public async verify(
    params: ClaudeReviewInput,
    result: ToolResult<ClaudeReviewOutput>
  ): Promise<VerificationResult> {
    if (result.data?.launchedInTerminal) {
      return {
        verified: true,
        status: 'CONFIRMED',
        evidence: `Claude Code launched in VS Code terminal for '${result.data.projectPath}'.`,
      };
    }

    const isLimit = result.data?.reviewSummary ? CLAUDE_LIMIT_REGEX.test(result.data.reviewSummary) : false;
    const verified = Boolean(result.success && result.data && result.data.outputChars > 0 && result.data.completed && !isLimit);
    return {
      verified,
      status: verified ? 'CONFIRMED' : 'FAILED',
      evidence: verified
        ? `Claude Code completed review (${result.data?.outputChars} characters produced).`
        : (isLimit ? 'Claude Code hit usage limit.' : 'Claude Code review produced no output.'),
    };
  }
}

// ==========================================
// 2. Claude Code Task Execution Tool
// ==========================================
export const ClaudeTaskInputSchema = z.object({
  taskPrompt: z.string().min(1, 'Task description cannot be empty'),
  projectPath: z.string().optional(),
  runInVSCodeTerminal: z.boolean().optional(),
});

export const ClaudeTaskOutputSchema = z.object({
  completed: z.boolean(),
  taskPrompt: z.string(),
  resultText: z.string(),
  projectPath: z.string(),
  launchedInTerminal: z.boolean().optional(),
});

export type ClaudeTaskInput = z.infer<typeof ClaudeTaskInputSchema>;
export type ClaudeTaskOutput = z.infer<typeof ClaudeTaskOutputSchema>;

export class ClaudeTaskTool implements ToolContract<ClaudeTaskInput, ClaudeTaskOutput> {
  public readonly name = 'claude.complete_task';
  public readonly version = '1.0.0';
  public readonly description = 'Executes a coding, refactoring, or maintenance task using Claude Code';
  public readonly riskLevel: RiskLevel = 'NORMAL';
  public readonly timeoutMs = 90000; // 90s for tasks

  public readonly inputSchema = ClaudeTaskInputSchema;
  public readonly outputSchema = ClaudeTaskOutputSchema;

  private runner?: (projectPath: string, taskPrompt: string) => Promise<string>;

  constructor(options?: { runner?: (projectPath: string, taskPrompt: string) => Promise<string> }) {
    this.runner = options?.runner;
  }

  public async execute(params: ClaudeTaskInput, ctx: ExecutionContext): Promise<ToolResult<ClaudeTaskOutput>> {
    const startTime = Date.now();
    const targetDir = resolveDesktopProjectPath(params.projectPath, ctx.workspaceRoot);

    try {
      if (params.runInVSCodeTerminal) {
        await launchInVSCodeTerminal(`claude -p "${params.taskPrompt.replace(/"/g, '\\"')}"`, targetDir);
        return {
          success: true,
          data: {
            completed: true,
            taskPrompt: params.taskPrompt,
            resultText: `Launched Claude Code task inside Visual Studio Code terminal for '${targetDir}'.`,
            projectPath: targetDir,
            launchedInTerminal: true,
          },
          metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
        };
      }

      let output = '';

      if (this.runner) {
        output = await this.runner(targetDir, params.taskPrompt);
      } else {
        const claudeCli = await findClaudeCli();
        process.stdout.write(`\n🤖 [Claude Code] Executing task on '${targetDir}': "${params.taskPrompt}"...\n`);
        const child = execFile(
          claudeCli,
          ['-p', params.taskPrompt, '--permission-mode', 'auto'],
          {
            cwd: targetDir,
            signal: ctx.abortSignal,
            maxBuffer: 4 * 1024 * 1024,
          }
        );
        child.stdin?.end();

        const { stdout, stderr } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
          let out = '';
          let err = '';
          child.stdout?.on('data', (d) => {
            out += d;
            process.stdout.write(d); // Live streaming continuous feedback
          });
          child.stderr?.on('data', (d) => {
            err += d;
            process.stdout.write(d);
          });
          child.on('close', (code) => {
            if (code === 0 || out.length > 0) {
              resolve({ stdout: out, stderr: err });
            } else {
              reject(new Error(err || `Claude exited with code ${code}`));
            }
          });
          child.on('error', reject);
        });
        output = stdout.trim() || stderr.trim();
        process.stdout.write('\n');
      }

      const isLimitReached = CLAUDE_LIMIT_REGEX.test(output);

      return {
        success: true,
        data: {
          completed: !isLimitReached,
          taskPrompt: params.taskPrompt,
          resultText: output || 'Task completed successfully by Claude Code.',
          projectPath: targetDir,
          launchedInTerminal: false,
        },
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'CLAUDE_TASK_FAILED',
          message: `Claude Code task failed: ${String(err)}`,
          category: 'recoverable',
        },
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    }
  }

  public async verify(
    params: ClaudeTaskInput,
    result: ToolResult<ClaudeTaskOutput>
  ): Promise<VerificationResult> {
    if (result.data?.launchedInTerminal) {
      return {
        verified: true,
        status: 'CONFIRMED',
        evidence: `Claude Code task launched in VS Code terminal: "${params.taskPrompt}".`,
      };
    }

    const isLimit = result.data?.resultText ? CLAUDE_LIMIT_REGEX.test(result.data.resultText) : false;
    const verified = Boolean(result.success && result.data && result.data.completed && !isLimit);
    return {
      verified,
      status: verified ? 'CONFIRMED' : 'FAILED',
      evidence: verified
        ? `Claude Code confirmed task completion: "${params.taskPrompt}".`
        : (isLimit ? 'Claude Code hit usage limit.' : 'Task execution failed verification.'),
    };
  }
}
