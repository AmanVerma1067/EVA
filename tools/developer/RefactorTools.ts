/**
 * EVA Autonomous Self-Healing Refactor Tools (Phase 20)
 * Provides dev.self_healing_refactor tool
 */

import { z } from 'zod';
import { ToolContract, RiskLevel, ToolResult, VerificationResult, ExecutionContext } from '../../core/tools/ToolContract.js';
import { SelfHealingLoop, RefactorStatus } from '../../core/refactor/SelfHealingLoop.js';

export const RefactorInputSchema = z.object({
  targetFiles: z.array(z.string()).min(1),
  refactorGoal: z.string().min(1),
  patch: z.string().optional(),
  edits: z.array(z.object({ target: z.string(), replacement: z.string() })).optional(),
  testCommand: z.string().optional(),
  dryRun: z.boolean().optional(),
  skipYagni: z.boolean().optional(),
});
export type RefactorToolInput = z.infer<typeof RefactorInputSchema>;

export const RefactorOutputSchema = z.object({
  status: z.enum(['SUCCESS', 'ROLLED_BACK', 'REJECTED', 'DRY_RUN']),
  refactorGoal: z.string(),
  appliedFiles: z.array(z.string()),
  diffSummary: z.string(),
  rollbackOccurred: z.boolean(),
  rollbackReason: z.string().optional(),
  durationMs: z.number(),
  message: z.string(),
});
export type RefactorToolOutput = z.infer<typeof RefactorOutputSchema>;

export class SelfHealingRefactorTool implements ToolContract<RefactorToolInput, RefactorToolOutput> {
  public readonly name = 'dev.self_healing_refactor';
  public readonly version = '1.0.0';
  public readonly description = 'Executes autonomous test-driven refactoring with snapshot backups and guaranteed automatic rollback on test failure';
  public readonly riskLevel: RiskLevel = 'SENSITIVE';
  public readonly timeoutMs = 60000;
  public readonly inputSchema = RefactorInputSchema;
  public readonly outputSchema = RefactorOutputSchema;

  private loop: SelfHealingLoop;

  constructor(options?: { loop?: SelfHealingLoop }) {
    this.loop = options?.loop ?? new SelfHealingLoop();
  }

  public async execute(params: RefactorToolInput, ctx: ExecutionContext): Promise<ToolResult<RefactorToolOutput>> {
    const startTime = Date.now();
    try {
      const patches = params.patch || params.edits
        ? params.targetFiles.map((file) => ({
            filePath: file,
            patch: params.patch,
            edits: params.edits,
          }))
        : undefined;

      const res = await this.loop.executeRefactor({
        targetFiles: params.targetFiles,
        refactorGoal: params.refactorGoal,
        patches,
        testCommand: params.testCommand,
        dryRun: params.dryRun,
        skipYagni: params.skipYagni,
        workspaceRoot: ctx.workspaceRoot,
      });

      return {
        success: res.status === 'SUCCESS' || res.status === 'DRY_RUN',
        data: {
          status: res.status,
          refactorGoal: res.refactorGoal,
          appliedFiles: res.appliedFiles,
          diffSummary: res.diffSummary,
          rollbackOccurred: res.rollbackOccurred,
          rollbackReason: res.rollbackReason,
          durationMs: res.durationMs,
          message: res.message,
        },
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    } catch (err: unknown) {
      return {
        success: false,
        error: {
          code: 'REFACTOR_LOOP_ERROR',
          message: err instanceof Error ? err.message : String(err),
          category: 'recoverable',
        },
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    }
  }

  public async verify(params: RefactorToolInput, result: ToolResult<RefactorToolOutput>): Promise<VerificationResult> {
    if (!result.data) {
      return { verified: false, status: 'FAILED', evidence: 'Refactor execution returned no data' };
    }

    if (result.data.status === 'SUCCESS') {
      return {
        verified: true,
        status: 'CONFIRMED',
        evidence: `Refactor committed cleanly: ${result.data.appliedFiles.length} file(s) modified with 100% test pass rate.`,
      };
    }

    if (result.data.status === 'DRY_RUN') {
      return {
        verified: true,
        status: 'CONFIRMED',
        evidence: `Dry run preview completed without disk mutation.`,
      };
    }

    if (result.data.rollbackOccurred) {
      return {
        verified: true,
        status: 'CONFIRMED',
        evidence: `Automatic rollback confirmed: original files restored after failure (${result.data.rollbackReason}).`,
      };
    }

    return {
      verified: false,
      status: 'FAILED',
      evidence: `Refactor rejected or failed without rollback: ${result.data.message}`,
    };
  }
}
