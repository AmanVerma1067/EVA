import { describe, it, expect } from 'vitest';
import { AgentBrain } from '../../../core/planner/AgentBrain.js';
import { ToolRouter } from '../../../core/tools/ToolRouter.js';
import { ToolRegistry } from '../../../core/tools/ToolRegistry.js';
import { PolicyEngine } from '../../../security/policy/PolicyEngine.js';
import { AuditLogger } from '../../../security/audit/AuditLogger.js';
import { AppStatusTool } from '../../../tools/application/AppStatusTool.js';
import { FileReadTool } from '../../../tools/filesystem/FileReadTool.js';
import { TerminalExecTool } from '../../../tools/terminal/TerminalExecTool.js';
import { VoiceSystem } from '../../../voice/VoiceSystem.js';

describe('AgentBrain Natural Language Intent & Execution Loop', () => {
  const registry = new ToolRegistry();
  registry.register(new AppStatusTool({ inspector: async (app) => (app === 'Finder' ? [999] : []) }));
  registry.register(new FileReadTool());
  registry.register(new TerminalExecTool({ executor: async () => ({ exitCode: 0, stdout: 'macOS 26.6.2\n', stderr: '' }) }));

  const policyEngine = new PolicyEngine();
  const auditLogger = new AuditLogger();
  const router = new ToolRouter({ registry, policyEngine, auditLogger });
  const voice = new VoiceSystem({ enabled: false }); // disable audio during tests

  const brain = new AgentBrain({ router, voice });

  it('should parse natural language app status query', () => {
    const plan = brain.parseGoalToPlan('is Finder running?');
    expect(plan.length).toBe(1);
    expect(plan[0].toolName).toBe('app.status');
    expect(plan[0].parameters.appName).toBe('Finder');
  });

  it('should parse natural language file read query', () => {
    const plan = brain.parseGoalToPlan('read package.json');
    expect(plan.length).toBe(1);
    expect(plan[0].toolName).toBe('fs.read');
    expect(plan[0].parameters.path).toBe('package.json');
  });

  it('should parse natural language system version query', () => {
    const plan = brain.parseGoalToPlan('what macOS version am I on?');
    expect(plan.length).toBe(1);
    expect(plan[0].toolName).toBe('terminal.exec');
    expect(plan[0].parameters.command).toBe('sw_vers');
  });

  it('should execute natural language goal and generate natural spoken response', async () => {
    const response = await brain.executeGoal({
      goal: 'is Finder running?',
      sessionId: 'sess-brain',
      deviceId: 'dev-brain',
      speakResponse: false,
    });

    expect(response.success).toBe(true);
    expect(response.plan[0].toolName).toBe('app.status');
    expect(response.responseText).toContain('Finder is currently running');
  });
});

