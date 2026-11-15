/**
 * Local Offline Inference Engine Unit Tests (Phase 22)
 */

import { describe, it, expect } from 'vitest';
import { LocalInferenceEngine } from '../../../core/inference/LocalInferenceEngine.js';
import { LocalInferenceStatusTool } from '../../../tools/developer/BenchmarkTools.js';
import { ExecutionContext } from '../../../core/tools/ToolContract.js';

describe('Phase 22: Local Offline Inference Engine (Ollama / Llama / DeepSeek)', () => {
  const engine = new LocalInferenceEngine({
    baseUrl: 'http://127.0.0.1:11434',
    defaultModel: 'llama3',
    enableSimulationFallback: true,
  });

  const dummyCtx: ExecutionContext = {
    taskId: 'test-infer-1',
    sessionId: 'test-sess-1',
    deviceId: 'test-dev-1',
    workspaceRoot: '/home/aman/Desktop/Hackathon/EVA',
    abortSignal: new AbortController().signal,
  };

  it('should initialize engine with custom configuration and retrieve default model', () => {
    expect(engine.getBaseUrl()).toBe('http://127.0.0.1:11434');
    expect(engine.getDefaultModel()).toBe('llama3');
  });

  it('should perform health check and return connection state', async () => {
    const health = await engine.checkHealth();
    expect(health.baseUrl).toBe('http://127.0.0.1:11434');
    expect(typeof health.online).toBe('boolean');
  });

  it('should list available local models with quantization and parameter sizes', async () => {
    const models = await engine.listModels();
    expect(models.length).toBeGreaterThanOrEqual(1);
    const llama = models.find((m) => m.name.includes('llama3'));
    expect(llama).toBeDefined();
    expect(llama?.details?.parameterSize).toBe('8.0B');
  });

  it('should generate completion in offline mode and report performance metrics', async () => {
    const res = await engine.generate({
      prompt: 'Check local system health',
      model: 'llama3',
      maxTokens: 50,
    });

    expect(res.text.length).toBeGreaterThan(0);
    expect(res.totalDurationMs).toBeGreaterThan(0);
    expect(res.completionTokens).toBeGreaterThan(0);
    expect(res.promptTokens).toBeGreaterThan(0);
    expect(res.tokensPerSecond).toBeGreaterThan(0);
  });

  it('should stream generation tokens asynchronously', async () => {
    const stream = engine.streamGenerate({
      prompt: 'Describe git status',
      maxTokens: 25,
    });

    const receivedChunks: string[] = [];
    for await (const chunk of stream) {
      receivedChunks.push(chunk);
    }

    expect(receivedChunks.length).toBeGreaterThan(0);
    const combined = receivedChunks.join('');
    expect(combined.toLowerCase()).toContain('git');
  });

  it('should inspect status via LocalInferenceStatusTool and verify', async () => {
    const tool = new LocalInferenceStatusTool(engine);
    const result = await tool.execute({}, dummyCtx);

    expect(result.success).toBe(true);
    expect(result.data?.activeModelsCount).toBeGreaterThanOrEqual(1);
    expect(result.data?.defaultModel).toBe('llama3');

    const verification = await tool.verify({}, result);
    expect(verification.verified).toBe(true);
    expect(verification.status).toBe('CONFIRMED');
  });
});
