/**
 * EVA Context & Token Optimization Tools (Phase 18)
 * Provides context.analyze and context.budget tools
 */

import { z } from 'zod';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { ToolContract, RiskLevel, ToolResult, VerificationResult, ExecutionContext } from '../../core/tools/ToolContract.js';
import { ASTSymbolParser } from '../../core/context/ASTSymbolParser.js';
import { ContextPruner } from '../../core/context/ContextPruner.js';
import { TokenBudgetRadar } from '../../core/context/TokenBudgetRadar.js';

// ==========================================
// 1. context.analyze
// ==========================================
export const ContextAnalyzeInputSchema = z.object({
  path: z.string().min(1),
  targetSymbol: z.string().optional(),
});
export type ContextAnalyzeInput = z.infer<typeof ContextAnalyzeInputSchema>;

export const ContextAnalyzeOutputSchema = z.object({
  filePath: z.string(),
  originalTokens: z.number(),
  slicedTokens: z.number(),
  tokensSaved: z.number(),
  reductionPercentage: z.number(),
  symbolsCount: z.number(),
  symbols: z.array(z.string()),
  contextSlice: z.string(),
});
export type ContextAnalyzeOutput = z.infer<typeof ContextAnalyzeOutputSchema>;

export class ContextAnalyzeTool implements ToolContract<ContextAnalyzeInput, ContextAnalyzeOutput> {
  public readonly name = 'context.analyze';
  public readonly version = '1.0.0';
  public readonly description = 'Analyzes a file with AST symbol parsing and generates an 80%+ compressed context slice';
  public readonly riskLevel: RiskLevel = 'READ';
  public readonly timeoutMs = 15000;
  public readonly inputSchema = ContextAnalyzeInputSchema;
  public readonly outputSchema = ContextAnalyzeOutputSchema;

  private parser: ASTSymbolParser;
  private pruner: ContextPruner;

  constructor(options?: { parser?: ASTSymbolParser; pruner?: ContextPruner }) {
    this.parser = options?.parser ?? new ASTSymbolParser();
    this.pruner = options?.pruner ?? new ContextPruner(this.parser);
  }

  public async execute(params: ContextAnalyzeInput, ctx: ExecutionContext): Promise<ToolResult<ContextAnalyzeOutput>> {
    const startTime = Date.now();
    try {
      const resolved = path.isAbsolute(params.path) ? params.path : path.resolve(ctx.workspaceRoot, params.path);
      if (!fs.existsSync(resolved)) {
        return {
          success: false,
          error: {
            code: 'FILE_NOT_FOUND',
            message: `Target file not found: ${resolved}`,
            category: 'recoverable',
          },
          metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
        };
      }

      const code = fs.readFileSync(resolved, 'utf-8');
      const parsed = this.parser.parseSource(code, path.basename(resolved));
      const slice = this.parser.createContextSlice({
        code,
        fileName: path.basename(resolved),
        targetSymbol: params.targetSymbol,
      });

      return {
        success: true,
        data: {
          filePath: params.path,
          originalTokens: slice.originalTokens,
          slicedTokens: slice.slicedTokens,
          tokensSaved: slice.tokensSaved,
          reductionPercentage: slice.reductionPercentage,
          symbolsCount: parsed.symbols.length,
          symbols: parsed.symbols.map((s) => `${s.kind} ${s.name}`),
          contextSlice: slice.slicedCode,
        },
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'CONTEXT_ANALYZE_ERROR',
          message: String(err),
          category: 'recoverable',
        },
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    }
  }

  public async verify(params: ContextAnalyzeInput, result: ToolResult<ContextAnalyzeOutput>): Promise<VerificationResult> {
    if (!result.success) {
      return { verified: false, status: 'FAILED', evidence: result.error?.message ?? 'Analysis failed' };
    }
    const evidence = `Parsed ${result.data?.symbolsCount} symbols; reduced tokens by ${result.data?.reductionPercentage}% (${result.data?.tokensSaved} tokens saved).`;
    return { verified: true, status: 'CONFIRMED', evidence };
  }
}

// ==========================================
// 2. context.budget
// ==========================================
export const ContextBudgetInputSchema = z.object({
  action: z.enum(['status', 'set_limit']).optional().default('status'),
  dailyLimit: z.number().positive().optional(),
});
export type ContextBudgetInput = z.infer<typeof ContextBudgetInputSchema>;

export const ContextBudgetOutputSchema = z.object({
  sessionTotalTokens: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  cachedTokens: z.number(),
  costUsd: z.number(),
  dailyLimit: z.number(),
  usagePercentage: z.number(),
  remainingTokens: z.number(),
  gauge: z.string(),
  claudeLimitDetected: z.boolean(),
  claudeLimitDetails: z.string().optional(),
});
export type ContextBudgetOutput = z.infer<typeof ContextBudgetOutputSchema>;

export class ContextBudgetTool implements ToolContract<ContextBudgetInput, ContextBudgetOutput> {
  public readonly name = 'context.budget';
  public readonly version = '1.0.0';
  public readonly description = 'Reports real-time token utilization, cost estimates, and Claude Code quota limits';
  public readonly riskLevel: RiskLevel = 'READ';
  public readonly timeoutMs = 5000;
  public readonly inputSchema = ContextBudgetInputSchema;
  public readonly outputSchema = ContextBudgetOutputSchema;

  private radar: TokenBudgetRadar;

  constructor(options?: { radar?: TokenBudgetRadar }) {
    this.radar = options?.radar ?? new TokenBudgetRadar();
  }

  public async execute(params: ContextBudgetInput): Promise<ToolResult<ContextBudgetOutput>> {
    const startTime = Date.now();
    try {
      if (params.action === 'set_limit' && params.dailyLimit) {
        this.radar.setBudgetConfig({ dailyTokenLimit: params.dailyLimit });
      }

      const report = this.radar.getStatusReport();

      return {
        success: true,
        data: {
          sessionTotalTokens: report.sessionTotalTokens,
          inputTokens: report.inputTokens,
          outputTokens: report.outputTokens,
          cachedTokens: report.cachedTokens,
          costUsd: report.costUsd,
          dailyLimit: report.dailyLimit,
          usagePercentage: report.usagePercentage,
          remainingTokens: report.remainingTokens,
          gauge: report.gauge,
          claudeLimitDetected: report.claudeLimit.hasLimit,
          claudeLimitDetails: report.claudeLimit.rawMessage,
        },
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'CONTEXT_BUDGET_ERROR',
          message: String(err),
          category: 'recoverable',
        },
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    }
  }

  public async verify(params: ContextBudgetInput, result: ToolResult<ContextBudgetOutput>): Promise<VerificationResult> {
    return {
      verified: result.success,
      status: result.success ? 'CONFIRMED' : 'FAILED',
      evidence: result.data ? `Tokens: ${result.data.sessionTotalTokens} ($${result.data.costUsd} USD)` : 'Failed to query budget',
    };
  }
}
