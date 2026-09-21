/**
 * EVA Terminal Command Execution Tool
 * Conforms to EVA_AI_Implementation_Master_Spec Section 8 (Phase 2)
 */

import { z } from 'zod';
import { exec } from 'node:child_process';
import { ToolContract, ToolResult, VerificationResult, ExecutionContext, RiskLevel } from '../../core/tools/ToolContract.js';

export const TerminalExecInputSchema = z.object({
  command: z.string().min(1),
  cwd: z.string().optional(),
  timeoutMs: z.number().int().positive().max(60000).optional(),
});

export const TerminalExecOutputSchema = z.object({
  exitCode: z.number(),
  stdout: z.string(),
  stderr: z.string(),
  executionId: z.string(),
});

export type TerminalExecInput = z.infer<typeof TerminalExecInputSchema>;
export type TerminalExecOutput = z.infer<typeof TerminalExecOutputSchema>;

// Global execution buffer for output retrieval
export const terminalExecutionBuffer = new Map<string, TerminalExecOutput>();

export class TerminalExecTool implements ToolContract<TerminalExecInput, TerminalExecOutput> {
  public readonly name = 'terminal.exec';
  public readonly version = '1.0.0';
  public readonly description = 'Executes a command inside the scoped terminal';
  public readonly riskLevel: RiskLevel = 'NORMAL';
  public readonly timeoutMs = 30000;

  public readonly inputSchema = TerminalExecInputSchema;
  public readonly outputSchema = TerminalExecOutputSchema;

  private executor?: (command: string, cwd?: string) => Promise<{ exitCode: number; stdout: string; stderr: string }>;

  constructor(options?: {
    executor?: (command: string, cwd?: string) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
  }) {
    this.executor = options?.executor;
  }

  public async execute(params: TerminalExecInput, ctx: ExecutionContext): Promise<ToolResult<TerminalExecOutput>> {
    const startTime = Date.now();
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const effectiveCwd = params.cwd ?? ctx.workspaceRoot;

    try {
      let exitCode = 0;
      let stdout = '';
      let stderr = '';

      if (this.executor) {
        const res = await this.executor(params.command, effectiveCwd);
        exitCode = res.exitCode;
        stdout = res.stdout;
        stderr = res.stderr;
      } else {
        const timeout = params.timeoutMs ?? this.timeoutMs;
        const result = await new Promise<{ exitCode: number; stdout: string; stderr: string }>((resolve, reject) => {
          const child = exec(
            params.command,
            {
              cwd: effectiveCwd,
              timeout,
              maxBuffer: 1024 * 1024, // 1MB buffer cap
            },
            (error, stdoutBuf, stderrBuf) => {
              if (error && typeof error.code !== 'number') {
                return reject(error);
              }
              resolve({
                exitCode: error?.code ?? 0,
                stdout: stdoutBuf.toString(),
                stderr: stderrBuf.toString(),
              });
            }
          );

          ctx.abortSignal.addEventListener('abort', () => {
            child.kill('SIGTERM');
          });
        });

        exitCode = result.exitCode;
        stdout = result.stdout;
        stderr = result.stderr;
      }

      // Max 50KB truncation for safe transport
      const MAX_CHARS = 50000;
      const truncatedStdout = stdout.length > MAX_CHARS ? stdout.slice(0, MAX_CHARS) + '\n...[TRUNCATED]' : stdout;
      const truncatedStderr = stderr.length > MAX_CHARS ? stderr.slice(0, MAX_CHARS) + '\n...[TRUNCATED]' : stderr;

      const outputData: TerminalExecOutput = {
        exitCode,
        stdout: truncatedStdout,
        stderr: truncatedStderr,
        executionId,
      };

      terminalExecutionBuffer.set(executionId, outputData);

      const isSuccess = exitCode === 0;

      return {
        success: isSuccess,
        data: outputData,
        error: isSuccess
          ? undefined
          : {
              code: 'PROCESS_EXIT_NON_ZERO',
              message: `Command exited with code ${exitCode}`,
              category: 'recoverable',
              details: { exitCode, stderr: truncatedStderr },
            },
        metrics: {
          durationMs: Date.now() - startTime,
          timestamp: startTime,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'COMMAND_SPAWN_FAILED',
          message: `Failed to execute command: ${String(err)}`,
          category: 'recoverable',
        },
        metrics: {
          durationMs: Date.now() - startTime,
          timestamp: startTime,
        },
      };
    }
  }

  public async verify(
    params: TerminalExecInput,
    result: ToolResult<TerminalExecOutput>
  ): Promise<VerificationResult> {
    if (!result.success || !result.data) {
      return {
        verified: false,
        status: 'FAILED',
        evidence: `Execution failed or returned non-zero code. Error: ${result.error?.message}`,
      };
    }

    return {
      verified: result.data.exitCode === 0,
      status: result.data.exitCode === 0 ? 'CONFIRMED' : 'FAILED',
      evidence: `Process exited with code ${result.data.exitCode}. Output bytes: ${result.data.stdout.length}`,
    };
  }
}

