/**
 * Academic Capstone Evaluation Benchmark Unit Tests (Phase 22)
 */

import { describe, it, expect } from 'vitest';
import { AcademicBenchmarkSuite } from '../../../core/evaluation/AcademicBenchmarkSuite.js';
import { BenchmarkRunTool } from '../../../tools/developer/BenchmarkTools.js';
import { ExecutionContext } from '../../../core/tools/ToolContract.js';

describe('Phase 22: Academic Capstone Evaluation Benchmark Suite', () => {
  const suite = new AcademicBenchmarkSuite();

  const dummyCtx: ExecutionContext = {
    taskId: 'test-bench-1',
    sessionId: 'test-sess-1',
    deviceId: 'test-dev-1',
    workspaceRoot: '/home/aman/Desktop/Hackathon/EVA',
    abortSignal: new AbortController().signal,
  };

  it('should run Intent Disambiguation benchmark with >= 95% accuracy and compute F1-score', async () => {
    const intent = await suite.runIntentBenchmark();
    expect(intent.totalQueries).toBeGreaterThanOrEqual(15);
    expect(intent.accuracy).toBeGreaterThanOrEqual(95);
    expect(intent.f1Score).toBeGreaterThanOrEqual(0.95);
    expect(intent.meanLatencyMs).toBeLessThan(10); // Under 10ms for local intent resolution
    expect(intent.results.length).toBe(intent.totalQueries);
  });

  it('should run Context Compression benchmark and verify token reduction percentage', async () => {
    const context = await suite.runContextBenchmark();
    expect(context.filesEvaluated).toBe(3);
    expect(context.totalRawTokens).toBeGreaterThan(context.totalPrunedTokens);
    expect(context.tokensSaved).toBeGreaterThan(0);
    expect(context.savingsPercentage).toBeGreaterThanOrEqual(20);
    expect(context.estimatedCostSavingsPer100kCallsUsd.claudeSonnet35).toBeGreaterThan(0);
  });

  it('should profile pipeline latency and calculate statistical percentiles (Mean, P50, P95)', async () => {
    const latency = await suite.runLatencyBenchmark(10);
    expect(latency.sampleCount).toBe(10);
    expect(latency.meanMs).toBeGreaterThan(0);
    expect(latency.medianP50Ms).toBeGreaterThan(0);
    expect(latency.p95Ms).toBeGreaterThanOrEqual(latency.medianP50Ms);
    expect(latency.breakdownByStage.normalizationMeanMs).toBeDefined();
    expect(latency.breakdownByStage.intentResolutionMeanMs).toBeDefined();
    expect(latency.breakdownByStage.policyCheckMeanMs).toBeDefined();
  });

  it('should evaluate 4-tier security policy and verify 100% enforcement with 0% false negatives', async () => {
    const security = await suite.runSecurityBenchmark();
    expect(security.totalVectorsTested).toBe(10);
    expect(security.policyEnforcementRate).toBe(100);
    expect(security.falseNegativeRate).toBe(0);
    expect(security.passed).toBe(true);
    expect(security.blockedViolations).toBeGreaterThanOrEqual(5);
  });

  it('should synthesize full academic capstone report with composite score and LaTeX table', async () => {
    const report = await suite.generateFullReport();
    expect(report.overallScore).toBeGreaterThan(70);
    expect(report.executiveSummary).toContain('EVA achieved');
    expect(report.latexTableSnippet).toContain('\\begin{table}');
    expect(report.latexTableSnippet).toContain('\\end{table}');
    expect(report.system.nodeVersion).toBeDefined();
  });

  it('should execute BenchmarkRunTool and verify results', async () => {
    const tool = new BenchmarkRunTool(suite);
    const result = await tool.execute({ category: 'intent' }, dummyCtx);
    expect(result.success).toBe(true);
    expect(result.data?.category).toBe('intent');
    expect(result.data?.intentAccuracy).toBeGreaterThanOrEqual(95);

    const verification = await tool.verify({ category: 'intent' }, result);
    expect(verification.verified).toBe(true);
    expect(verification.status).toBe('CONFIRMED');
  });
});
