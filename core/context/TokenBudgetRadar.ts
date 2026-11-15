/**
 * EVA Token Budget Radar & Provider Limit Tracking Engine
 * Conforms to Section 4 of EVA Master Architecture Spec (Phase 18)
 * Tracks real-time token utilization, cost estimation, Claude Code rate limit radar,
 * and renders CLI visual progress gauges.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { EvaHomeManager } from '../distribution/EvaHomeManager.js';

export interface ModelPricing {
  modelId: string;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
  cachedReadCostPerMillion: number;
}

export const STANDARD_PRICING: Record<string, ModelPricing> = {
  'claude-3-5-sonnet': {
    modelId: 'claude-3-5-sonnet',
    inputCostPerMillion: 3.0,
    outputCostPerMillion: 15.0,
    cachedReadCostPerMillion: 0.3,
  },
  'claude-3-5-haiku': {
    modelId: 'claude-3-5-haiku',
    inputCostPerMillion: 1.0,
    outputCostPerMillion: 5.0,
    cachedReadCostPerMillion: 0.1,
  },
  'gpt-4o': {
    modelId: 'gpt-4o',
    inputCostPerMillion: 2.5,
    outputCostPerMillion: 10.0,
    cachedReadCostPerMillion: 1.25,
  },
  'gpt-4o-mini': {
    modelId: 'gpt-4o-mini',
    inputCostPerMillion: 0.15,
    outputCostPerMillion: 0.6,
    cachedReadCostPerMillion: 0.075,
  },
  'ollama-local': {
    modelId: 'ollama-local',
    inputCostPerMillion: 0.0,
    outputCostPerMillion: 0.0,
    cachedReadCostPerMillion: 0.0,
  },
};

export interface TokenUsageRecord {
  timestamp: string;
  taskId?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  costUsd: number;
}

export interface BudgetConfig {
  dailyTokenLimit: number;
  weeklyTokenLimit: number;
  dailyCostLimitUsd: number;
  warningThresholdPercentage: number;
}

export const DEFAULT_BUDGET: BudgetConfig = {
  dailyTokenLimit: 500_000,
  weeklyTokenLimit: 2_500_000,
  dailyCostLimitUsd: 10.0,
  warningThresholdPercentage: 80,
};

export interface ClaudeLimitStatus {
  hasLimit: boolean;
  rawMessage?: string;
  resetDate?: string;
  resetHoursRemaining?: number;
}

export class TokenBudgetRadar {
  private homeManager: EvaHomeManager;
  private budgetConfig: BudgetConfig;
  private persist: boolean;
  private sessionInputTokens = 0;
  private sessionOutputTokens = 0;
  private sessionCachedTokens = 0;
  private sessionCostUsd = 0;
  private records: TokenUsageRecord[] = [];
  private lastClaudeLimit: ClaudeLimitStatus = { hasLimit: false };

  constructor(options?: { homeManager?: EvaHomeManager; budget?: Partial<BudgetConfig>; persist?: boolean }) {
    this.homeManager = options?.homeManager ?? new EvaHomeManager();
    this.budgetConfig = { ...DEFAULT_BUDGET, ...options?.budget };
    this.persist = options?.persist ?? true;
    if (this.persist) {
      this.loadState();
    }
  }

  public resetSession(): void {
    this.sessionInputTokens = 0;
    this.sessionOutputTokens = 0;
    this.sessionCachedTokens = 0;
    this.sessionCostUsd = 0;
    this.records = [];
    this.lastClaudeLimit = { hasLimit: false };
    if (this.persist) {
      this.saveState();
    }
  }

  /**
   * Records a token usage event from a model completion or agent step
   */
  public recordUsage(params: {
    model?: string;
    inputTokens: number;
    outputTokens: number;
    cachedTokens?: number;
    taskId?: string;
  }): { costUsd: number; isWarning: boolean; isExceeded: boolean } {
    const model = params.model ?? 'claude-3-5-sonnet';
    const cachedTokens = params.cachedTokens ?? 0;
    const pricing = STANDARD_PRICING[model] ?? STANDARD_PRICING['claude-3-5-sonnet'];

    const costUsd =
      (params.inputTokens / 1_000_000) * pricing.inputCostPerMillion +
      (params.outputTokens / 1_000_000) * pricing.outputCostPerMillion +
      (cachedTokens / 1_000_000) * pricing.cachedReadCostPerMillion;

    this.sessionInputTokens += params.inputTokens;
    this.sessionOutputTokens += params.outputTokens;
    this.sessionCachedTokens += cachedTokens;
    this.sessionCostUsd += costUsd;

    const record: TokenUsageRecord = {
      timestamp: new Date().toISOString(),
      taskId: params.taskId,
      model,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      cachedTokens,
      costUsd: Math.round(costUsd * 10000) / 10000,
    };

    this.records.push(record);
    this.saveState();

    const totalUsed = this.getTotalTokens();
    const isWarning = totalUsed >= (this.budgetConfig.dailyTokenLimit * this.budgetConfig.warningThresholdPercentage) / 100;
    const isExceeded = totalUsed >= this.budgetConfig.dailyTokenLimit || this.sessionCostUsd >= this.budgetConfig.dailyCostLimitUsd;

    return { costUsd, isWarning, isExceeded };
  }

  public getTotalTokens(): number {
    return this.sessionInputTokens + this.sessionOutputTokens + this.sessionCachedTokens;
  }

  public getSessionInputTokens(): number {
    return this.sessionInputTokens;
  }

  public getSessionOutputTokens(): number {
    return this.sessionOutputTokens;
  }

  public getSessionCachedTokens(): number {
    return this.sessionCachedTokens;
  }

  public getSessionCostUsd(): number {
    return Math.round(this.sessionCostUsd * 10000) / 10000;
  }

  public getBudgetConfig(): BudgetConfig {
    return { ...this.budgetConfig };
  }

  public setBudgetConfig(config: Partial<BudgetConfig>): void {
    this.budgetConfig = { ...this.budgetConfig, ...config };
    this.saveState();
  }

  /**
   * Inspects Claude Code CLI execution output for weekly and rate limits
   */
  public parseClaudeLimitMessage(text: string): ClaudeLimitStatus {
    const lower = text.toLowerCase();
    const limitRegex = /(?:hit your weekly limit|weekly limit reached|rate limit exceeded|resets\s+([A-Za-z]{3}\s+\d+\s+at\s+[\d:]+(?:am|pm)?))/i;
    const match = text.match(limitRegex);

    if (match || lower.includes('weekly limit') || lower.includes('usage limit')) {
      const resetDateMatch = text.match(/resets\s+([A-Za-z]{3}\s+\d+\s+at\s+[\d:]+(?:am|pm)?)/i);
      const resetDate = resetDateMatch ? resetDateMatch[1] : undefined;

      this.lastClaudeLimit = {
        hasLimit: true,
        rawMessage: text.slice(0, 200),
        resetDate,
        resetHoursRemaining: resetDate ? 24 : undefined,
      };
      return this.lastClaudeLimit;
    }

    this.lastClaudeLimit = { hasLimit: false };
    return this.lastClaudeLimit;
  }

  public getLastClaudeLimit(): ClaudeLimitStatus {
    return this.lastClaudeLimit;
  }

  /**
   * Renders an ASCII visual progress gauge for the CLI
   */
  public renderGauge(width = 25): string {
    const total = this.getTotalTokens();
    const limit = this.budgetConfig.dailyTokenLimit;
    const ratio = Math.min(1.0, total / limit);
    const filled = Math.round(ratio * width);
    const empty = Math.max(0, width - filled);

    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    const pct = Math.round(ratio * 100);

    return `[${bar}] ${pct}% (${total.toLocaleString()} / ${limit.toLocaleString()} tokens | $${this.getSessionCostUsd().toFixed(4)} USD)`;
  }

  /**
   * Generates a comprehensive summary report
   */
  public getStatusReport(): {
    sessionTotalTokens: number;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    costUsd: number;
    dailyLimit: number;
    usagePercentage: number;
    remainingTokens: number;
    gauge: string;
    claudeLimit: ClaudeLimitStatus;
  } {
    const total = this.getTotalTokens();
    const dailyLimit = this.budgetConfig.dailyTokenLimit;
    const usagePercentage = Math.round((total / dailyLimit) * 1000) / 10;
    const remainingTokens = Math.max(0, dailyLimit - total);

    return {
      sessionTotalTokens: total,
      inputTokens: this.sessionInputTokens,
      outputTokens: this.sessionOutputTokens,
      cachedTokens: this.sessionCachedTokens,
      costUsd: this.getSessionCostUsd(),
      dailyLimit,
      usagePercentage,
      remainingTokens,
      gauge: this.renderGauge(20),
      claudeLimit: this.lastClaudeLimit,
    };
  }

  private getStateFilePath(): string {
    const stateDir = this.homeManager.getDirectoryPath('state');
    if (!fs.existsSync(stateDir)) {
      try {
        fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
      } catch {}
    }
    return path.join(stateDir, 'token_radar_state.json');
  }

  private loadState(): void {
    try {
      const p = this.getStateFilePath();
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf-8');
        const parsed = JSON.parse(raw);
        this.sessionInputTokens = parsed.sessionInputTokens ?? 0;
        this.sessionOutputTokens = parsed.sessionOutputTokens ?? 0;
        this.sessionCachedTokens = parsed.sessionCachedTokens ?? 0;
        this.sessionCostUsd = parsed.sessionCostUsd ?? 0;
        if (parsed.budgetConfig) {
          this.budgetConfig = { ...this.budgetConfig, ...parsed.budgetConfig };
        }
        if (Array.isArray(parsed.records)) {
          this.records = parsed.records.slice(-100);
        }
      }
    } catch {}
  }

  private saveState(): void {
    if (!this.persist) return;
    try {
      const p = this.getStateFilePath();
      const payload = {
        sessionInputTokens: this.sessionInputTokens,
        sessionOutputTokens: this.sessionOutputTokens,
        sessionCachedTokens: this.sessionCachedTokens,
        sessionCostUsd: this.sessionCostUsd,
        budgetConfig: this.budgetConfig,
        records: this.records.slice(-100),
        updatedAt: new Date().toISOString(),
      };
      fs.writeFileSync(p, JSON.stringify(payload, null, 2), { mode: 0o600 });
    } catch {}
  }
}
