/**
 * EVA Capability Resolver
 * Conforms to Section 5, 6, 7 of EVA Master Orchestration Spec
 * Determines how a capability or entity should be accessed on macOS
 */

import { ResolvedIntent, ResolvedEntity, CapabilityLaunchStrategy } from './types.js';
import { EnvironmentInspector } from './EnvironmentInspector.js';

export class CapabilityResolver {
  private inspector: EnvironmentInspector;

  constructor(inspector: EnvironmentInspector) {
    this.inspector = inspector;
  }

  public async resolveStrategy(intent: ResolvedIntent, entity: ResolvedEntity): Promise<CapabilityLaunchStrategy> {
    // 1. Antigravity Special Capability Resolution
    if (entity.name.toLowerCase() === 'antigravity') {
      const anti = await this.inspector.inspectAntigravity();
      if (anti.isRunning) {
        return {
          type: 'RUNNING_PROCESS_ACTIVATE',
          target: 'Antigravity',
          description: 'Focus and bring active Antigravity window to front',
          verificationMethod: 'process_window_check',
        };
      }
      if (anti.app) {
        return {
          type: 'MACOS_APP_BUNDLE',
          target: anti.app.bundleId || anti.app.appPath,
          command: 'open',
          args: anti.app.bundleId ? ['-b', anti.app.bundleId] : ['-a', anti.app.appPath],
          description: 'Launch Antigravity macOS desktop application bundle',
          verificationMethod: 'app_launch_verify',
        };
      }
      if (anti.cli) {
        return {
          type: 'TERMINAL_CLI',
          target: anti.cli.binaryPath,
          command: anti.cli.binaryPath,
          description: 'Launch Antigravity via terminal CLI binary',
          verificationMethod: 'cli_process_verify',
        };
      }
    }

    // 2. Open Project in Editor (e.g. VS Code)
    if (intent.intent === 'OPEN_PROJECT_IN_EDITOR' || (entity.type === 'PROJECT' && intent.intent === 'OPEN_APPLICATION')) {
      const projectPath = entity.resolvedPath || `/Users/aman/Desktop/${entity.name}`;
      return {
        type: 'VSCODE_WORKSPACE',
        target: entity.name,
        workingDirectory: projectPath,
        command: 'code',
        args: [projectPath],
        description: `Open project '${entity.name}' in Visual Studio Code`,
        verificationMethod: 'vscode_project_verify',
      };
    }

    // 3. Web Navigation / Browser
    if (intent.intent === 'WEB_SEARCH_OR_NAVIGATE' || entity.type === 'URL') {
      const browser = (intent.metadata?.browser as string) || 'Google Chrome';
      const url = entity.url || (entity.name.startsWith('http') ? entity.name : `https://${entity.name}`);
      return {
        type: 'BROWSER_NAVIGATE',
        target: url,
        args: [url],
        description: `Navigate to '${url}' using ${browser}`,
        verificationMethod: 'browser_tab_verify',
      };
    }

    // 4. Media Playback (YouTube)
    if (intent.intent === 'MEDIA_PLAYBACK') {
      const query = entity.name || 'trending music';
      const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
      return {
        type: 'BROWSER_NAVIGATE',
        target: searchUrl,
        args: [searchUrl],
        description: `Play '${query}' on YouTube in browser`,
        verificationMethod: 'browser_tab_verify',
      };
    }

    // 5. System Health Diagnostics
    if (intent.intent === 'SYSTEM_HEALTH_DIAGNOSTICS' || entity.type === 'SYSTEM_SUBSYSTEM') {
      return {
        type: 'SYSTEM_DIAGNOSTIC',
        target: 'mac_system',
        description: 'Inspect macOS real-time battery, charging, thermals, and active processes',
        verificationMethod: 'system_status_verify',
      };
    }

    // 6. Communication (WhatsApp Call / Message)
    if (intent.intent === 'COMMUNICATION_CALL' || intent.intent === 'COMMUNICATION_MESSAGE') {
      return {
        type: 'COMMUNICATION_DISPATCH',
        target: entity.name,
        description: `Initiate WhatsApp ${intent.action === 'video_call' ? 'video' : 'voice'} call to '${entity.name}'`,
        verificationMethod: 'whatsapp_dispatch_verify',
      };
    }

    // 7. General Application Launch / Close
    if (intent.intent === 'OPEN_APPLICATION' || intent.intent === 'CLOSE_APPLICATION' || intent.intent === 'CHECK_APPLICATION_STATUS') {
      const isRunning = await this.inspector.isAppRunning(entity.name, entity.bundleId);
      if (isRunning && intent.intent === 'OPEN_APPLICATION') {
        return {
          type: 'RUNNING_PROCESS_ACTIVATE',
          target: entity.name,
          description: `Activate currently running application '${entity.name}'`,
          verificationMethod: 'process_window_check',
        };
      }

      return {
        type: 'MACOS_APP_BUNDLE',
        target: entity.name,
        command: 'open',
        args: entity.bundleId ? ['-b', entity.bundleId] : ['-a', entity.name],
        description: `Manage application '${entity.name}'`,
        verificationMethod: 'app_launch_verify',
      };
    }

    // Default: None
    return {
      type: 'NONE',
      target: entity.name,
      description: `Default capability strategy for ${entity.name}`,
      verificationMethod: 'default_verify',
    };
  }
}

