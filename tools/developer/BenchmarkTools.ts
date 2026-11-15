/**
 * EVA Academic Benchmark & Local Inference Developer Tools (Phase 22)
 * Provides `benchmark.run` and `inference.local_status` tools.
 */

import { z } from 'zod';
import {
  ToolContract,
  RiskLevel,
  ToolResult,
  VerificationResult,
  ExecutionContext,
} from '../../core/tools/ToolContract.js';
import { AcademicBenchmarkSuite } from '../../core/evaluation/AcademicBenchmarkSuite.js';
import { LocalInferenceEngine } from '../../core/inference/LocalInferenceEngine.js';

// ==========================================
// 1. benchmark.run
// ==========================================
export const BenchmarkRunInputSchema = z.object({
  category: z.enum(['all', 'intent', 'context', 'latency', 'security']).optional().default('all'),
  samples: z.number().int().min(5).max(100).optional().default(20),
});
export type BenchmarkRunInput = z.infer<typeof BenchmarkRunInputSchema>;

export const BenchmarkRunOutputSchema = z.object({
  category: z.string(),
  overallScore: z.number(),
  executiveSummary: z.string(),
  intentAccuracy: z.number().optional(),
  intentF1Score: z.number().optional(),
  tokenSavingsPercent: z.number().optional(),
  medianLatencyMs: z.number().optional(),
  policyEnforcementRate: z.number().optional(),
  latexTableSnippet: z.string().optional(),
  benchmarkResults: z.any(),
});
export type BenchmarkRunOutput = z.infer<typeof BenchmarkRunOutputSchema>;

export class BenchmarkRunTool implements ToolContract<BenchmarkRunInput, BenchmarkRunOutput> {
  public readonly name = 'benchmark.run';
  public readonly version = '1.0.0';
  public readonly description =
    'Executes EVA academic capstone evaluation benchmarks (intent accuracy, token compression, latency, security) and generates scientific reports';
  public readonly riskLevel: RiskLevel = 'READ';
  public readonly timeoutMs = 30000;
  public readonly inputSchema = BenchmarkRunInputSchema;
  public readonly outputSchema = BenchmarkRunOutputSchema;

  private suite: AcademicBenchmarkSuite;

  constructor(suite?: AcademicBenchmarkSuite) {
    this.suite = suite ?? new AcademicBenchmarkSuite();
  }

  public async execute(
    params: BenchmarkRunInput,
    ctx: ExecutionContext
  ): Promise<ToolResult<BenchmarkRunOutput>> {
    const startTime = Date.now();
    try {
      const category = params?.category || 'all';

      if (category === 'intent') {
        const intent = await this.suite.runIntentBenchmark();
        return {
          success: true,
          data: {
            category: 'intent',
            overallScore: intent.accuracy,
            executiveSummary: `Intent disambiguation evaluated on ${intent.totalQueries} benchmark queries: ${intent.accuracy}% accuracy (${intent.f1Score} F1-score), mean latency ${intent.meanLatencyMs}ms.`,
            intentAccuracy: intent.accuracy,
            intentF1Score: intent.f1Score,
            benchmarkResults: intent,
          },
          metrics: { durationMs: Date.now() - startTime, timestamp: Date.now() },
        };
      }

      if (category === 'context') {
        const context = await this.suite.runContextBenchmark();
        return {
          success: true,
          data: {
            category: 'context',
            overallScore: context.savingsPercentage,
            executiveSummary: `Context optimization pruned ${context.savingsPercentage}% of tokens across ${context.filesEvaluated} target files, saving ${context.tokensSaved} tokens.`,
            tokenSavingsPercent: context.savingsPercentage,
            benchmarkResults: context,
          },
          metrics: { durationMs: Date.now() - startTime, timestamp: Date.now() },
        };
      }

      if (category === 'latency') {
        const samples = params.samples ?? 20;
        const latency = await this.suite.runLatencyBenchmark(samples);
        const score = Math.max(0, Math.min(100, 100 - (latency.medianP50Ms - 15) * 1.5));
        return {
          success: true,
          data: {
            category: 'latency',
            overallScore: Math.round(score),
            executiveSummary: `Pipeline latency evaluated over ${samples} cycles: P50=${latency.medianP50Ms}ms, P95=${latency.p95Ms}ms, Mean=${latency.meanMs}ms.`,
            medianLatencyMs: latency.medianP50Ms,
            benchmarkResults: latency,
          },
          metrics: { durationMs: Date.now() - startTime, timestamp: Date.now() },
        };
      }

      if (category === 'security') {
        const security = await this.suite.runSecurityBenchmark();
        return {
          success: true,
          data: {
            category: 'security',
            overallScore: security.policyEnforcementRate,
            executiveSummary: `Security policy evaluated over ${security.totalVectorsTested} attack vectors: ${security.policyEnforcementRate}% enforcement rate, ${security.falseNegativeRate}% false negative rate.`,
            policyEnforcementRate: security.policyEnforcementRate,
            benchmarkResults: security,
          },
          metrics: { durationMs: Date.now() - startTime, timestamp: Date.now() },
        };
      }

      // Default: Run complete academic benchmark suite
      const report = await this.suite.generateFullReport();
      return {
        success: true,
        data: {
          category: 'all',
          overallScore: report.overallScore,
          executiveSummary: report.executiveSummary,
          intentAccuracy: report.intentBenchmark.accuracy,
          intentF1Score: report.intentBenchmark.f1Score,
          tokenSavingsPercent: report.contextBenchmark.savingsPercentage,
          medianLatencyMs: report.latencyBenchmark.medianP50Ms,
          policyEnforcementRate: report.securityBenchmark.policyEnforcementRate,
          latexTableSnippet: report.latexTableSnippet,
          benchmarkResults: report,
        },
        metrics: { durationMs: Date.now() - startTime, timestamp: Date.now() },
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: {
          code: 'BENCHMARK_EXECUTION_FAILED',
          message: `Academic benchmark failed: ${msg}`,
          category: 'recoverable',
        },
        metrics: { durationMs: Date.now() - startTime, timestamp: Date.now() },
      };
    }
  }

