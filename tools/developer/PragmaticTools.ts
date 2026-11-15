/**
 * EVA "Ponytail" Pragmatic AI Developer Tools (Phase 19)
 * Provides pragmatic.yagni_eval and code.review tools
 */

import { z } from 'zod';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { ToolContract, RiskLevel, ToolResult, VerificationResult, ExecutionContext } from '../../core/tools/ToolContract.js';
import { YagniDecisionLadder, YagniEvaluationResult } from '../../core/pragmatic/YagniDecisionLadder.js';
import { CodeReviewAuditor, CodeReviewResult } from '../../core/pragmatic/CodeReviewAuditor.js';

// ==========================================
// 1. pragmatic.yagni_eval
// ==========================================
export const PragmaticYagniInputSchema = z.object({
  taskDescription: z.string().min(1),
  proposedDependency: z.string().optional(),
  codeSnippet: z.string().optional(),
  estimatedLinesOfCode: z.number().optional(),
});
export type PragmaticYagniInput = z.infer<typeof PragmaticYagniInputSchema>;

export const PragmaticYagniOutputSchema = z.object({
  decision: z.string(),
  step: z.number(),
  stepName: z.string(),
  mode: z.string(),
  approved: z.boolean(),
  rationale: z.string(),
  suggestedApproach: z.string(),
  locBudget: z.number(),
  warnings: z.array(z.string()),
  remediation: z.string().optional(),
});
export type PragmaticYagniOutput = z.infer<typeof PragmaticYagniOutputSchema>;

export class PragmaticYagniTool implements ToolContract<PragmaticYagniInput, PragmaticYagniOutput> {
  public readonly name = 'pragmatic.yagni_eval';
  public readonly version = '1.0.0';
  public readonly description = 'Evaluates a proposed feature, task, or dependency against the 7-step Ponytail YAGNI decision ladder';
  public readonly riskLevel: RiskLevel = 'READ';
  public readonly timeoutMs = 10000;
  public readonly inputSchema = PragmaticYagniInputSchema;
  public readonly outputSchema = PragmaticYagniOutputSchema;

  private ladder: YagniDecisionLadder;

  constructor(options?: { ladder?: YagniDecisionLadder }) {
    this.ladder = options?.ladder ?? new YagniDecisionLadder();
  }

  public async execute(params: PragmaticYagniInput, ctx: ExecutionContext): Promise<ToolResult<PragmaticYagniOutput>> {
    const startTime = Date.now();
    try {
      const evaluation = this.ladder.evaluate({
        taskDescription: params.taskDescription,
        proposedDependency: params.proposedDependency,
        codeSnippet: params.codeSnippet,
        workspaceRoot: ctx.workspaceRoot,
        estimatedLinesOfCode: params.estimatedLinesOfCode,
      });

      return {
        success: true,
        data: evaluation,
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    } catch (err: unknown) {
      return {
        success: false,
        error: {
          code: 'YAGNI_EVAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
          category: 'recoverable',
        },
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    }
  }

  public async verify(params: PragmaticYagniInput, result: ToolResult<PragmaticYagniOutput>): Promise<VerificationResult> {
    if (!result.success || !result.data) {
      return { verified: false, status: 'FAILED', evidence: 'YAGNI evaluation failed to produce valid result' };
    }
    return { verified: true, status: 'CONFIRMED', evidence: `YAGNI evaluated: Decision=${result.data.decision} Step=${result.data.stepName}` };
  }
}

// ==========================================
// 2. code.review
// ==========================================
export const CodeReviewInputSchema = z.object({
  path: z.string().optional(),
  code: z.string().optional(),
  diff: z.string().optional(),
});
export type CodeReviewInput = z.infer<typeof CodeReviewInputSchema>;

export const CodeReviewOutputSchema = z.object({
  filePath: z.string().optional(),
  score: z.number(),
  verdict: z.enum(['PASS', 'WARN', 'FAIL']),
  violationsCount: z.number(),
  violations: z.array(
    z.object({
      rule: z.string(),
      severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']),
      line: z.number().optional(),
      message: z.string(),
      snippet: z.string().optional(),
      remediation: z.string(),
    })
  ),
  metrics: z.object({
    totalLines: z.number(),
    codeLines: z.number(),
    commentLines: z.number(),
    blankLines: z.number(),
    functionCount: z.number(),
    complexityScore: z.number(),
    secretLeaksFound: z.number(),
  }),
  summary: z.string(),
});
export type CodeReviewOutput = z.infer<typeof CodeReviewOutputSchema>;

export class CodeReviewTool implements ToolContract<CodeReviewInput, CodeReviewOutput> {
  public readonly name = 'code.review';
  public readonly version = '1.0.0';
  public readonly description = 'Performs automated static code review, quality scoring, secret leak detection, and anti-over-engineering audit';
  public readonly riskLevel: RiskLevel = 'READ';
  public readonly timeoutMs = 15000;
  public readonly inputSchema = CodeReviewInputSchema;
  public readonly outputSchema = CodeReviewOutputSchema;

  private auditor: CodeReviewAuditor;

  constructor(options?: { auditor?: CodeReviewAuditor }) {
    this.auditor = options?.auditor ?? new CodeReviewAuditor();
  }

  public async execute(params: CodeReviewInput, ctx: ExecutionContext): Promise<ToolResult<CodeReviewOutput>> {
    const startTime = Date.now();
    try {
      let result: CodeReviewResult;

      if (params.diff) {
        result = this.auditor.auditDiff(params.diff);
      } else if (params.code) {
        result = this.auditor.auditCode(params.code, params.path || 'snippet.ts');
      } else if (params.path) {
        const resolved = path.isAbsolute(params.path) ? params.path : path.resolve(ctx.workspaceRoot, params.path);
        result = await this.auditor.auditFile(resolved);
      } else {
        return {
          success: false,
          error: {
            code: 'INVALID_PARAMETERS',
            message: 'Either path, code, or diff must be provided for code.review',
            category: 'recoverable',
          },
          metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
        };
      }

      return {
        success: result.verdict !== 'FAIL' || result.score >= 0, // tool execution succeeded even if code failed audit
        data: result,
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    } catch (err: unknown) {
      return {
        success: false,
        error: {
          code: 'CODE_REVIEW_ERROR',
          message: err instanceof Error ? err.message : String(err),
          category: 'recoverable',
        },
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    }
  }

  public async verify(params: CodeReviewInput, result: ToolResult<CodeReviewOutput>): Promise<VerificationResult> {
    if (!result.success || !result.data) {
      return { verified: false, status: 'FAILED', evidence: 'Code review execution failed' };
    }
    return {
      verified: true,
      status: 'CONFIRMED',
      evidence: `Code review completed: Score=${result.data.score}/100 Verdict=${result.data.verdict} Violations=${result.data.violationsCount}`,
    };
  }
}
