import { describe, it, expect } from 'vitest';
import { PolicyEngine } from '../../security/policy/PolicyEngine.js';
import { ToolRouter } from '../../core/tools/ToolRouter.js';
import { ToolRegistry } from '../../core/tools/ToolRegistry.js';
import { AuditLogger } from '../../security/audit/AuditLogger.js';
import { TerminalExecTool } from '../../tools/terminal/TerminalExecTool.js';

describe('Security Test: Malicious Command Interception', () => {
  it('should block destructive terminal commands through the Policy Engine and Tool Router', async () => {
    const registry = new ToolRegistry();
    const policyEngine = new PolicyEngine();
    const auditLogger = new AuditLogger();

    const terminalTool = new TerminalExecTool({
      executor: async () => {
        throw new Error('FATAL: Executor should NEVER be invoked for blocked commands!');
      },
    });

    registry.register(terminalTool);
    const router = new ToolRouter({ registry, policyEngine, auditLogger });

    const maliciousCommands = [
      'rm -rf /',
      'rm -rf /Users',
      'rm -fr /System',
      'mkfs /dev/sda1',
      'dd if=/dev/zero of=/dev/sda',
      ':(){ :|:& };:',
      'chmod -R 777 /',
    ];

    for (const command of maliciousCommands) {
      const result = await router.dispatch({
        toolName: 'terminal.exec',
        parameters: { command },
        sessionId: 'sec-sess',
        deviceId: 'sec-dev',
        taskId: 'sec-task',
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('POLICY_DENIED');
      expect(result.error?.category).toBe('security-related');
    }

    // Verify audit log recorded policy rejection
    const records = auditLogger.getRecords();
    const deniedRecords = records.filter((r) => r.state === 'REJECTED' && r.decision === 'DENY');
    expect(deniedRecords.length).toBe(maliciousCommands.length);
  });
});

