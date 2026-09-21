import { describe, it, expect } from 'vitest';
import { WhatsAppCallTool, WhatsAppVideoCallTool } from '../../../tools/messaging/WhatsAppTool.js';
import { VSCodeTool } from '../../../tools/developer/VSCodeTool.js';
import { ClaudeReviewTool, ClaudeTaskTool } from '../../../tools/claude/ClaudeCodeTool.js';
import { AgentBrain } from '../../../core/planner/AgentBrain.js';
import { ToolRouter } from '../../../core/tools/ToolRouter.js';
import { ToolRegistry } from '../../../core/tools/ToolRegistry.js';
import { PolicyEngine } from '../../../security/policy/PolicyEngine.js';
import { AuditLogger } from '../../../security/audit/AuditLogger.js';
import { ExecutionContext } from '../../../core/tools/ToolContract.js';

describe('Developer & Calling Tools + Complex AgentBrain Planning', () => {
  const dummyCtx: ExecutionContext = {
    taskId: 'task-dev',
    sessionId: 'sess-dev',
    deviceId: 'dev-dev',
    workspaceRoot: process.cwd(),
    abortSignal: new AbortController().signal,
  };

  describe('WhatsApp Voice & Video Calls', () => {
    it('should execute WhatsApp voice call with runner', async () => {
      let called = '';
      const tool = new WhatsAppCallTool({
        runner: async (recipient) => {
          called = recipient;
          return true;
        },
      });
      const res = await tool.execute({ recipient: 'Shivam' }, dummyCtx);
      expect(res.success).toBe(true);
      expect(called).toBe('Shivam');
      expect(res.data?.callType).toBe('voice');
    });

    it('should execute WhatsApp video call with runner', async () => {
      let videoCalled = '';
      const tool = new WhatsAppVideoCallTool({
        runner: async (recipient) => {
          videoCalled = recipient;
          return true;
        },
      });
      const res = await tool.execute({ recipient: 'Shivam' }, dummyCtx);
      expect(res.success).toBe(true);
      expect(videoCalled).toBe('Shivam');
      expect(res.data?.callType).toBe('video');
    });
  });

  describe('VSCodeTool', () => {
    it('should trigger open project', async () => {
      let openedPath = '';
      const tool = new VSCodeTool({
        runner: async (target) => {
          openedPath = target;
          return true;
        },
      });
      const res = await tool.execute({}, dummyCtx);
      expect(res.success).toBe(true);
      expect(openedPath).toBe(process.cwd());
    });
  });

  describe('Claude Code Integration Tools', () => {
    it('should execute project review with mock runner', async () => {
      const tool = new ClaudeReviewTool({
        runner: async () => 'Architecture: Solid TypeScript with strict typing. Security: PolicyEngine active.',
      });
      const res = await tool.execute({}, dummyCtx);
      expect(res.success).toBe(true);
      expect(res.data?.reviewSummary).toContain('Architecture: Solid');
    });

    it('should complete task with Claude Code runner', async () => {
      const tool = new ClaudeTaskTool({
        runner: async (_dir, prompt) => `Executed task: ${prompt}. All unit tests passed.`,
      });
      const res = await tool.execute({ taskPrompt: 'Add health check endpoint' }, dummyCtx);
      expect(res.success).toBe(true);
      expect(res.data?.resultText).toContain('Add health check endpoint');
    });
  });

  describe('Complex Natural Language Goal Planning in AgentBrain', () => {
    const registry = new ToolRegistry();
    const router = new ToolRouter({ registry, policyEngine: new PolicyEngine(), auditLogger: new AuditLogger() });
    const brain = new AgentBrain({ router });

    it('should parse WhatsApp voice call intent', () => {
      const plan = brain.parseGoalToPlan('call shivam on whatsapp');
      expect(plan.length).toBe(1);
      expect(plan[0].toolName).toBe('whatsapp.call');
      expect(plan[0].parameters.recipient).toBe('Shivam');
    });

    it('should parse WhatsApp video call intent', () => {
      const plan = brain.parseGoalToPlan('video call shivam on whatsapp');
      expect(plan.length).toBe(1);
      expect(plan[0].toolName).toBe('whatsapp.video_call');
      expect(plan[0].parameters.recipient).toBe('Shivam');
    });

    it('should plan multi-step compound developer workflow: opening vs code, reviewing project with claude, and completing a task with claude', () => {
      const userGoal = 'opening vs code reviewing a project with the help of claude, and then completing a task with claude';
      const plan = brain.parseGoalToPlan(userGoal);

      expect(plan.length).toBe(3);
      expect(plan[0].toolName).toBe('vscode.open');
      expect(plan[1].toolName).toBe('claude.review_project');
      expect(plan[2].toolName).toBe('claude.complete_task');
    });
  });
});

