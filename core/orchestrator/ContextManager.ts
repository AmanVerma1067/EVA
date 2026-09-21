/**
 * EVA Context Manager
 * Conforms to Section 16 & 17 of EVA Master Orchestration Spec
 * Manages cross-command state, active project/app context, and pronoun/anaphora resolution
 */

export interface ActiveContext {
  activeProjectName?: string;
  activeProjectPath?: string;
  activeAppName?: string;
  lastExecutedTool?: string;
  lastToolOutput?: unknown;
  lastClaudeReview?: string;
  lastClaudeTask?: string;
  lastSpokenResponse?: string;
  recentEntities: Array<{ name: string; type: string; timestamp: number }>;
}

export class ContextManager {
  private context: ActiveContext = {
    recentEntities: [],
  };

  public getContext(): ActiveContext {
    return { ...this.context };
  }

  public setActiveProject(name: string, projectPath: string): void {
    this.context.activeProjectName = name;
    this.context.activeProjectPath = projectPath;
    this.recordEntity(name, 'PROJECT');
  }

  public setActiveApp(appName: string): void {
    this.context.activeAppName = appName;
    this.recordEntity(appName, 'APPLICATION');
  }

  public recordExecution(toolName: string, output: unknown, spokenResponse?: string): void {
    this.context.lastExecutedTool = toolName;
    this.context.lastToolOutput = output;
    if (spokenResponse) {
      this.context.lastSpokenResponse = spokenResponse;
    }
  }

  public recordClaudeReview(reviewSummary: string): void {
    this.context.lastClaudeReview = reviewSummary;
    this.recordEntity('Claude Code', 'CLI_TOOL');
  }

  public recordClaudeTask(taskSummary: string): void {
    this.context.lastClaudeTask = taskSummary;
    this.recordEntity('Claude Code', 'CLI_TOOL');
  }

  public recordEntity(name: string, type: string): void {
    this.context.recentEntities.unshift({
      name,
      type,
      timestamp: Date.now(),
    });
    if (this.context.recentEntities.length > 20) {
      this.context.recentEntities.pop();
    }
  }

  /**
   * Resolves anaphoric references ("it", "that", "the project", "the app", "there")
   */
  public resolveAnaphora(reference: string): { resolvedName?: string; resolvedType?: string } | undefined {
    const lower = reference.toLowerCase().trim();

    // 1. "it" or "that"
    if (lower === 'it' || lower === 'that' || lower === 'this') {
      if (this.context.activeAppName) {
        return { resolvedName: this.context.activeAppName, resolvedType: 'APPLICATION' };
      }
      if (this.context.activeProjectName) {
        return { resolvedName: this.context.activeProjectName, resolvedType: 'PROJECT' };
      }
      const mostRecent = this.context.recentEntities[0];
      if (mostRecent) {
        return { resolvedName: mostRecent.name, resolvedType: mostRecent.type };
      }
    }

    // 2. "the project" or "that project"
    if (lower === 'the project' || lower === 'that project' || lower === 'this project') {
      if (this.context.activeProjectName) {
        return { resolvedName: this.context.activeProjectName, resolvedType: 'PROJECT' };
      }
      const projectEntity = this.context.recentEntities.find((e) => e.type === 'PROJECT');
      if (projectEntity) {
        return { resolvedName: projectEntity.name, resolvedType: 'PROJECT' };
      }
    }

    // 3. "the app" or "that app"
    if (lower === 'the app' || lower === 'that app' || lower === 'the application') {
      if (this.context.activeAppName) {
        return { resolvedName: this.context.activeAppName, resolvedType: 'APPLICATION' };
      }
      const appEntity = this.context.recentEntities.find((e) => e.type === 'APPLICATION');
      if (appEntity) {
        return { resolvedName: appEntity.name, resolvedType: 'APPLICATION' };
      }
    }

    // 4. "claude" reference in follow-up ("now give that to claude", "open claude")
    if (lower === 'claude' || lower === 'claude code') {
      return {
        resolvedName: 'Claude Code',
        resolvedType: 'CLI_TOOL',
      };
    }

    return undefined;
  }
}

