/**
 * EVA Orchestrator Core Unit Tests
 * Conforms to Sections 2, 3, 4, 8, 9, 10, 11, 12, 13, 14, 27, 31 of EVA Master Orchestration Spec
 */

import { describe, it, expect } from 'vitest';
import { SpeechNormalizer } from '../../../core/orchestrator/SpeechNormalizer.js';
import { IntentResolver } from '../../../core/orchestrator/IntentResolver.js';
import { EnvironmentInspector } from '../../../core/orchestrator/EnvironmentInspector.js';
import { ContextManager } from '../../../core/orchestrator/ContextManager.js';
import { EntityResolver } from '../../../core/orchestrator/EntityResolver.js';
import { CapabilityResolver } from '../../../core/orchestrator/CapabilityResolver.js';
import { RoleManager } from '../../../core/orchestrator/RoleManager.js';
import { PlannerOrchestrator } from '../../../core/orchestrator/PlannerOrchestrator.js';
import { PlanEvaluator } from '../../../core/orchestrator/PlanEvaluator.js';
import { TaskLifecycleTracker, TaskStatusType } from '../../../core/orchestrator/TaskStatus.js';

describe('EVA Orchestrator: SpeechNormalizer', () => {
  const normalizer = new SpeechNormalizer();

  it('should strip trailing location qualifiers ("over here") without corrupting target', () => {
    const result = normalizer.normalize('Open antigravity over here');
    expect(result.cleanedText.toLowerCase()).toBe('open antigravity');
    expect(result.strippedQualifiers).toContain('over here');
  });

  it('should strip conversational filler prefixes and suffixes ("can you please", "for me")', () => {
    const result = normalizer.normalize('Can you please open VS code for me');
    expect(result.cleanedText.toLowerCase()).toBe('open vs code');
    expect(result.strippedFillers).toContain('Can you please');
    expect(result.strippedQualifiers).toContain('for me');
  });

  it('should strip mid-sentence hesitation markers ("uh", "um", "like")', () => {
    const result = normalizer.normalize('Open uh Antigravity um real quick');
    expect(result.cleanedText.toLowerCase()).toBe('open antigravity');
    expect(result.strippedFillers).toContain('uh');
    expect(result.strippedFillers).toContain('um');
    expect(result.strippedQualifiers).toContain('real quick');
  });

  it('should preserve real target names cleanly', () => {
    const result = normalizer.normalize('Open D2S in vs code');
    expect(result.cleanedText).toBe('Open D2S in vs code');
  });
});

describe('EVA Orchestrator: IntentResolver & EntityResolver', () => {
  const normalizer = new SpeechNormalizer();
  const intentResolver = new IntentResolver();
  const inspector = new EnvironmentInspector();
  const context = new ContextManager();
  const entityResolver = new EntityResolver(inspector, context);

  it('should resolve "Open antigravity over here" to OPEN_APPLICATION with target "Antigravity"', async () => {
    const normalized = normalizer.normalize('Open antigravity over here');
    const intent = intentResolver.resolve(normalized);

    expect(intent.intent).toBe('OPEN_APPLICATION');
    expect(intent.rawTarget.toLowerCase()).toBe('antigravity');

    const entity = await entityResolver.resolve(intent.rawTarget);
    expect(entity.type).toBe('APPLICATION');
    expect(entity.name).toBe('Antigravity');
    expect(entity.bundleId).toBe('com.google.antigravity');
  });

  it('should resolve "Open D2S in vs code" to OPEN_PROJECT_IN_EDITOR', async () => {
    const normalized = normalizer.normalize('Open D2S in vs code');
    const intent = intentResolver.resolve(normalized);

    expect(intent.intent).toBe('OPEN_PROJECT_IN_EDITOR');
    expect(intent.rawTarget).toBe('D2S');

    const entity = await entityResolver.resolve(intent.rawTarget, intent.intent);
    expect(entity.type).toBe('PROJECT');
    expect(entity.name).toBe('D2S');
  });

  it('should resolve anaphora ("open it") to active entity', async () => {
    context.setActiveApp('Antigravity');
    const entity = await entityResolver.resolve('it');

    expect(entity.name).toBe('Antigravity');
    expect(entity.type).toBe('APPLICATION');
    expect(entity.metadata?.resolvedFromAnaphora).toBe(true);
  });
});

