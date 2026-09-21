/**
 * EVA Entity Resolver
 * Conforms to Section 4 & 20 of EVA Master Orchestration Spec
 * Resolves raw target names into typed entities using the local macOS environment and context
 */

import * as path from 'node:path';
import { ResolvedEntity, EntityType } from './types.js';
import { EnvironmentInspector } from './EnvironmentInspector.js';
import { ContextManager } from './ContextManager.js';
import { WEB_DOMAIN_REGEX } from '../planner/PromptEnhancer.js';
import { APP_NAME_MAP, normalizeMacAppName } from '../../tools/application/AppLaunchTool.js';

export class EntityResolver {
  private inspector: EnvironmentInspector;
  private contextManager: ContextManager;

  constructor(inspector: EnvironmentInspector, contextManager: ContextManager) {
    this.inspector = inspector;
    this.contextManager = contextManager;
  }

  public async resolve(rawTarget: string, intentHint?: string): Promise<ResolvedEntity> {
    const trimmed = rawTarget.trim();
    const lower = trimmed.toLowerCase();

    // 1. Check Anaphoric References ("it", "that", "the project", "the app")
    const anaphora = this.contextManager.resolveAnaphora(trimmed);
    if (anaphora && anaphora.resolvedName) {
      return {
        type: (anaphora.resolvedType as EntityType) || 'ANAPHORA',
        name: anaphora.resolvedName,
        confidence: 0.92,
        metadata: { resolvedFromAnaphora: true, originalReference: trimmed },
      };
    }

    // 2. Check URLs and Web Domains
    if (WEB_DOMAIN_REGEX.test(trimmed) || trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const url = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
      return {
        type: 'URL',
        name: trimmed,
        url,
        confidence: 0.99,
      };
    }

    // 3. Check Known Project Directories on Desktop
    const desktopProjects = this.inspector.getDesktopProjects();
    const matchingProject = desktopProjects.find(
      (p) => p.name.toLowerCase() === lower || lower === `project ${p.name.toLowerCase()}`
    );
    if (matchingProject) {
      this.contextManager.setActiveProject(matchingProject.name, matchingProject.path);
      return {
        type: 'PROJECT',
        name: matchingProject.name,
        resolvedPath: matchingProject.path,
        confidence: 0.98,
        metadata: {
          hasPackageJson: matchingProject.hasPackageJson,
          hasGit: matchingProject.hasGit,
        },
      };
    }

    if (intentHint === 'OPEN_PROJECT_IN_EDITOR') {
      const pPath = path.join(path.dirname(process.cwd()), trimmed);
      this.contextManager.setActiveProject(trimmed, pPath);
      return {
        type: 'PROJECT',
        name: trimmed,
        resolvedPath: pPath,
        confidence: 0.95,
      };
    }

    // 4. Check Antigravity Specifically
    if (lower === 'antigravity' || lower.includes('antigravity')) {
      const antiInspection = await this.inspector.inspectAntigravity();
      this.contextManager.setActiveApp('Antigravity');
      return {
        type: 'APPLICATION',
        name: 'Antigravity',
        resolvedPath: antiInspection.app?.appPath || '/Applications/Antigravity.app',
        bundleId: antiInspection.app?.bundleId || 'com.google.antigravity',
        confidence: 0.99,
        metadata: {
          isRunning: antiInspection.isRunning,
          hasCli: !!antiInspection.cli,
          recommendedStrategy: antiInspection.recommendedStrategy,
        },
      };
    }

    // 5. Check Installed macOS Applications
    const normalizedName = normalizeMacAppName(trimmed);
    const matchingApp = await this.inspector.findApp(normalizedName);
    if (matchingApp) {
      this.contextManager.setActiveApp(matchingApp.name);
      return {
        type: 'APPLICATION',
        name: matchingApp.name,
        resolvedPath: matchingApp.appPath,
        bundleId: matchingApp.bundleId,
        confidence: 0.95,
      };
    }

    if (APP_NAME_MAP[lower] || normalizedName.toLowerCase() !== lower) {
      const appName = APP_NAME_MAP[lower] || normalizedName;
      this.contextManager.setActiveApp(appName);
      return {
        type: 'APPLICATION',
        name: appName,
        confidence: 0.95,
      };
    }

    // 6. Check CLI Tools in PATH
    const matchingCli = await this.inspector.findCli(trimmed);
    if (matchingCli) {
      return {
        type: 'CLI_TOOL',
        name: matchingCli.name,
        resolvedPath: matchingCli.binaryPath,
        confidence: 0.93,
      };
    }

    // 7. Check if Target is a Person / Contact (e.g. for calls / messaging)
    if (intentHint === 'COMMUNICATION_CALL' || intentHint === 'COMMUNICATION_MESSAGE') {
      return {
        type: 'PERSON',
        name: trimmed,
        confidence: 0.9,
      };
    }

    // 8. Check if Target is a Media Search Query (e.g. for YouTube)
    if (intentHint === 'MEDIA_PLAYBACK') {
      return {
        type: 'MEDIA_QUERY',
        name: trimmed,
        confidence: 0.9,
      };
    }

    // 9. Check System Subsystems
    if (trimmed === 'mac_system' || lower.includes('battery') || lower.includes('status')) {
      return {
        type: 'SYSTEM_SUBSYSTEM',
        name: 'mac_system',
        confidence: 0.95,
      };
    }

    // Default: Fallback as Application or Unknown
    return {
      type: 'UNKNOWN',
      name: trimmed,
      confidence: 0.6,
    };
  }
}
