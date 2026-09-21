/**
 * EVA Adversarial Intent & Conversational Disambiguation Tests
 * Conforms to Section 26 & 32 of EVA Master Orchestration Spec
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as path from 'node:path';
import { SpeechNormalizer } from '../../../core/orchestrator/SpeechNormalizer.js';
import { IntentResolver } from '../../../core/orchestrator/IntentResolver.js';
import { EnvironmentInspector } from '../../../core/orchestrator/EnvironmentInspector.js';
import { ContextManager } from '../../../core/orchestrator/ContextManager.js';
import { EntityResolver } from '../../../core/orchestrator/EntityResolver.js';
import { CapabilityResolver } from '../../../core/orchestrator/CapabilityResolver.js';
import { ToolRegistry } from '../../../core/tools/ToolRegistry.js';
import { ToolRouter } from '../../../core/tools/ToolRouter.js';
import { PolicyEngine } from '../../../security/policy/PolicyEngine.js';
import { AuditLogger } from '../../../security/audit/AuditLogger.js';
import { AppLaunchTool } from '../../../tools/application/AppLaunchTool.js';
import { OrchestratorPipeline } from '../../../core/orchestrator/OrchestratorPipeline.js';

describe('EVA Adversarial Intent & Context Disambiguation (Section 26)', () => {
  const normalizer = new SpeechNormalizer();
  const intentResolver = new IntentResolver();
  let inspector: EnvironmentInspector;
  let context: ContextManager;
  let entityResolver: EntityResolver;
  let capabilityResolver: CapabilityResolver;
  let launchedApps: string[] = [];
  let pipeline: OrchestratorPipeline;

  beforeEach(() => {
    launchedApps = [];
    inspector = new EnvironmentInspector();
    context = new ContextManager();
    entityResolver = new EntityResolver(inspector, context);
    capabilityResolver = new CapabilityResolver(inspector);

    const registry = new ToolRegistry();
    const appLaunchTool = new AppLaunchTool({
      runner: async (appName: string) => {
        launchedApps.push(appName);
        return true;
      },
      verifier: async (appName: string) => launchedApps.includes(appName),
    });
    registry.register(appLaunchTool);

    const router = new ToolRouter({
      registry,
      policyEngine: new PolicyEngine(),
      auditLogger: new AuditLogger({
        logFilePath: path.resolve(process.cwd(), '.eva/test_adversarial_audit.json'),
      }),
    });

    pipeline = new OrchestratorPipeline({ router, contextManager: context, environmentInspector: inspector });
  });

  it('Adversarial 1: "open antigravity over here" strips qualifier and targets Antigravity', async () => {
    const norm = normalizer.normalize('open antigravity over here');
    expect(norm.cleanedText.toLowerCase()).toBe('open antigravity');
    expect(norm.strippedQualifiers).toContain('over here');

    const intent = intentResolver.resolve(norm);
    expect(intent.intent).toBe('OPEN_APPLICATION');
    expect(intent.rawTarget.toLowerCase()).toBe('antigravity');

    const entity = await entityResolver.resolve(intent.rawTarget);
    expect(entity.name).toBe('Antigravity');
    expect(entity.type).toBe('APPLICATION');
  });

  it('Adversarial 2: "open it" resolves from active context', async () => {
    context.setActiveApp('Antigravity');

    const norm = normalizer.normalize('open it');
    const intent = intentResolver.resolve(norm);
    expect(intent.rawTarget.toLowerCase()).toBe('it');

    const entity = await entityResolver.resolve(intent.rawTarget);
    expect(entity.name).toBe('Antigravity');
    expect(entity.type).toBe('APPLICATION');
  });

  it('Adversarial 3: "open the app" resolves to active application from context', async () => {
    context.setActiveApp('Google Chrome');

    const norm = normalizer.normalize('open the app');
    const intent = intentResolver.resolve(norm);
    expect(intent.rawTarget.toLowerCase()).toBe('the app');

    const entity = await entityResolver.resolve(intent.rawTarget);
    expect(entity.name).toBe('Google Chrome');
    expect(entity.type).toBe('APPLICATION');
  });

  it('Adversarial 4: "launch claude for this project" resolves Claude Code and active project', async () => {
    context.setActiveProject('EVA', '/Users/aman/Desktop/EVA');

    const norm = normalizer.normalize('launch claude for this project');
    const intent = intentResolver.resolve(norm);
    expect(intent.intent).toBe('RUN_DEVELOPER_TASK');
    expect(intent.rawTarget).toContain('claude');
  });

  it('Adversarial 5: "can you just open Antigravity right now please" strips all polite wrappers', async () => {
    const norm = normalizer.normalize('can you just open Antigravity right now please');
    expect(norm.cleanedText.toLowerCase()).toBe('open antigravity');
    expect(norm.strippedFillers).toContain('can you');
    expect(norm.strippedFillers).toContain('just');
    expect(norm.strippedQualifiers).toContain('right now');
    expect(norm.strippedQualifiers).toContain('please');

    const res = await pipeline.orchestrate({
      rawInput: 'can you just open Antigravity right now please',
      sessionId: 'sess-adv-1',
      deviceId: 'dev-1',
      taskId: 'task-adv-1',
    });

    expect(res.success).toBe(true);
    expect(launchedApps).toContain('Antigravity');
    expect(launchedApps).not.toContain('Antigravity right now');
  });
});

