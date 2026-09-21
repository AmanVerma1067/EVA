/**
 * EVA Developer Git Integration Tools (Phase 11)
 * Provides git.status, git.diff, and git.commit operations with workspace scoping.
 */

import { z } from 'zod';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ToolContract, RiskLevel, ToolResult, VerificationResult, ExecutionContext } from '../../core/tools/ToolContract.js';

const execFileAsync = promisify(execFile);

// ==========================================
// 1. git.status
// ==========================================
export const GitStatusInputSchema = z.object({
  short: z.boolean().optional().default(true),
});
export type GitStatusInput = z.input<typeof GitStatusInputSchema>;

export const GitStatusOutputSchema = z.object({
  branch: z.string(),
  isClean: z.boolean(),
  statusText: z.string(),
});
export type GitStatusOutput = z.infer<typeof GitStatusOutputSchema>;

export class GitStatusTool implements ToolContract<GitStatusInput, GitStatusOutput> {
  public readonly name = 'git.status';
  public readonly version = '1.0.0';
  public readonly description = 'Checks working tree status and active git branch';
  public readonly riskLevel: RiskLevel = 'READ';
  public readonly timeoutMs = 10000;
  public readonly inputSchema = GitStatusInputSchema;
  public readonly outputSchema = GitStatusOutputSchema;

  private runner?: (cwd: string) => Promise<{ branch: string; statusText: string }>;

  constructor(options?: { runner?: (cwd: string) => Promise<{ branch: string; statusText: string }> }) {
    this.runner = options?.runner;
  }

  public async execute(params: GitStatusInput, ctx: ExecutionContext): Promise<ToolResult<GitStatusOutput>> {
    const startTime = Date.now();
    try {
      if (this.runner) {
        const mock = await this.runner(ctx.workspaceRoot);
        return {
          success: true,
          data: {
            branch: mock.branch,
            isClean: mock.statusText.trim().length === 0,
            statusText: mock.statusText,
          },
          metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
        };
      }

      const branchRes = await execFileAsync('git', ['branch', '--show-current'], {
        cwd: ctx.workspaceRoot,
        signal: ctx.abortSignal,
      });
      const branch = branchRes.stdout.trim() || 'HEAD';

      const statusRes = await execFileAsync('git', ['status', '--short'], {
        cwd: ctx.workspaceRoot,
        signal: ctx.abortSignal,
      });
      const statusText = statusRes.stdout.trim();

      return {
        success: true,
        data: {
          branch,
          isClean: statusText.length === 0,
          statusText: statusText || 'Working tree clean',
        },
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    } catch (err) {
      const errMsg = String(err);
      if (errMsg.includes('not a git repository')) {
        return {
          success: false,
          error: {
            code: 'NOT_A_GIT_REPOSITORY',
            message: `Workspace '${ctx.workspaceRoot}' is not a git repository.`,
            category: 'recoverable',
          },
          metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
        };
      }
      return {
        success: false,
        error: { code: 'GIT_STATUS_FAILED', message: errMsg, category: 'recoverable' },
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    }
  }

  public async verify(params: GitStatusInput, result: ToolResult<GitStatusOutput>): Promise<VerificationResult> {
    return {
      verified: result.success,
      status: result.success ? 'CONFIRMED' : 'FAILED',
      evidence: result.success ? `On branch ${result.data?.branch}.` : 'Failed.',
    };
  }
}

// ==========================================
// 2. git.commit
// ==========================================
export const GitCommitInputSchema = z.object({
  message: z.string().min(1, 'Commit message cannot be empty'),
  files: z.array(z.string()).optional().default(['.']),
});
export type GitCommitInput = z.input<typeof GitCommitInputSchema>;

export const GitCommitOutputSchema = z.object({
  committed: z.boolean(),
  commitHash: z.string(),
  message: z.string(),
});
export type GitCommitOutput = z.infer<typeof GitCommitOutputSchema>;

export class GitCommitTool implements ToolContract<GitCommitInput, GitCommitOutput> {
  public readonly name = 'git.commit';
  public readonly version = '1.0.0';
  public readonly description = 'Stages files and creates a git commit';
  public readonly riskLevel: RiskLevel = 'SENSITIVE'; // Modifies git repository history
  public readonly timeoutMs = 15000;
  public readonly inputSchema = GitCommitInputSchema;
  public readonly outputSchema = GitCommitOutputSchema;

  private runner?: (message: string, files: string[]) => Promise<{ commitHash: string }>;

  constructor(options?: { runner?: (message: string, files: string[]) => Promise<{ commitHash: string }> }) {
    this.runner = options?.runner;
  }

  public async execute(params: GitCommitInput, ctx: ExecutionContext): Promise<ToolResult<GitCommitOutput>> {
    const startTime = Date.now();
    const files = params.files ?? ['.'];
    try {
      if (this.runner) {
        const mock = await this.runner(params.message, files);
        return {
          success: true,
          data: {
            committed: true,
            commitHash: mock.commitHash,
            message: params.message,
          },
          metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
        };
      }

      await execFileAsync('git', ['add', ...files], {
        cwd: ctx.workspaceRoot,
        signal: ctx.abortSignal,
      });

      await execFileAsync('git', ['commit', '-m', params.message], {
        cwd: ctx.workspaceRoot,
        signal: ctx.abortSignal,
      });

      const hashRes = await execFileAsync('git', ['rev-parse', '--short', 'HEAD'], {
        cwd: ctx.workspaceRoot,
        signal: ctx.abortSignal,
      });
      const hash = hashRes.stdout.trim();

      return {
        success: true,
        data: {
          committed: true,
          commitHash: hash,
          message: params.message,
        },
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    } catch (err) {
      const errMsg = String(err);
      if (errMsg.includes('not a git repository')) {
        return {
          success: false,
          error: {
            code: 'NOT_A_GIT_REPOSITORY',
            message: `Workspace '${ctx.workspaceRoot}' is not a git repository.`,
            category: 'recoverable',
          },
          metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
        };
      }
      if (errMsg.includes('nothing to commit') || errMsg.includes('clean')) {
        return {
          success: false,
          error: {
            code: 'NOTHING_TO_COMMIT',
            message: 'Nothing to commit, working tree is clean.',
            category: 'recoverable',
          },
          metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
        };
      }
      return {
        success: false,
        error: { code: 'GIT_COMMIT_FAILED', message: errMsg, category: 'recoverable' },
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    }
  }

  public async verify(params: GitCommitInput, result: ToolResult<GitCommitOutput>): Promise<VerificationResult> {
    return {
      verified: result.success,
      status: result.success ? 'CONFIRMED' : 'FAILED',
      evidence: result.success ? `Commit ${result.data?.commitHash} created.` : 'Commit failed.',
    };
  }
}
