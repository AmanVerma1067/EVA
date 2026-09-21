/**
 * EVA Diagnostic Recovery Engine
 * Conforms to Section 23, 24, 25 of EVA Master Orchestration Spec
 * Performs self-diagnostics, failure classification, and adaptive recovery plan formulation.
 */

import { PlanStep, RecoveryAttempt } from './types.js';
import { EnvironmentInspector } from './EnvironmentInspector.js';
import { ToolDispatchOutput } from '../tools/ToolRouter.js';

export class RecoveryEngine {
  private inspector: EnvironmentInspector;

  constructor(inspector: EnvironmentInspector) {
    this.inspector = inspector;
  }

  /**
   * Diagnoses execution failure and formulates an adaptive recovery plan
   */
  public async diagnoseAndRecover(
    failedStep: PlanStep,
    stepOutput: ToolDispatchOutput
  ): Promise<RecoveryAttempt | undefined> {
    const errorMsg = stepOutput.error?.message || '';

    // ==========================================
    // 1. App Launch Failure (e.g. Antigravity or misnamed app)
    // ==========================================
    if (failedStep.toolName === 'app.launch') {
      const appName = String(failedStep.parameters.appName || '');

      // Antigravity specific diagnostic recovery
      if (appName.toLowerCase().includes('antigravity')) {
        const anti = await this.inspector.inspectAntigravity();

        if (anti.app) {
          // Alternative: Try launching via direct bundle ID or absolute path
          return {
            failureReason: `Initial launch of '${appName}' failed. Located macOS app bundle at '${anti.app.appPath}'.`,
            recoveryStrategy: 'Direct bundle execution fallback',
            recoveryPlan: [
              {
                thought: `Retrying launch using verified bundle ID '${anti.app.bundleId || 'com.google.antigravity'}'.`,
                toolName: 'app.launch',
                parameters: { appName: anti.app.bundleId || anti.app.appPath },
              },
            ],
            attempted: false,
          };
        }

        if (anti.cli) {
          // Alternative: Try launching via CLI binary in terminal
          return {
            failureReason: `Antigravity desktop bundle not accessible, but CLI binary found at '${anti.cli.binaryPath}'.`,
            recoveryStrategy: 'Terminal CLI launch fallback',
            recoveryPlan: [
              {
                thought: `Launching Antigravity via terminal command: ${anti.cli.binaryPath}`,
                toolName: 'terminal.exec',
                parameters: { command: anti.cli.binaryPath },
              },
            ],
            attempted: false,
          };
        }
      }

      // General app diagnostic: Try finding closest installed app in /Applications
      const found = await this.inspector.findApp(appName);
      if (found && found.name.toLowerCase() !== appName.toLowerCase()) {
        return {
          failureReason: `App '${appName}' failed to open. Discovered matching installed app '${found.name}'.`,
          recoveryStrategy: 'Discovered app name correction fallback',
          recoveryPlan: [
            {
              thought: `Retrying launch using exact discovered app name '${found.name}'.`,
              toolName: 'app.launch',
              parameters: { appName: found.name },
            },
          ],
          attempted: false,
        };
      }
    }

    // ==========================================
    // 2. VS Code Project Open Failure
    // ==========================================
    if (failedStep.toolName === 'vscode.open') {
      const target = String(failedStep.parameters.target || '');
      const desktopProjects = this.inspector.getDesktopProjects();
      const match = desktopProjects.find((p) => p.name.toLowerCase() === target.toLowerCase());

      if (match) {
        return {
          failureReason: `VS Code failed to open target '${target}'. Located exact project path at '${match.path}'.`,
          recoveryStrategy: 'Explicit absolute project path fallback',
          recoveryPlan: [
            {
              thought: `Retrying VS Code launch with verified absolute directory path '${match.path}'.`,
              toolName: 'vscode.open',
              parameters: { target: match.path },
            },
          ],
          attempted: false,
        };
      }
    }

    // ==========================================
    // 3. Claude Code Rate Limit or Timeout (No Blind Retry)
    // ==========================================
    if (
      failedStep.toolName === 'claude.review_project' ||
      failedStep.toolName === 'claude.complete_task'
    ) {
      if (/limit|quota|exceeded|too low/i.test(errorMsg)) {
        // Do NOT retry rate limits blindly
        return undefined;
      }
    }

    return undefined;
  }
}