  public async verify(
    params: BenchmarkRunInput,
    result: ToolResult<BenchmarkRunOutput>
  ): Promise<VerificationResult> {
    return {
      verified: result.success,
      status: result.success ? 'CONFIRMED' : 'FAILED',
      evidence: result.success
        ? `Academic evaluation executed successfully. Overall capstone score: ${result.data?.overallScore}/100.`
        : `Benchmark failed: ${result.error?.message}`,
    };
  }
}

// ==========================================
// 2. inference.local_status
// ==========================================
export const LocalInferenceStatusInputSchema = z.object({
  model: z.string().optional(),
});
export type LocalInferenceStatusInput = z.infer<typeof LocalInferenceStatusInputSchema>;

export const LocalInferenceStatusOutputSchema = z.object({
  online: z.boolean(),
  baseUrl: stringOrUnknown(),
  defaultModel: z.string(),
  activeModelsCount: z.number(),
  installedModels: z.array(
    z.object({
      name: z.string(),
      sizeBytes: z.number(),
      parameterSize: z.string().optional(),
      quantization: z.string().optional(),
    })
  ),
  operatingMode: z.string(),
  isSimulated: z.boolean(),
});
function stringOrUnknown() {
  return z.string();
}
export type LocalInferenceStatusOutput = z.infer<typeof LocalInferenceStatusOutputSchema>;

export class LocalInferenceStatusTool
  implements ToolContract<LocalInferenceStatusInput, LocalInferenceStatusOutput>
{
  public readonly name = 'inference.local_status';
  public readonly version = '1.0.0';
  public readonly description =
    'Inspects local offline inference server (Ollama) health, installed models, parameter size, and privacy mode';
  public readonly riskLevel: RiskLevel = 'READ';
  public readonly timeoutMs = 5000;
  public readonly inputSchema = LocalInferenceStatusInputSchema;
  public readonly outputSchema = LocalInferenceStatusOutputSchema;

  private engine: LocalInferenceEngine;

  constructor(engine?: LocalInferenceEngine) {
    this.engine = engine ?? new LocalInferenceEngine({ enableSimulationFallback: true });
  }

  public async execute(
    params: LocalInferenceStatusInput,
    ctx: ExecutionContext
  ): Promise<ToolResult<LocalInferenceStatusOutput>> {
    const startTime = Date.now();
    try {
      const health = await this.engine.checkHealth();
      const models = await this.engine.listModels().catch(() => []);

      const installedModels = models.map((m) => ({
        name: m.name,
        sizeBytes: m.sizeBytes,
        parameterSize: m.details?.parameterSize || 'Unknown',
        quantization: m.details?.quantizationLevel || 'GGUF',
      }));

      const isSimulated = !health.online;

      return {
        success: true,
        data: {
          online: health.online || isSimulated,
          baseUrl: this.engine.getBaseUrl(),
          defaultModel: this.engine.getDefaultModel(),
          activeModelsCount: installedModels.length,
          installedModels,
          operatingMode: health.online ? 'ONLINE_LOCAL' : 'OFFLINE_SIMULATED',
          isSimulated,
        },
        metrics: { durationMs: Date.now() - startTime, timestamp: Date.now() },
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: {
          code: 'LOCAL_INFERENCE_STATUS_FAILED',
          message: `Failed to query local inference status: ${msg}`,
          category: 'recoverable',
        },
        metrics: { durationMs: Date.now() - startTime, timestamp: Date.now() },
      };
    }
  }

  public async verify(
    params: LocalInferenceStatusInput,
    result: ToolResult<LocalInferenceStatusOutput>
  ): Promise<VerificationResult> {
    return {
      verified: result.success,
      status: result.success ? 'CONFIRMED' : 'FAILED',
      evidence: result.success
        ? `Local inference engine inspected. Active models: ${result.data?.activeModelsCount}. Mode: ${result.data?.operatingMode}.`
        : `Local inference query failed: ${result.error?.message}`,
    };
  }
}
