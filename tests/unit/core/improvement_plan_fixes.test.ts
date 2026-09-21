import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import * as os from 'node:os';
import { resolveDesktopProjectPath, VSCodeTool } from '../../../tools/developer/VSCodeTool.js';
import { PromptEnhancer } from '../../../core/planner/PromptEnhancer.js';
import { AgentBrain } from '../../../core/planner/AgentBrain.js';
import { ToolRouter } from '../../../core/tools/ToolRouter.js';
import { MacSystemStatusTool } from '../../../tools/system/MacSystemStatusTool.js';
import { ExecutionContext } from '../../../core/tools/ToolContract.js';

describe('Improvement Plan Fixes Verification', () => {
  const dummyCtx: ExecutionContext = {
    taskId: 'task-fixes',
    sessionId: 'sess-fixes',
    deviceId: 'dev-fixes',
    workspaceRoot: '/Users/aman/Desktop/EVA',
    abortSignal: new AbortController().signal,
  };

  const enhancer = new PromptEnhancer();
  const mockRouter = { dispatch: async () => ({ success: true, metrics: { durationMs: 0, timestamp: 0 } }) } as unknown as ToolRouter;
  const brain = new AgentBrain({ router: mockRouter, promptEnhancer: enhancer });

  describe('Desktop Project Resolution without Broken Paths', () => {
    it('should resolve "d2s" and "project d2s" to Desktop/D2S and not create paths in EVA', () => {
      const resolvedClean = resolveDesktopProjectPath('d2s', '/Users/aman/Desktop/EVA');
      expect(resolvedClean.toLowerCase()).toBe(path.join(os.homedir(), 'Desktop', 'd2s').toLowerCase());

      const resolvedWithPrefix = resolveDesktopProjectPath('project d2s', '/Users/aman/Desktop/EVA');
      expect(resolvedWithPrefix.toLowerCase()).toBe(path.join(os.homedir(), 'Desktop', 'd2s').toLowerCase());
      expect(resolvedWithPrefix).not.toContain('EVA/project d2s');
      expect(resolvedWithPrefix).not.toContain('EVA/d2s');
    });

    it('should strip project/folder/dir prefixes from requested names', () => {
      const resolved = resolveDesktopProjectPath('folder Vareeka', '/Users/aman/Desktop/EVA');
      expect(resolved.toLowerCase()).toContain('vareeka');
      expect(resolved).not.toContain('folder');
    });
  });

  describe('PromptEnhancer and Brain Intent Planning for VS Code & Claude', () => {
    it('should enhance "open d2s in vscode" without corrupting project name', () => {
      const enhanced = enhancer.enhance('open d2s in vscode');
      expect(enhanced.intentCategory).toBe('DEVELOPER');
      expect(enhanced.enhancedPrompt).toBe('Open project d2s in Visual Studio Code.');
      expect(enhanced.entities.filePath).toBe('d2s');

      const plan = brain.parseGoalToPlan(enhanced.enhancedPrompt);
      expect(plan).toHaveLength(1);
      expect(plan[0].toolName).toBe('vscode.open');
      expect(plan[0].parameters.path).toBe('d2s');
    });

    it('should plan Claude Code in VS Code terminal when requested', () => {
      const plan = brain.parseGoalToPlan('open d2s in vs code and open claude in terminal');
      expect(plan).toHaveLength(1);
      expect(plan[0].toolName).toBe('vscode.open');
      expect(plan[0].parameters.path).toBe('d2s');
      expect(plan[0].parameters.launchClaude).toBe(true);
    });

    it('should plan standalone "open claude in vs code" to launch Claude in integrated terminal', () => {
      const plan = brain.parseGoalToPlan('open claude in vs code');
      expect(plan).toHaveLength(1);
      expect(plan[0].toolName).toBe('vscode.open');
      expect(plan[0].parameters.launchClaude).toBe(true);
    });
  });

  describe('Mac System Status Thermals on Apple Silicon', () => {
    it('should report Normal status when pmset therm indicates Nominal pressure', async () => {
      const tool = new MacSystemStatusTool({
        runner: async () => ({
          battery: { percentage: 85, isCharging: true, powerSource: 'AC Power', details: '85%' },
          thermal: { status: 'Normal', isNormal: true, details: 'Running cool with no thermal pressure recorded.' },
          runningApps: ['Code', 'Google Chrome'],
          summaryText: 'Your Mac is at 85% battery (charging on AC power). Heating and thermals are running cool and normal. Currently opened applications: Code, Google Chrome.',
        }),
      });

      const res = await tool.execute({ filter: 'thermal' }, dummyCtx);
      expect(res.success).toBe(true);
      expect(res.data?.thermal.isNormal).toBe(true);
      expect(res.data?.thermal.status).toBe('Normal');
      expect(res.data?.summaryText).toContain('cool and normal');
    });
  });

  describe('VSCodeTool Verification', () => {
    it('should return CONFIRMED if process is running', async () => {
      const tool = new VSCodeTool({
        runner: async () => true,
      });

      const execRes = await tool.execute({ path: 'd2s' }, dummyCtx);
      expect(execRes.success).toBe(true);
      expect(execRes.data?.opened).toBe(true);
      expect(execRes.data?.targetPath.toLowerCase()).toContain('d2s');
    });
  });

  describe('App and Window Close Planning', () => {
    it('should plan window.close for "Close terminal" and "quit chrome"', () => {
      const p1 = brain.parseGoalToPlan(enhancer.enhance('Close terminal').enhancedPrompt);
      expect(p1).toHaveLength(1);
      expect(p1[0].toolName).toBe('window.close');
      expect(p1[0].parameters.appName).toBe('Terminal');

      const p2 = brain.parseGoalToPlan(enhancer.enhance('close chrome').enhancedPrompt);
      expect(p2).toHaveLength(1);
      expect(p2[0].toolName).toBe('window.close');
      expect(p2[0].parameters.appName).toBe('Google Chrome');
    });

    it('should NOT return previous tool JSON on unrelated unmapped commands', async () => {
      // Simulate existing last execution
      (brain as any).lastExecution = {
        toolName: 'claude.review_project',
        output: { reviewSummary: 'Some prior review' },
        success: true,
        spokenSummary: 'Review done',
      };

      const res = await brain.handleDialogueQuery('something arbitrary');
      expect(res.isAnswered).toBe(false);

      const explicitRes = await brain.handleDialogueQuery('what was the last output');
      expect(explicitRes.isAnswered).toBe(true);
      expect(explicitRes.text).toContain('Some prior review');
    });
  });
});

