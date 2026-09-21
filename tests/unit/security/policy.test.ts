import { describe, it, expect } from 'vitest';
import { PolicyEngine } from '../../../security/policy/PolicyEngine.js';

describe('PolicyEngine and Risk Gates', () => {
  it('should auto-allow READ and NORMAL tier actions', () => {
    const policy = new PolicyEngine();

    const readDecision = policy.evaluate({
      toolName: 'fs.read',
      riskLevel: 'READ',
      parameters: { path: 'file.txt' },
      sessionId: 's1',
      deviceId: 'd1',
      workspaceRoot: '/workspace',
    });
    expect(readDecision.type).toBe('ALLOW');

    const normalDecision = policy.evaluate({
      toolName: 'app.launch',
      riskLevel: 'NORMAL',
      parameters: { appName: 'Calculator' },
      sessionId: 's1',
      deviceId: 'd1',
      workspaceRoot: '/workspace',
    });
    expect(normalDecision.type).toBe('ALLOW');
  });

  it('should require approval for SENSITIVE and CRITICAL tier actions', () => {
    const policy = new PolicyEngine();

    const sensitiveDecision = policy.evaluate({
      toolName: 'fs.write',
      riskLevel: 'SENSITIVE',
      parameters: { path: 'file.txt', content: 'hello' },
      sessionId: 's1',
      deviceId: 'd1',
      workspaceRoot: '/workspace',
    });
    expect(sensitiveDecision.type).toBe('REQUIRE_APPROVAL');
    expect(sensitiveDecision.approvalRequestId).toBeDefined();

    const criticalDecision = policy.evaluate({
      toolName: 'fs.delete',
      riskLevel: 'CRITICAL',
      parameters: { path: 'file.txt' },
      sessionId: 's1',
      deviceId: 'd1',
      workspaceRoot: '/workspace',
    });
    expect(criticalDecision.type).toBe('REQUIRE_APPROVAL');
    expect(criticalDecision.approvalRequestId).toBeDefined();
  });

  it('should allow SENSITIVE or CRITICAL actions when valid approval token is provided', () => {
    const policy = new PolicyEngine();

    const initial = policy.evaluate({
      toolName: 'fs.delete',
      riskLevel: 'CRITICAL',
      parameters: { path: 'file.txt' },
      sessionId: 's1',
      deviceId: 'd1',
      workspaceRoot: '/workspace',
    });

    const requestId = initial.approvalRequestId!;
    const approvalToken = policy.approve(requestId);
    expect(approvalToken).toMatch(/^appr_/);

    const authorizedDecision = policy.evaluate({
      toolName: 'fs.delete',
      riskLevel: 'CRITICAL',
      parameters: { path: 'file.txt' },
      sessionId: 's1',
      deviceId: 'd1',
      workspaceRoot: '/workspace',
      approvalToken,
    });

    expect(authorizedDecision.type).toBe('ALLOW');

    // Single use token test: using token second time should be DENIED
    const secondTry = policy.evaluate({
      toolName: 'fs.delete',
      riskLevel: 'CRITICAL',
      parameters: { path: 'file.txt' },
      sessionId: 's1',
      deviceId: 'd1',
      workspaceRoot: '/workspace',
      approvalToken,
    });
    expect(secondTry.type).toBe('DENY');
  });

  it('should immediately DENY forbidden destructive commands', () => {
    const policy = new PolicyEngine();

    const decision = policy.evaluate({
      toolName: 'terminal.exec',
      riskLevel: 'NORMAL',
      parameters: { command: 'rm -rf /' },
      sessionId: 's1',
      deviceId: 'd1',
      workspaceRoot: '/workspace',
    });

    expect(decision.type).toBe('DENY');
    expect(decision.reason).toContain('strictly forbidden');
  });
});

