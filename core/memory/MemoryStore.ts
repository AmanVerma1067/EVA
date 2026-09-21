/**
 * EVA Persistent Structured Memory & Context Engine (Phase 8)
 * Persists project locations, user preferences, and short-term dialogue context
 * safely in local structured storage (.eva/memory.json).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { rootLogger } from '../logger/Logger.js';

export interface ProjectMemory {
  id: string;
  name: string;
  path: string;
  techStack?: string[];
  lastAccessed: string;
  notes?: string;
}

export interface ConversationContext {
  lastRecipient?: string;
  lastApp?: string;
  lastFilePath?: string;
  lastCommand?: string;
  lastGoal?: string;
  lastClaudeReview?: string;
  lastClaudeTask?: string;
  lastToolName?: string;
  lastToolOutput?: string;
  lastSpokenSummary?: string;
  lastResponseText?: string;
  updatedAt: string;
}

export interface MemoryData {
  projects: Record<string, ProjectMemory>;
  preferences: Record<string, any>;
  context: ConversationContext;
}

export class MemoryStore {
  private logger = rootLogger.child('memory');
  private filePath: string;
  private data: MemoryData;

  constructor(options?: { filePath?: string }) {
    this.filePath = options?.filePath ?? path.resolve(process.cwd(), '.eva/memory.json');
    this.data = {
      projects: {},
      preferences: {
        voiceSpeed: 1.0,
        voiceName: 'Samantha',
        autoApproveReads: true,
      },
      context: {
        updatedAt: new Date().toISOString(),
      },
    };
    this.load();
  }

  private load(): void {
    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const parsed = JSON.parse(raw);
        this.data = {
          projects: parsed.projects ?? {},
          preferences: { ...this.data.preferences, ...(parsed.preferences ?? {}) },
          context: parsed.context ?? { updatedAt: new Date().toISOString() },
        };
      } catch (err) {
        this.logger.error('Failed to parse memory file', {}, err);
      }
    }
  }

  private persist(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (err) {
      this.logger.error('Failed to persist memory', {}, err);
    }
  }

  // --- Project Memory ---
  public saveProject(project: Omit<ProjectMemory, 'lastAccessed'>): ProjectMemory {
    const full: ProjectMemory = {
      ...project,
      lastAccessed: new Date().toISOString(),
    };
    this.data.projects[project.id] = full;
    this.persist();
    this.logger.info(`Saved project memory: ${project.name} (${project.path})`);
    return full;
  }

  public getProject(idOrName: string): ProjectMemory | undefined {
    if (this.data.projects[idOrName]) {
      return this.data.projects[idOrName];
    }
    const lower = idOrName.toLowerCase();
    return Object.values(this.data.projects).find(
      (p) => p.name.toLowerCase() === lower || p.path.toLowerCase().endsWith(lower)
    );
  }

  public listProjects(): ProjectMemory[] {
    return Object.values(this.data.projects);
  }

  // --- Preferences ---
  public setPreference(key: string, value: any): void {
    this.data.preferences[key] = value;
    this.persist();
  }

  public getPreference<T = any>(key: string, defaultValue?: T): T | undefined {
    return (this.data.preferences[key] !== undefined ? this.data.preferences[key] : defaultValue) as T;
  }

  // --- Context & Anaphora Resolution ("it", "the file", "call him") ---
  public updateContext(partial: Partial<Omit<ConversationContext, 'updatedAt'>>): ConversationContext {
    this.data.context = {
      ...this.data.context,
      ...partial,
      updatedAt: new Date().toISOString(),
    };
    this.persist();
    return this.data.context;
  }

  public getContext(): ConversationContext {
    return this.data.context;
  }

  public clearContext(): void {
    this.data.context = { updatedAt: new Date().toISOString() };
    this.persist();
  }

  public reset(): void {
    this.data = {
      projects: {},
      preferences: {},
      context: { updatedAt: new Date().toISOString() },
    };
    if (fs.existsSync(this.filePath)) {
      try {
        fs.unlinkSync(this.filePath);
      } catch {
        // ignore
      }
    }
  }
}
