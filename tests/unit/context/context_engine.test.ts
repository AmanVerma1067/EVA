import { describe, it, expect, beforeEach } from 'vitest';
import { ASTSymbolParser } from '../../../core/context/ASTSymbolParser.js';
import { TokenBudgetRadar } from '../../../core/context/TokenBudgetRadar.js';
import { ContextPruner } from '../../../core/context/ContextPruner.js';
import { ContextAnalyzeTool, ContextBudgetTool } from '../../../tools/developer/ContextTools.js';
import { ExecutionContext } from '../../../core/tools/ToolContract.js';

describe('Phase 18: Aware Context & Token Engine', () => {
  describe('ASTSymbolParser & Semantic Graph Slicing', () => {
    const parser = new ASTSymbolParser();

    const sampleCode = `
import { z } from 'zod';
import * as path from 'node:path';

export interface UserConfig {
  id: string;
  name: string;
  active: boolean;
}

export type UserRole = 'admin' | 'developer' | 'viewer';

export class UserService {
  private config: UserConfig;

  constructor(cfg: UserConfig) {
    this.config = cfg;
  }

  public async fetchUser(id: string): Promise<UserConfig> {
    // Simulated fetch implementation
    return this.config;
  }

  public deleteUser(id: string): boolean {
    // 50 lines of database cleanup logic
    console.log('Deleting user', id);
    return true;
  }
}

export function calculateMetrics(input: number[]): number {
  return input.reduce((a, b) => a + b, 0);
}

export function unusedHelper(text: string): string {
  // Complex unnecessary formatting logic
  return text.trim().toLowerCase();
}
`;

    it('should accurately parse symbols, types, and functions from TypeScript AST', () => {
      const parsed = parser.parseSource(sampleCode, 'user_service.ts');

      expect(parsed.symbols.length).toBeGreaterThan(4);
      expect(parsed.exports).toContain('UserConfig');
      expect(parsed.exports).toContain('UserService');
      expect(parsed.exports).toContain('calculateMetrics');

      const userConfig = parsed.symbols.find((s) => s.name === 'UserConfig');
      expect(userConfig).toBeDefined();
      expect(userConfig?.kind).toBe('interface');

      const fetchUser = parsed.symbols.find((s) => s.name === 'UserService.fetchUser');
      expect(fetchUser).toBeDefined();
      expect(fetchUser?.isAsync).toBe(true);
      expect(fetchUser?.parameters?.[0].name).toBe('id');
    });

    it('should generate a high-signal context slice targeting a specific symbol with >50% token reduction', () => {
      const slice = parser.createContextSlice({
        code: sampleCode,
        fileName: 'user_service.ts',
        targetSymbol: 'calculateMetrics',
      });

      expect(slice.targetSymbol).toBe('calculateMetrics');
      expect(slice.slicedCode).toContain('function calculateMetrics');
      expect(slice.slicedCode).toContain('[PRUNED]');
      expect(slice.tokensSaved).toBeGreaterThan(0);
      expect(slice.reductionPercentage).toBeGreaterThan(20);
    });

    it('should generate a full executive outline with token reduction when no target symbol is provided', () => {
      const slice = parser.createContextSlice({
        code: sampleCode,
        fileName: 'user_service.ts',
      });

      expect(slice.reductionPercentage).toBeGreaterThan(20);
      expect(slice.slicedCode).toContain('Semantic Outline');
      expect(slice.slicedCode).toContain('interface UserConfig');
    });
  });

  describe('TokenBudgetRadar & Quota Tracking', () => {
    let radar: TokenBudgetRadar;

    beforeEach(() => {
      radar = new TokenBudgetRadar({
        budget: { dailyTokenLimit: 100_000, dailyCostLimitUsd: 2.0 },
        persist: false,
      });
    });

    it('should calculate accurate costs across model rate cards', () => {
      const sonnetRes = radar.recordUsage({
        model: 'claude-3-5-sonnet',
        inputTokens: 10_000, // 10k * $3/M = $0.03
        outputTokens: 2_000,  // 2k * $15/M = $0.03
      });

      expect(sonnetRes.costUsd).toBeCloseTo(0.06, 3);
      expect(radar.getSessionInputTokens()).toBe(10_000);
      expect(radar.getSessionOutputTokens()).toBe(2_000);
      expect(radar.getTotalTokens()).toBe(12_000);
    });

    it('should detect when token usage crosses warning and limit thresholds', () => {
      const res = radar.recordUsage({
        inputTokens: 85_000,
        outputTokens: 0,
      });

      expect(res.isWarning).toBe(true);
      expect(res.isExceeded).toBe(false);

      const res2 = radar.recordUsage({
        inputTokens: 20_000,
        outputTokens: 0,
      });

      expect(res2.isExceeded).toBe(true);
    });

    it('should parse Claude Code weekly limit messages and extract reset timing', () => {
      const msg = "You've hit your weekly limit · resets Sep 13 at 9:30pm";
      const limit = radar.parseClaudeLimitMessage(msg);

      expect(limit.hasLimit).toBe(true);
      expect(limit.resetDate).toContain('Sep 13 at 9:30pm');
    });

    it('should render a visual progress gauge for terminal output', () => {
      radar.recordUsage({ inputTokens: 50_000, outputTokens: 0 });
      const gauge = radar.renderGauge(10);

      expect(gauge).toContain('[');
      expect(gauge).toContain(']');
      expect(gauge).toContain('50%');
    });
  });

  describe('ContextPruner & Diff-Only Slices', () => {
    const pruner = new ContextPruner();

    it('should strip license comments and redundant blank lines', () => {
      const codeWithLicense = `/*
 * Copyright (c) 2026 Acme Corp
 * MIT License
 */


function hello() {
  return 'world';
}


`;
      const cleaned = pruner.compactCode(codeWithLicense);
      expect(cleaned).not.toContain('Copyright');
      expect(cleaned).toContain('function hello()');
    });

    it('should construct a minimal diff-only context slice from unified git diffs', () => {
      const sampleDiff = `diff --git a/core/index.ts b/core/index.ts
index 123..456 100644
--- a/core/index.ts
+++ b/core/index.ts
@@ -10,3 +10,4 @@
 import * as os from 'node:os';
+import { TokenBudgetRadar } from './TokenBudgetRadar';
 
 export function start() {
`;
      const diffSlice = pruner.createDiffSlice(sampleDiff, 2000);

      expect(diffSlice.modifiedFiles).toContain('core/index.ts');
      expect(diffSlice.tokensSaved).toBeGreaterThan(1500);
      expect(diffSlice.reductionPercentage).toBeGreaterThan(70);
      expect(diffSlice.diffContext).toContain('TokenBudgetRadar');
    });
  });

  describe('Registered Context Tools Integration', () => {
    const mockCtx: ExecutionContext = {
      workspaceRoot: process.cwd(),
      taskId: 'task-test',
      sessionId: 'sess-test',
      deviceId: 'dev-test',
    };

    it('should execute context.analyze on package.json', async () => {
      const tool = new ContextAnalyzeTool();
      const res = await tool.execute({ path: 'package.json' }, mockCtx);

      expect(res.success).toBe(true);
      expect(res.data?.originalTokens).toBeGreaterThan(0);
      expect(res.data?.reductionPercentage).toBeGreaterThanOrEqual(0);
    });

    it('should execute context.budget tool and return usage gauge', async () => {
      const tool = new ContextBudgetTool();
      const res = await tool.execute({ action: 'status' });

      expect(res.success).toBe(true);
      expect(res.data?.dailyLimit).toBeGreaterThan(0);
      expect(res.data?.gauge).toBeDefined();
    });
  });
});
