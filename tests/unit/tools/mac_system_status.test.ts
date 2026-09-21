import { describe, it, expect } from 'vitest';
import { MacSystemStatusTool } from '../../../tools/system/MacSystemStatusTool.js';
import { resolveDesktopProjectPath, VSCodeTool } from '../../../tools/developer/VSCodeTool.js';
import { ClaudeReviewTool, ClaudeTaskTool } from '../../../tools/claude/ClaudeCodeTool.js';
import { AgentBrain } from '../../../core/planner/AgentBrain.js';
import { PromptEnhancer } from '../../../core/planner/PromptEnhancer.js';
import { ToolRouter } from '../../../core/tools/ToolRouter.js';
import { ToolRegistry } from '../../../core/tools/ToolRegistry.js';
import { PolicyEngine } from '../../../security/policy/PolicyEngine.js';
import { AuditLogger } from '../../../security/audit/AuditLogger.js';
import { ExecutionContext } from '../../../core/tools/ToolContract.js';
import * as path from 'node:path';
import * as os from 'node:os';

describe('Mac System Status Tool & Desktop Project Automation', () => {
  const dummyCtx: ExecutionContext = {
    taskId: 'task-system-test',
    sessionId: 'sess-system-test',
    deviceId: 'dev-system-test',
    workspaceRoot: process.cwd(),
    abortSignal: new AbortController().signal,
  };

  describe('MacSystemStatusTool', () => {
    it('should query system status using custom runner', async () => {
      const tool = new MacSystemStatusTool({
        runner: async () => ({
          battery: {
            percentage: 88,
            isCharging: true,
            powerSource: 'AC Power',
            details: 'AC Power; charging; 88%',
          },
          thermal: {
            status: 'Normal',
            isNormal: true,
            details: 'No thermal pressure',
          },
          runningApps: ['Google Chrome', 'Visual Studio Code', 'WhatsApp', 'Finder'],
          summaryText: 'Mac battery is at 88% (charging on AC Power). Thermals are normal. Running applications: Google Chrome, Visual Studio Code, WhatsApp, Finder.',
        }),
      });

      const result = await tool.execute({ filter: 'all' }, dummyCtx);
      expect(result.success).toBe(true);
      expect(result.data?.battery.percentage).toBe(88);
      expect(result.data?.battery.isCharging).toBe(true);
      expect(result.data?.thermal.isNormal).toBe(true);
      expect(result.data?.runningApps).toContain('Visual Studio Code');
      expect(result.data?.summaryText).toContain('88%');

      const verification = await tool.verify({ filter: 'all' }, result, dummyCtx);
      expect(verification.verified).toBe(true);
      expect(verification.status).toBe('CONFIRMED');
    });

    it('should query actual macOS system status without throwing', async () => {
      const tool = new MacSystemStatusTool();
      const result = await tool.execute({ filter: 'all' }, dummyCtx);
      expect(result.success).toBe(true);
      expect(typeof result.data?.battery.percentage).toBe('number');
      expect(Array.isArray(result.data?.runningApps)).toBe(true);
      expect(result.data?.summaryText.length).toBeGreaterThan(0);
    });
  });

  describe('Desktop Project Resolution (resolveDesktopProjectPath)', () => {
    it('should default to workspaceRoot if no project requested or current/this', () => {
      expect(resolveDesktopProjectPath(undefined, '/test/workspace')).toBe('/test/workspace');
      expect(resolveDesktopProjectPath('', '/test/workspace')).toBe('/test/workspace');
      expect(resolveDesktopProjectPath('this', '/test/workspace')).toBe('/test/workspace');
      expect(resolveDesktopProjectPath('current', '/test/workspace')).toBe('/test/workspace');
    });

    it('should resolve Desktop project by name if existing on ~/Desktop', () => {
      const desktopDir = path.join(os.homedir(), 'Desktop');
      // EVA exists on desktop in this environment
      const resolved = resolveDesktopProjectPath('EVA', '/test/workspace');
      expect(resolved.toLowerCase()).toContain('eva');
    });

    it('should pass resolved Desktop project path to VSCodeTool', async () => {
      let openedPath = '';
      const tool = new VSCodeTool({
        runner: async (target) => {
          openedPath = target;
          return true;
        },
      });

      const result = await tool.execute({ path: 'Vareeka' }, dummyCtx);
      expect(result.success).toBe(true);
      expect(openedPath.toLowerCase()).toContain('vareeka');
    });

    it('should pass resolved Desktop project path to ClaudeReviewTool and ClaudeTaskTool', async () => {
      let reviewPath = '';
      const reviewTool = new ClaudeReviewTool({
        runner: async (projectPath) => {
          reviewPath = projectPath;
          return 'Code review output';
        },
      });
      await reviewTool.execute({ projectPath: 'D2S' }, dummyCtx);
      expect(reviewPath.toLowerCase()).toContain('d2s');

      let taskPath = '';
      const taskTool = new ClaudeTaskTool({
        runner: async (projectPath, prompt) => {
          taskPath = projectPath;
          return `Done: ${prompt}`;
        },
      });
      await taskTool.execute({ projectPath: 'React', taskPrompt: 'Build project' }, dummyCtx);
      expect(taskPath.toLowerCase()).toContain('react');
    });
  });

  describe('Natural Language Intent Planning for Mac Health & Desktop Projects', () => {
    const enhancer = new PromptEnhancer();
    const registry = new ToolRegistry();
    const router = new ToolRouter({ registry, policyEngine: new PolicyEngine(), auditLogger: new AuditLogger() });
    const brain = new AgentBrain({ router, promptEnhancer: enhancer });

    it('should route "how is my mac doing" to system.mac_status', () => {
      const enhanced = enhancer.enhance('how is my mac doing');
      expect(enhanced.intentCategory).toBe('SYSTEM');

      const plan = brain.parseGoalToPlan('how is my mac doing');
      expect(plan.length).toBe(1);
      expect(plan[0].toolName).toBe('system.mac_status');
    });

    it('should route "mac status" and "battery status" to system.mac_status', () => {
      const plan1 = brain.parseGoalToPlan('mac status');
      expect(plan1.length).toBe(1);
      expect(plan1[0].toolName).toBe('system.mac_status');

      const plan2 = brain.parseGoalToPlan('battery status');
      expect(plan2.length).toBe(1);
      expect(plan2[0].toolName).toBe('system.mac_status');
      expect(plan2[0].parameters.filter).toBe('battery');
    });

    it('should route "what apps are open" to system.mac_status with apps filter', () => {
      const plan = brain.parseGoalToPlan('what apps are open');
      expect(plan.length).toBe(1);
      expect(plan[0].toolName).toBe('system.mac_status');
      expect(plan[0].parameters.filter).toBe('apps');
    });

    it('should plan opening any Desktop project in VS Code', () => {
      const plan = brain.parseGoalToPlan('open Vareeka in vs code');
      expect(plan.length).toBe(1);
      expect(plan[0].toolName).toBe('vscode.open');
      expect(plan[0].parameters.path).toBe('Vareeka');
    });

    it('should plan compound "open Vareeka in vs code and review with claude"', () => {
      const plan = brain.parseGoalToPlan('open Vareeka in vs code and review with claude');
      expect(plan.length).toBe(2);
      expect(plan[0].toolName).toBe('vscode.open');
      expect(plan[0].parameters.path).toBe('Vareeka');
      expect(plan[1].toolName).toBe('claude.review_project');
      expect(plan[1].parameters.projectPath).toBe('Vareeka');
    });
  });
});

