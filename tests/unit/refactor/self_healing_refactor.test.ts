import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { DiffEngine } from '../../../core/refactor/DiffEngine.js';
import { SelfHealingLoop } from '../../../core/refactor/SelfHealingLoop.js';
import { SelfHealingRefactorTool } from '../../../tools/developer/RefactorTools.js';
import { AgentBrain } from '../../../core/planner/AgentBrain.js';
import { ToolRouter } from '../../../core/tools/ToolRouter.js';
import { ToolRegistry } from '../../../core/tools/ToolRegistry.js';
import { PolicyEngine } from '../../../security/policy/PolicyEngine.js';
import { AuditLogger } from '../../../security/audit/AuditLogger.js';
import { VoiceSystem } from '../../../voice/VoiceSystem.js';
import { ExecutionContext } from '../../../core/tools/ToolContract.js';

describe('Phase 20: Autonomous Self-Healing Refactor & Testing Loop', () => {
  let tempDir: string;
  let testFilePath: string;
  const originalCode = `export function calculateTotal(price: number, taxRate: number): number {
  return price + price * taxRate;
}
`;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eva-refactor-test-'));
    testFilePath = path.join(tempDir, 'calculate.ts');
    fs.writeFileSync(testFilePath, originalCode, 'utf-8');
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('DiffEngine: Unified Diffs & Atomic Patching', () => {
    it('should generate valid unified diff between two code strings', () => {
      const updatedCode = `export function calculateTotal(price: number, taxRate: number, discount = 0): number {
  return (price - discount) * (1 + taxRate);
}
`;
      const diff = DiffEngine.createUnifiedDiff('calculate.ts', originalCode, updatedCode);
      expect(diff).toContain('--- a/calculate.ts');
      expect(diff).toContain('+++ b/calculate.ts');
      expect(diff).toContain('-export function calculateTotal(price: number, taxRate: number): number {');
      expect(diff).toContain('+export function calculateTotal(price: number, taxRate: number, discount = 0): number {');
    });

    it('should apply a unified diff patch cleanly', () => {
      const updatedCode = `export function calculateTotal(price: number, taxRate: number, discount = 0): number {
  return (price - discount) * (1 + taxRate);
}
`;
      const diff = DiffEngine.createUnifiedDiff('calculate.ts', originalCode, updatedCode);
      const res = DiffEngine.applyPatch(originalCode, diff);

      expect(res.success).toBe(true);
      expect(res.patchedContent).toContain('discount = 0');
    });

    it('should apply search and replace edits cleanly', () => {
      const edits = [
        {
          target: 'return price + price * taxRate;',
          replacement: 'return price * (1 + taxRate);',
        },
      ];
      const res = DiffEngine.applySearchReplace(originalCode, edits);
      expect(res.success).toBe(true);
      expect(res.editsApplied).toBe(1);
      expect(res.content).toContain('price * (1 + taxRate)');
    });

    it('should abort multi-file patch atomically if any file fails validation', () => {
      const nonExistentFile = path.join(tempDir, 'missing.ts');
      const patches = [
        {
          filePath: testFilePath,
          edits: [{ target: 'price', replacement: 'basePrice' }],
        },
        {
          filePath: nonExistentFile,
          edits: [{ target: 'foo', replacement: 'bar' }],
        },
      ];

      const res = DiffEngine.applyMultiFileAtomic(patches, tempDir);
      expect(res.success).toBe(false);
      expect(res.appliedFiles.length).toBe(0);

      // Verify original file on disk was NOT mutated
      const content = fs.readFileSync(testFilePath, 'utf-8');
      expect(content).toBe(originalCode);
    });
  });

  describe('SelfHealingLoop: Closed Feedback Cycle & Rollback Gates', () => {
    it('Gate 1 (YAGNI): should reject speculative refactor and keep files untouched', async () => {
      const loop = new SelfHealingLoop({ workspaceRoot: tempDir });
      const res = await loop.executeRefactor({
        targetFiles: [testFilePath],
        refactorGoal: 'Refactor into generic abstract factory pattern just in case we need multiple engines',
        patches: [
          {
            filePath: testFilePath,
            edits: [{ target: 'calculateTotal', replacement: 'executeCalculation' }],
          },
        ],
      });

      expect(res.status).toBe('REJECTED');
      expect(res.rollbackOccurred).toBe(false);
      expect(fs.readFileSync(testFilePath, 'utf-8')).toBe(originalCode);
    });

    it('Gate 2 (Dry Run): should generate diff preview without mutating disk files', async () => {
      const loop = new SelfHealingLoop({ workspaceRoot: tempDir });
      const res = await loop.executeRefactor({
        targetFiles: [testFilePath],
        refactorGoal: 'Simplify arithmetic expression',
        dryRun: true,
        patches: [
          {
            filePath: testFilePath,
            edits: [{ target: 'price + price * taxRate', replacement: 'price * (1 + taxRate)' }],
          },
        ],
      });

      expect(res.status).toBe('DRY_RUN');
      expect(res.diffSummary).toContain('price * (1 + taxRate)');
      expect(fs.readFileSync(testFilePath, 'utf-8')).toBe(originalCode);
    });

    it('Gate 3 (Security & CodeReview): should automatically roll back if patch introduces secret leak', async () => {
      const loop = new SelfHealingLoop({ workspaceRoot: tempDir });
      const leakingEdit = [
        {
          target: 'return price + price * taxRate;',
          replacement: 'const apiKey = "sk-proj-1234567890abcdef1234567890"; return price * (1 + taxRate);',
        },
      ];

      const res = await loop.executeRefactor({
        targetFiles: [testFilePath],
        refactorGoal: 'Optimize arithmetic and cache keys',
        patches: [{ filePath: testFilePath, edits: leakingEdit }],
      });

      expect(res.status).toBe('ROLLED_BACK');
      expect(res.rollbackOccurred).toBe(true);
      expect(res.rollbackReason).toContain('NO_HARDCODED_SECRETS');
      // Must be restored to pristine original content!
      expect(fs.readFileSync(testFilePath, 'utf-8')).toBe(originalCode);
    });

    it('Gate 4 (Automated Tests): should automatically roll back if test runner fails', async () => {
      // Custom test runner simulating failure
      const failingTestRunner = async () => ({
        exitCode: 1,
        stdout: '',
        stderr: 'AssertionError: expected 100 to be 110 in calculateTotal',
      });

      const loop = new SelfHealingLoop({
        workspaceRoot: tempDir,
        customTestRunner: failingTestRunner,
      });

      const res = await loop.executeRefactor({
        targetFiles: [testFilePath],
        refactorGoal: 'Simplify calculation',
        patches: [
          {
            filePath: testFilePath,
            edits: [{ target: 'price + price * taxRate', replacement: 'price * 0' }],
          },
        ],
      });

      expect(res.status).toBe('ROLLED_BACK');
      expect(res.rollbackOccurred).toBe(true);
      expect(res.rollbackReason).toContain('Automated test verification failed');
      // Must be restored to pristine original content!
      expect(fs.readFileSync(testFilePath, 'utf-8')).toBe(originalCode);
    });

    it('Commit on Success: should apply patch and commit when tests pass', async () => {
      // Custom test runner simulating success
      const passingTestRunner = async () => ({
        exitCode: 0,
        stdout: '✓ tests passed (5/5)',
        stderr: '',
      });

      const loop = new SelfHealingLoop({
        workspaceRoot: tempDir,
        customTestRunner: passingTestRunner,
      });

      const res = await loop.executeRefactor({
        targetFiles: [testFilePath],
        refactorGoal: 'Simplify calculation formula',
        patches: [
          {
            filePath: testFilePath,
            edits: [{ target: 'price + price * taxRate', replacement: 'price * (1 + taxRate)' }],
          },
        ],
      });

      expect(res.status).toBe('SUCCESS');
      expect(res.rollbackOccurred).toBe(false);
      expect(fs.readFileSync(testFilePath, 'utf-8')).toContain('price * (1 + taxRate)');
    });
  });

  describe('Developer Tool & AgentBrain Integration', () => {
    const dummyCtx: ExecutionContext = {
      sessionId: 'sess-refactor',
      deviceId: 'dev-refactor',
      workspaceRoot: process.cwd(),
    };

    it('dev.self_healing_refactor tool should execute and verify correctly', async () => {
      const tool = new SelfHealingRefactorTool();
      const res = await tool.execute(
        {
          targetFiles: ['package.json'],
          refactorGoal: 'Check format',
          dryRun: true,
          edits: [{ target: '"version": "0.1.0"', replacement: '"version": "0.1.0"' }],
        },
        dummyCtx
      );

      expect(res.success).toBe(true);
      expect(res.data?.status).toBe('DRY_RUN');

      const verification = await tool.verify({ targetFiles: ['package.json'], refactorGoal: 'Check' }, res);
      expect(verification.verified).toBe(true);
    });

    it('AgentBrain should parse natural language refactor request', () => {
      const registry = new ToolRegistry();
      registry.register(new SelfHealingRefactorTool());
      const router = new ToolRouter({ registry, policyEngine: new PolicyEngine(), auditLogger: new AuditLogger() });
      const brain = new AgentBrain({ router, voice: new VoiceSystem({ enabled: false }) });

      const plan = brain.parseGoalToPlan('refactor core/logger/Logger.ts to simplify formatting');
      expect(plan.length).toBe(1);
      expect(plan[0].toolName).toBe('dev.self_healing_refactor');
      expect(plan[0].parameters.targetFiles).toContain('core/logger/Logger.ts');
    });
  });
});