describe('EVA Orchestrator: CapabilityResolver', () => {
  const inspector = new EnvironmentInspector();
  const capabilityResolver = new CapabilityResolver(inspector);

  it('should resolve Antigravity launch strategy to MACOS_APP_BUNDLE or RUNNING_PROCESS_ACTIVATE', async () => {
    const intent = {
      intent: 'OPEN_APPLICATION' as const,
      rawTarget: 'Antigravity',
      action: 'launch_application',
      qualifiers: [],
      confidence: 0.99,
    };
    const entity = {
      type: 'APPLICATION' as const,
      name: 'Antigravity',
      bundleId: 'com.google.antigravity',
      resolvedPath: '/Applications/Antigravity.app',
      confidence: 0.99,
    };

    const strategy = await capabilityResolver.resolveStrategy(intent, entity);
    expect(['MACOS_APP_BUNDLE', 'RUNNING_PROCESS_ACTIVATE', 'TERMINAL_CLI']).toContain(strategy.type);
    expect(strategy.description).toContain('Antigravity');
  });
});

describe('EVA Orchestrator: Multi-Agent Plan Evaluator (Section 9, 10, 27)', () => {
  const evaluator = new PlanEvaluator();

  it('should select the safest and most reliable plan over an unsafe or unverified plan', () => {
    const safePlan = {
      id: 'plan_native_system',
      plannerId: 'native-system-planner',
      plannerRole: 'System Operator',
      description: 'Native application launch with verified active process check',
      steps: [{ thought: 'Launch app', toolName: 'app.launch', parameters: { appName: 'Antigravity' } }],
    };

    const unsafeRawPlan = {
      id: 'plan_cli_terminal',
      plannerId: 'raw-shell-planner',
      plannerRole: 'Unrestricted Shell',
      description: 'Blind shell execution without pre-checks',
      steps: [{ thought: 'Run shell', toolName: 'terminal.exec', parameters: { command: 'killall -9 Antigravity && open /Applications/Antigravity.app' } }],
    };

    const evaluation = evaluator.evaluatePlans([unsafeRawPlan, safePlan]);
    expect(evaluation.winningPlan.id).toBe('plan_native_system');
    expect(evaluation.winningPlan.scores?.safety).toBeGreaterThan(unsafeRawPlan.id.includes('cli') ? 0.9 : 0.8);
  });
});

describe('EVA Orchestrator: RoleManager & Claude Prompt Engineering (Section 12, 13, 14)', () => {
  const roleManager = new RoleManager();

  it('should detect PLANNER mode and generate comprehensive 4-phase strategic plan', () => {
    const role = roleManager.detectRoleFromGoal('Act as a planner: plan the return system');
    expect(role).toBe('PLANNER');

    const planOutput = roleManager.generateStrategicPlan('Customer Return Processing Pipeline');
    expect(planOutput.phasedStrategy.length).toBe(4);
    expect(planOutput.milestones.length).toBeGreaterThan(2);
    expect(planOutput.markdownContent).toContain('Business Objective');
    expect(planOutput.markdownContent).toContain('Risk Assessment');
  });

  it('should detect SENIOR_DEVELOPER mode and engineer high-quality Claude Code prompt', () => {
    const role = roleManager.detectRoleFromGoal('Act as the developer and build the user auth flow');
    expect(role).toBe('SENIOR_DEVELOPER');

    const promptDetails = roleManager.engineerClaudePrompt({
      objective: 'Implement robust OAuth2 token refresh with biometric fallback',
      projectPath: '/Users/aman/Desktop/EVA',
      relevantFiles: ['core/auth/TokenManager.ts', 'tests/auth.test.ts'],
    });

    expect(promptDetails.fullPrompt).toContain('Senior Software Engineer');
    expect(promptDetails.fullPrompt).toContain('Technical Constraints');
    expect(promptDetails.fullPrompt).toContain('Definition of Done');
    expect(promptDetails.fullPrompt).toContain('Security Requirements');
  });
});

describe('EVA Orchestrator: TaskLifecycleTracker (Section 31)', () => {
  it('should correctly transition through all required lifecycle states', () => {
    const tracker = new TaskLifecycleTracker('task_123');
    const observedStates: TaskStatusType[] = [];

    tracker.addListener((evt) => {
      observedStates.push(evt.currentStatus);
    });

    tracker.transition('UNDERSTANDING');
    tracker.transition('RESOLVING');
    tracker.transition('PLANNING');
    tracker.transition('AUTHORIZING');
    tracker.transition('EXECUTING');
    tracker.transition('OBSERVING');
    tracker.transition('VERIFYING');
    tracker.transition('COMPLETED');

    expect(observedStates).toEqual([
      'UNDERSTANDING',
      'RESOLVING',
      'PLANNING',
      'AUTHORIZING',
      'EXECUTING',
      'OBSERVING',
      'VERIFYING',
      'COMPLETED',
    ]);
    expect(tracker.isTerminal()).toBe(true);
  });
});
