/**
 * EVA End-to-End Orchestrator Pipeline Integration Tests
 * Conforms to Section 1, 6, 8, 9, 10, 11, 14, 21, 22, 23, 25, 32 of EVA Master Orchestration Spec
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as path from 'node:path';
import { ToolRegistry } from '../../../core/tools/ToolRegistry.js';
import { ToolRouter } from '../../../core/tools/ToolRouter.js';
import { PolicyEngine } from '../../../security/policy/PolicyEngine.js';
import { AuditLogger } from '../../../security/audit/AuditLogger.js';
import { AppLaunchTool } from '../../../tools/application/AppLaunchTool.js';
import { AppStatusTool } from '../../../tools/application/AppStatusTool.js';
import { VSCodeTool } from '../../../tools/developer/VSCodeTool.js';
import { MacSystemStatusTool } from '../../../tools/system/MacSystemStatusTool.js';
import { OrchestratorPipeline } from '../../../core/orchestrator/OrchestratorPipeline.js';

describe('EVA Orchestrator Pipeline: End-to-End Integration', () => {
  let registry: ToolRegistry;
  let router: ToolRouter;
  let pipeline: OrchestratorPipeline;
  let launchedApps: string[] = [];

  beforeEach(() => {
    launchedApps = [];
    registry = new ToolRegistry();

    const appLaunchTool = new AppLaunchTool({
      runner: async (appName: string) => {
        launchedApps.push(appName);
        return true;
      },
      verifier: async (appName: string) => {
        return launchedApps.includes(appName);
      },
    });

    const appStatusTool = new AppStatusTool({
      inspector: async (appName: string) => (launchedApps.includes(appName) ? [12345] : []),
    });

    const vscodeTool = new VSCodeTool({
      runner: async (target: string) => {
        launchedApps.push(`vscode:${target}`);
        return true;
      },
    });

    const statusTool = new MacSystemStatusTool({
      runner: async () => ({
        battery: { percentage: 95, isCharging: true, powerSource: 'AC Power', details: '95% charging' },
        thermal: { status: 'Nominal', details: 'CPU load 12%', isNormal: true },
        runningApps: ['Finder', 'Terminal', 'Antigravity'],
        summaryText: 'Mac battery is at 95% and charging. Thermals are nominal.',
      }),
    });

    registry.register(appLaunchTool);
    registry.register(appStatusTool);
    registry.register(vscodeTool);
    registry.register(statusTool);

    router = new ToolRouter({
      registry,
      policyEngine: new PolicyEngine(),
      auditLogger: new AuditLogger({
        logFilePath: path.resolve(process.cwd(), '.eva/test_orchestrator_audit.json'),
      }),
    });

    pipeline = new OrchestratorPipeline({ router });
  });

  describe('Section 2 & 6: Antigravity Non-Literal Resolution', () => {
    it('should NEVER interpret "Open antigravity over here" literally, launching Antigravity cleanly', async () => {
      const result = await pipeline.orchestrate({
        rawInput: 'Open antigravity over here',
        sessionId: 'sess-orch-1',
        deviceId: 'dev-mac-1',
        taskId: 'task-anti-1',
      });

      expect(result.success).toBe(true);
      expect(result.intent.intent).toBe('OPEN_APPLICATION');
      expect(result.intent.rawTarget.toLowerCase()).toBe('antigravity');
      expect(result.normalizedSpeech.strippedQualifiers).toContain('over here');
      expect(result.entity.name).toBe('Antigravity');

      // Crucial assertion: AppLaunchTool must receive "Antigravity", NEVER "Antigravity over here"
      expect(launchedApps).toContain('Antigravity');
      expect(launchedApps).not.toContain('Antigravity over here');

      // Verify spoken response conforms to Section 25
      expect(result.spokenResponse).toContain('Antigravity');
      expect(result.verification.status).toBe('CONFIRMED');
    });

    it('should normalize and launch "can you please open VS code for me"', async () => {
      const result = await pipeline.orchestrate({
        rawInput: 'can you please open VS code for me',
        sessionId: 'sess-orch-2',
        deviceId: 'dev-mac-1',
        taskId: 'task-vscode-1',
      });

      expect(result.success).toBe(true);
      expect(result.entity.name).toBe('Visual Studio Code');
      expect(launchedApps).toContain('Visual Studio Code');
      expect(launchedApps).not.toContain('Visual Studio Code for me');
    });
  });

  describe('Section 12: PLANNER Mode Strategic Output', () => {
    it('should generate structured 4-phase strategic plan without mutating execution', async () => {
      const result = await pipeline.orchestrate({
        rawInput: 'Act as a planner: plan the customer refund workflow',
        sessionId: 'sess-orch-3',
        deviceId: 'dev-mac-1',
        taskId: 'task-planner-1',
      });

      expect(result.success).toBe(true);
      expect(result.role).toBe('PLANNER');
      expect(result.intent.intent).toBe('STRATEGIC_PLANNING');
      expect(result.textResponse).toContain('Strategic Plan: customer refund workflow');
      expect(result.textResponse).toContain('Phase 1: Discovery, Requirements & Risk Assessment');
      expect(result.textResponse).toContain('Key Milestones');
      expect(launchedApps).toHaveLength(0); // Zero mutating tool executions
    });
  });

  describe('Section 14: SENIOR_DEVELOPER Claude Prompt Orchestration', () => {
    it('should generate senior-grade Claude Code prompt with requirements, constraints, and definition of done', () => {
      const prompt = pipeline.roleManager.engineerClaudePrompt({
        objective: 'Refactor authentication token storage to use macOS Keychain securely',
        projectPath: '/Users/aman/Desktop/EVA',
        relevantFiles: ['core/auth/Keychain.ts', 'tests/keychain.test.ts'],
      });

      expect(prompt.fullPrompt).toContain('Senior Software Engineer');
      expect(prompt.fullPrompt).toContain('Definition of Done');
      expect(prompt.fullPrompt).toContain('Technical Constraints');
      expect(prompt.fullPrompt).toContain('Security Requirements');
      expect(prompt.fullPrompt).toContain('Refactor authentication token storage');
    });
  });

  describe('Section 22 & 25: Verification and Dual-Channel Responses', () => {
    it('should verify system diagnostics and return concise ear-friendly spoken output', async () => {
      const result = await pipeline.orchestrate({
        rawInput: 'how is my mac doing right now',
        sessionId: 'sess-orch-4',
        deviceId: 'dev-mac-1',
        taskId: 'task-status-1',
      });

      expect(result.success).toBe(true);
      expect(result.intent.intent).toBe('SYSTEM_HEALTH_DIAGNOSTICS');
      expect(result.spokenResponse).toBe('Your Mac is running smoothly. System health metrics are displayed.');
      expect(result.textResponse).toContain('mac_system');
      expect(result.verification.status).toBe('CONFIRMED');
    });
  });
});
