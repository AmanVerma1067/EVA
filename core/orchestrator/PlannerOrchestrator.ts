/**
 * EVA Multi-Agent Planner Orchestrator
 * Conforms to Section 8 of EVA Master Orchestration Spec
 * Coordinates multiple planning strategies to produce diverse candidate plans
 */

import {
  ResolvedIntent,
  ResolvedEntity,
  CapabilityLaunchStrategy,
  CandidatePlan,
  PlanStep,
  RoleType,
} from './types.js';

export class PlannerOrchestrator {
  /**
   * Generates candidate plans from multiple perspectives
   */
  public generateCandidatePlans(options: {
    goal: string;
    intent: ResolvedIntent;
    entity: ResolvedEntity;
    strategy: CapabilityLaunchStrategy;
    role: RoleType;
  }): CandidatePlan[] {
    const { goal, intent, entity, strategy, role } = options;
    const candidates: CandidatePlan[] = [];

    // ==========================================
    // Candidate 1: Native System / Direct Strategy Planner
    // ==========================================
    const nativeSteps = this.buildNativeSteps(intent, entity, strategy);
    candidates.push({
      id: 'plan_native_system',
      plannerId: 'native-system-planner',
      plannerRole: 'System Operator',
      description: `Native macOS system execution strategy: ${strategy.description}`,
      steps: nativeSteps,
      rationale: 'Direct integration with native macOS application bundles and system APIs',
    });

    // ==========================================
    // Candidate 2: CLI / Scripting Strategy Planner (when applicable)
    // ==========================================
    if (entity.type === 'APPLICATION' || entity.type === 'PROJECT' || intent.intent === 'OPEN_APPLICATION') {
      const cliSteps = this.buildCliSteps(intent, entity, strategy);
      if (cliSteps.length > 0) {
        candidates.push({
          id: 'plan_cli_terminal',
          plannerId: 'developer-cli-planner',
          plannerRole: 'Developer / Terminal Specialist',
          description: `Terminal CLI execution strategy for ${entity.name}`,
          steps: cliSteps,
          rationale: 'Scriptable terminal command line execution with direct process output tracking',
        });
      }
    }

    // ==========================================
    // Candidate 3: Conservative / Verified Fallback Planner
    // ==========================================
    const conservativeSteps = this.buildConservativeSteps(intent, entity, strategy);
    if (conservativeSteps.length > 0) {
      candidates.push({
        id: 'plan_conservative_verified',
        plannerId: 'safety-verification-planner',
        plannerRole: 'Safety & Verification Specialist',
        description: `Pre-checked and verified execution strategy for ${entity.name}`,
        steps: conservativeSteps,
        rationale: 'Inspects running state and pre-conditions prior to executing launch action',
      });
    }

    return candidates;
  }

  private buildNativeSteps(
    intent: ResolvedIntent,
    entity: ResolvedEntity,
    strategy: CapabilityLaunchStrategy
  ): PlanStep[] {
    // 1. Antigravity special handling
    if (entity.name.toLowerCase() === 'antigravity') {
      return [
        {
          thought: 'Launching Antigravity via verified macOS application bundle.',
          toolName: 'app.launch',
          parameters: { appName: 'Antigravity' },
        },
      ];
    }

    // 2. Open Project in VS Code
    if (intent.intent === 'OPEN_PROJECT_IN_EDITOR') {
      return [
        {
          thought: `Opening project '${entity.name}' in Visual Studio Code.`,
          toolName: 'vscode.open',
          parameters: { target: entity.name },
        },
      ];
    }

    // 3. System Diagnostics
    if (intent.intent === 'SYSTEM_HEALTH_DIAGNOSTICS') {
      let filter = 'all';
      const raw = intent.rawTarget.toLowerCase();
      if (raw.includes('battery') || raw.includes('charging')) filter = 'battery';
      else if (raw.includes('heating') || raw.includes('temperature')) filter = 'thermal';
      else if (raw.includes('apps')) filter = 'apps';
      return [
        {
          thought: 'Querying real-time macOS hardware status, thermals, and battery metrics.',
          toolName: 'system.mac_status',
          parameters: { filter },
        },
      ];
    }

    // 4. Communication (WhatsApp)
    if (intent.intent === 'COMMUNICATION_CALL') {
      return [
        {
          thought: `Starting WhatsApp ${intent.action === 'video_call' ? 'video' : 'voice'} call to '${entity.name}'.`,
          toolName: 'whatsapp.call',
          parameters: {
            recipient: entity.name,
            callType: intent.action === 'video_call' ? 'video' : 'voice',
          },
        },
      ];
    }

    // 5. Browser / Web Navigation
    if (intent.intent === 'WEB_SEARCH_OR_NAVIGATE' || intent.intent === 'MEDIA_PLAYBACK') {
      const url = strategy.target;
      return [
        {
          thought: `Opening web destination: ${url}`,
          toolName: 'browser.open',
          parameters: { url },
        },
      ];
    }

    // 6. General App Launch
    if (intent.intent === 'OPEN_APPLICATION') {
      return [
        {
          thought: `Launching application '${entity.name}'.`,
          toolName: 'app.launch',
          parameters: { appName: entity.name },
        },
      ];
    }

    // 7. Close Application
    if (intent.intent === 'CLOSE_APPLICATION') {
      return [
        {
          thought: `Closing application window for '${entity.name}'.`,
          toolName: 'window.close',
          parameters: { windowTitle: entity.name },
        },
      ];
    }

    // 8. Check Status
    if (intent.intent === 'CHECK_APPLICATION_STATUS') {
      return [
        {
          thought: `Checking if application '${entity.name}' is currently running.`,
          toolName: 'app.status',
          parameters: { appName: entity.name },
        },
      ];
    }

    // Default: App status or inspect
    return [
      {
        thought: `Inspecting environment for '${entity.name}'.`,
        toolName: 'app.status',
        parameters: { appName: entity.name },
      },
    ];
  }

  private buildCliSteps(
    intent: ResolvedIntent,
    entity: ResolvedEntity,
    strategy: CapabilityLaunchStrategy
  ): PlanStep[] {
    if (entity.name.toLowerCase() === 'antigravity') {
      return [
        {
          thought: 'Executing terminal command to launch Antigravity desktop environment.',
          toolName: 'terminal.exec',
          parameters: { command: 'open -a /Applications/Antigravity.app' },
        },
      ];
    }

    if (intent.intent === 'OPEN_APPLICATION') {
      return [
        {
          thought: `Launching '${entity.name}' via terminal open command.`,
          toolName: 'terminal.exec',
          parameters: { command: `open -a "${entity.name}"` },
        },
      ];
    }

    return [];
  }

  private buildConservativeSteps(
    intent: ResolvedIntent,
    entity: ResolvedEntity,
    strategy: CapabilityLaunchStrategy
  ): PlanStep[] {
    if (intent.intent === 'OPEN_APPLICATION' || entity.type === 'APPLICATION') {
      return [
        {
          thought: `Checking if '${entity.name}' is already running before launching.`,
          toolName: 'app.status',
          parameters: { appName: entity.name },
        },
        {
          thought: `Launching '${entity.name}'.`,
          toolName: 'app.launch',
          parameters: { appName: entity.name },
        },
      ];
    }

    return [];
  }
}

