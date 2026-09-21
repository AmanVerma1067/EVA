import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { ToolRegistry } from '../../../core/tools/ToolRegistry.js';
import { ToolRouter } from '../../../core/tools/ToolRouter.js';
import { PolicyEngine } from '../../../security/policy/PolicyEngine.js';
import { AuditLogger } from '../../../security/audit/AuditLogger.js';
import { ToolContract, ToolResult, VerificationResult, ExecutionContext } from '../../../core/tools/ToolContract.js';

describe('ToolRegistry and ToolRouter Dispatch Pipeline', () => {
  it('should register tools and list manifests', () => {
    const registry = new ToolRegistry();
    const mockTool: ToolContract<{ val: string }, { echo: string }> = {
      name: 'test.echo',
      version: '1.0.0',
      description: 'Echos input',
      riskLevel: 'READ',
      timeoutMs: 5000,
      inputSchema: z.object({ val: z.string() }),
      outputSchema: z.object({ echo: z.string() }),
      execute: async (p) => ({
        success: true,
        data: { echo: p.val },
        metrics: { durationMs: 1, timestamp: Date.now() },
      }),
      verify: async (p, res) => ({
        verified: res.data?.echo === p.val,
        status: 'CONFIRMED',
        evidence: 'Echo matches',
      }),
    };

    registry.register(mockTool);
    expect(registry.has('test.echo')).toBe(true);

    const manifests = registry.getManifests();
    expect(manifests.length).toBe(1);
    expect(manifests[0].name).toBe('test.echo');
    expect(manifests[0].riskLevel).toBe('READ');

    // Duplicate registration should throw
    expect(() => registry.register(mockTool)).toThrow();
  });

  it('should reject unknown tools in ToolRouter', async () => {
    const registry = new ToolRegistry();
    const policyEngine = new PolicyEngine();
    const auditLogger = new AuditLogger();
    const router = new ToolRouter({ registry, policyEngine, auditLogger });

    const result = await router.dispatch({
      toolName: 'non.existent',
      parameters: {},
      sessionId: 's1',
      deviceId: 'd1',
      taskId: 't1',
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('TOOL_NOT_FOUND');
  });

  it('should reject invalid parameters failing Zod schema in ToolRouter', async () => {
    const registry = new ToolRegistry();
    const policyEngine = new PolicyEngine();
    const auditLogger = new AuditLogger();

    const mockTool: ToolContract<{ count: number }, { ok: boolean }> = {
      name: 'test.count',
      version: '1.0.0',
      description: 'Count tester',
      riskLevel: 'READ',
      timeoutMs: 5000,
      inputSchema: z.object({ count: z.number().int().min(1) }),
      outputSchema: z.object({ ok: z.boolean() }),
      execute: async () => ({ success: true, data: { ok: true }, metrics: { durationMs: 1, timestamp: Date.now() } }),
      verify: async () => ({ verified: true, status: 'CONFIRMED', evidence: 'Verified' }),
    };

    registry.register(mockTool);
    const router = new ToolRouter({ registry, policyEngine, auditLogger });

    const result = await router.dispatch({
      toolName: 'test.count',
      parameters: { count: 'not-a-number' },
      sessionId: 's1',
      deviceId: 'd1',
      taskId: 't1',
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('VALIDATION_FAILED');
  });

  it('should successfully execute and verify an authorized tool call', async () => {
    const registry = new ToolRegistry();
    const policyEngine = new PolicyEngine();
    const auditLogger = new AuditLogger();

    const mockTool: ToolContract<{ message: string }, { processed: string }> = {
      name: 'test.greet',
      version: '1.0.0',
      description: 'Greeting tool',
      riskLevel: 'READ',
      timeoutMs: 5000,
      inputSchema: z.object({ message: z.string() }),
      outputSchema: z.object({ processed: z.string() }),
      execute: async (p) => ({
        success: true,
        data: { processed: `Hello, ${p.message}` },
        metrics: { durationMs: 2, timestamp: Date.now() },
      }),
      verify: async (p, res) => ({
        verified: true,
        status: 'CONFIRMED',
        evidence: `Verified greeting: ${res.data?.processed}`,
      }),
    };

    registry.register(mockTool);
    const router = new ToolRouter({ registry, policyEngine, auditLogger });

    const result = await router.dispatch<{ processed: string }>({
      toolName: 'test.greet',
      parameters: { message: 'EVA' },
      sessionId: 's1',
      deviceId: 'd1',
      taskId: 't1',
    });

    expect(result.success).toBe(true);
    expect(result.data?.processed).toBe('Hello, EVA');
    expect(result.verification?.verified).toBe(true);
    expect(result.verification?.status).toBe('CONFIRMED');

    // Check that audit recorded all states
    const records = auditLogger.getRecords();
    const states = records.map((r) => r.state);
    expect(states).toContain('REQUESTED');
    expect(states).toContain('AUTHORIZED');
    expect(states).toContain('EXECUTED');
    expect(states).toContain('VERIFIED');
  });

  it('should safely abort and handle tool execution timeouts', async () => {
    const registry = new ToolRegistry();
    const policyEngine = new PolicyEngine();
    const auditLogger = new AuditLogger();

    const slowTool: ToolContract<{}, {}> = {
      name: 'test.slow',
      version: '1.0.0',
      description: 'Hangs',
      riskLevel: 'READ',
      timeoutMs: 50, // 50ms timeout
      inputSchema: z.object({}),
      outputSchema: z.object({}),
      execute: async (_p, ctx: ExecutionContext) => {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, 5000);
          ctx.abortSignal.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new Error('Operation aborted'));
          });
        });
        return { success: true, metrics: { durationMs: 5000, timestamp: Date.now() } };
      },
      verify: async () => ({ verified: true, status: 'CONFIRMED', evidence: '' }),
    };

    registry.register(slowTool);
    const router = new ToolRouter({ registry, policyEngine, auditLogger });

    const result = await router.dispatch({
      toolName: 'test.slow',
      parameters: {},
      sessionId: 's1',
      deviceId: 'd1',
      taskId: 't1',
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('OPERATION_TIMEOUT');
  });
});

