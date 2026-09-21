/**
 * EVA Application Status Tool
 * Conforms to EVA_AI_Implementation_Master_Spec Section 8 (Phase 2)
 */

import { z } from 'zod';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ToolContract, ToolResult, VerificationResult, ExecutionContext, RiskLevel } from '../../core/tools/ToolContract.js';
import { normalizeMacAppName, findMacAppPids } from './AppLaunchTool.js';

const execFileAsync = promisify(execFile);

export const AppStatusInputSchema = z.object({
  appName: z.string().min(1).regex(/^[a-zA-Z0-9 ._-]+$/),
});

export const AppStatusOutputSchema = z.object({
  appName: z.string(),
  running: z.boolean(),
  pids: z.array(z.number()),
});

export type AppStatusInput = z.infer<typeof AppStatusInputSchema>;
export type AppStatusOutput = z.infer<typeof AppStatusOutputSchema>;

export class AppStatusTool implements ToolContract<AppStatusInput, AppStatusOutput> {
  public readonly name = 'app.status';
  public readonly version = '1.0.0';
  public readonly description = 'Checks whether a macOS application process is currently active';
  public readonly riskLevel: RiskLevel = 'READ';
  public readonly timeoutMs = 5000;

  public readonly inputSchema = AppStatusInputSchema;
  public readonly outputSchema = AppStatusOutputSchema;

  private inspector?: (appName: string) => Promise<number[]>;

  constructor(options?: { inspector?: (appName: string) => Promise<number[]> }) {
    this.inspector = options?.inspector;
  }

  public async execute(params: AppStatusInput, ctx: ExecutionContext): Promise<ToolResult<AppStatusOutput>> {
    const startTime = Date.now();
    const cleanApp = normalizeMacAppName(params.appName);

    try {
      let pids: number[] = [];

      if (this.inspector) {
        pids = await this.inspector(cleanApp);
      } else {
        pids = await findMacAppPids(cleanApp, ctx.abortSignal);
      }

      return {
        success: true,
        data: {
          appName: cleanApp,
          running: pids.length > 0,
          pids,
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
          code: 'STATUS_CHECK_FAILED',
          message: `Failed to inspect status for '${cleanApp}': ${String(err)}`,
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
    params: AppStatusInput,
    result: ToolResult<AppStatusOutput>
  ): Promise<VerificationResult> {
    if (!result.success || !result.data) {
      return {
        verified: false,
        status: 'FAILED',
        evidence: 'Inspection failed to return status data.',
      };
    }

    return {
      verified: true,
      status: 'CONFIRMED',
      evidence: `Status verified: '${result.data.appName}' is ${result.data.running ? 'RUNNING' : 'NOT_RUNNING'} (PIDs: ${result.data.pids.join(',') || 'none'}).`,
    };
  }
}
