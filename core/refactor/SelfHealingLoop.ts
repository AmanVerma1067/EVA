/**
 * EVA Autonomous Self-Healing Refactor & Testing Loop (Phase 20)
 * 
 * Orchestrates the closed feedback cycle:
 * Plan -> Snapshot Backup -> YAGNI Gate -> Atomic Patch -> CodeReview Audit -> Vitest Test -> Auto-Rollback / Commit
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { DiffEngine, SearchReplaceEdit } from './DiffEngine.js';
import { YagniDecisionLadder, YagniEvaluationResult } from '../pragmatic/YagniDecisionLadder.js';
import { CodeReviewAuditor, CodeReviewResult } from '../pragmatic/CodeReviewAuditor.js';
import { EvaHomeManager } from '../distribution/EvaHomeManager.js';

const execAsync = promisify(exec);

export type RefactorStatus = 'SUCCESS' | 'ROLLED_BACK' | 'REJECTED' | 'DRY_RUN';

export interface FileSnapshot {
  filePath: string;
  originalContent: string;
  backupDiskPath?: string;
}

export interface RefactorInput {
  targetFiles: string[];
  refactorGoal: string;
  patches?: Array<{
    filePath: string;
    patch?: string;
    edits?: SearchReplaceEdit[];
  }>;
  testCommand?: string;
  dryRun?: boolean;
  skipYagni?: boolean;
  workspaceRoot?: string;
}

export interface TestExecutionSummary {
  exitCode: number;
  stdout: string;
  stderr: string;
  passedCount?: number;
  failedCount?: number;
  durationMs: number;
}

export interface RefactorResult {
  status: RefactorStatus;
  refactorGoal: string;
  appliedFiles: string[];
  diffSummary: string;
  rollbackOccurred: boolean;
  rollbackReason?: string;
  yagniResult?: YagniEvaluationResult;
  auditResults?: CodeReviewResult[];
  testSummary?: TestExecutionSummary;
  durationMs: number;
  message: string;
}

export class SelfHealingLoop {
  private workspaceRoot: string;
  private yagniLadder: YagniDecisionLadder;
  private reviewAuditor: CodeReviewAuditor;
  private homeManager?: EvaHomeManager;
  private customTestRunner?: (cmd: string) => Promise<{ exitCode: number; stdout: string; stderr: string }>;

  constructor(options?: {
    workspaceRoot?: string;
    yagniLadder?: YagniDecisionLadder;
    reviewAuditor?: CodeReviewAuditor;
    homeManager?: EvaHomeManager;
    customTestRunner?: (cmd: string) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
  }) {
    this.workspaceRoot = options?.workspaceRoot || process.cwd();
    this.homeManager = options?.homeManager;
    this.yagniLadder = options?.yagniLadder || new YagniDecisionLadder({ homeManager: this.homeManager });
    this.reviewAuditor = options?.reviewAuditor || new CodeReviewAuditor({ workspaceRoot: this.workspaceRoot });
    this.customTestRunner = options?.customTestRunner;
  }

  /**
   * Executes the full autonomous self-healing refactor loop
   */
  public async executeRefactor(input: RefactorInput): Promise<RefactorResult> {
    const startTime = Date.now();
    const root = input.workspaceRoot || this.workspaceRoot;
    const snapshots: FileSnapshot[] = [];

    // ========================================================
    // Step 1: Pre-flight Snapshot & Backup
    // ========================================================
    const backupDir = this.homeManager
      ? path.join(this.homeManager.getDirectoryPath('backups'), `refactor_${Date.now()}`)
      : path.join(root, '.eva_refactor_backup');

    for (const relPath of input.targetFiles) {
      const absPath = path.isAbsolute(relPath) ? relPath : path.resolve(root, relPath);
      if (fs.existsSync(absPath)) {
        const content = fs.readFileSync(absPath, 'utf-8');
        let diskBackup: string | undefined;

        try {
          fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
          diskBackup = path.join(backupDir, Buffer.from(relPath).toString('hex'));
          fs.writeFileSync(diskBackup, content, 'utf-8');
        } catch {
          // In-memory backup remains intact even if disk write fails
        }

        snapshots.push({
          filePath: absPath,
          originalContent: content,
          backupDiskPath: diskBackup,
        });
      }
    }

    // Helper for guaranteed atomic rollback
    const triggerRollback = (reason: string): void => {
      for (const snap of snapshots) {
        try {
          fs.writeFileSync(snap.filePath, snap.originalContent, 'utf-8');
        } catch {
          // Log rollback failure
        }
      }
    };

    // Helper to cleanup backups on successful commit
    const cleanupBackup = (): void => {
      if (fs.existsSync(backupDir)) {
        try {
          fs.rmSync(backupDir, { recursive: true, force: true });
        } catch {
          // Non-critical
        }
      }
    };

    // ========================================================
    // Step 2: YAGNI Evaluation Gate
    // ========================================================
    let yagniResult: YagniEvaluationResult | undefined;
    if (!input.skipYagni) {
      yagniResult = this.yagniLadder.evaluate({
        taskDescription: input.refactorGoal,
        workspaceRoot: root,
      });

      if (!yagniResult.approved) {
        cleanupBackup();
        return {
          status: 'REJECTED',
          refactorGoal: input.refactorGoal,
          appliedFiles: [],
          diffSummary: '',
          rollbackOccurred: false,
          rollbackReason: `YAGNI Gate Rejection: ${yagniResult.rationale}`,
          yagniResult,
          durationMs: Date.now() - startTime,
          message: `Refactor rejected by Ponytail YAGNI ladder: ${yagniResult.rationale}`,
        };
      }
    }

    // ========================================================
    // Step 3: Dry-Run Check or Patch Application
    // ========================================================
    if (!input.patches || input.patches.length === 0) {
      cleanupBackup();
      return {
        status: 'REJECTED',
        refactorGoal: input.refactorGoal,
        appliedFiles: [],
        diffSummary: '',
        rollbackOccurred: false,
        rollbackReason: 'No patches or Search/Replace edits provided for refactoring.',
        durationMs: Date.now() - startTime,
        message: 'No patches or edits provided.',
      };
    }

    if (input.dryRun) {
      cleanupBackup();
      let dryRunDiff = '';
      for (const p of input.patches) {
        const snap = snapshots.find((s) => s.filePath.endsWith(p.filePath) || p.filePath.endsWith(path.basename(s.filePath)));
        if (snap) {
          if (p.patch) {
            dryRunDiff += p.patch + '\n';
          } else if (p.edits) {
            const preview = DiffEngine.applySearchReplace(snap.originalContent, p.edits);
            if (preview.success) {
              dryRunDiff += DiffEngine.createUnifiedDiff(p.filePath, snap.originalContent, preview.content);
            }
          }
        }
      }

      return {
        status: 'DRY_RUN',
        refactorGoal: input.refactorGoal,
        appliedFiles: input.targetFiles,
        diffSummary: dryRunDiff.trim(),
        rollbackOccurred: false,
        yagniResult,
        durationMs: Date.now() - startTime,
        message: 'Dry-run preview completed successfully (zero disk mutations).',
      };
    }

    // Apply atomic multi-file patch
    const patchResult = DiffEngine.applyMultiFileAtomic(input.patches, root);
    if (!patchResult.success) {
      triggerRollback('Patch application failed in-memory validation');
      cleanupBackup();
      return {
        status: 'ROLLED_BACK',
        refactorGoal: input.refactorGoal,
        appliedFiles: [],
        diffSummary: '',
        rollbackOccurred: true,
        rollbackReason: `Patch Application Failed: ${patchResult.errors.join('; ')}`,
        yagniResult,
        durationMs: Date.now() - startTime,
        message: `Patch application aborted: ${patchResult.errors.join('; ')}`,
      };
    }

    // Generate diff summary of applied changes
    let diffSummary = '';
    for (const snap of snapshots) {
      const newContent = fs.readFileSync(snap.filePath, 'utf-8');
      const rel = path.relative(root, snap.filePath);
      const diff = DiffEngine.createUnifiedDiff(rel, snap.originalContent, newContent);
      if (diff) diffSummary += diff + '\n';
    }

    // ========================================================
    // Step 4: CodeReviewAuditor Pre-Flight Quality Gate
    // ========================================================
    const auditResults: CodeReviewResult[] = [];
    for (const applied of patchResult.appliedFiles) {
      const review = await this.reviewAuditor.auditFile(applied);
      auditResults.push(review);

      // If critical security violation (secret leak, eval) or fail score
      if (review.verdict === 'FAIL' || review.violations.some((v) => v.severity === 'CRITICAL')) {
        const failReasons = review.violations
          .filter((v) => v.severity === 'CRITICAL' || v.severity === 'HIGH')
          .map((v) => `[${v.rule}] ${v.message}`)
          .join('; ');

        triggerRollback(`Security/Quality gate failed: ${failReasons}`);
        cleanupBackup();

        return {
          status: 'ROLLED_BACK',
          refactorGoal: input.refactorGoal,
          appliedFiles: patchResult.appliedFiles,
          diffSummary: diffSummary.trim(),
          rollbackOccurred: true,
          rollbackReason: `Automatic Rollback Triggered: Code Review failed with score ${review.score}/100. Violations: ${failReasons}`,
          yagniResult,
          auditResults,
          durationMs: Date.now() - startTime,
          message: `Refactor rolled back due to security/quality failure: ${failReasons}`,
        };
      }
    }

    // ========================================================
    // Step 5: Automated Test Execution Loop
    // ========================================================
    const testCmd = input.testCommand || this.resolveTargetTestCommand(input.targetFiles);
    let testSummary: TestExecutionSummary;

    try {
      const tStart = Date.now();
      let res: { exitCode: number; stdout: string; stderr: string };

      if (this.customTestRunner) {
        res = await this.customTestRunner(testCmd);
      } else {
        res = await this.runTestCommand(testCmd, root);
      }

      testSummary = {
        exitCode: res.exitCode,
        stdout: res.stdout,
        stderr: res.stderr,
        durationMs: Date.now() - tStart,
      };
    } catch (testErr: any) {
      testSummary = {
        exitCode: 1,
        stdout: '',
        stderr: testErr.message || String(testErr),
        durationMs: 0,
      };
    }

    // ========================================================
    // Step 6: Rollback vs. Commit Decision
    // ========================================================
    if (testSummary.exitCode !== 0) {
      // Test regression or failure: TRIGGER IMMEDIATE AUTOMATIC ROLLBACK
      triggerRollback(`Test regression detected (exit code: ${testSummary.exitCode})`);
      cleanupBackup();

      const errorSnippet = (testSummary.stderr || testSummary.stdout).slice(-300).trim();

      return {
        status: 'ROLLED_BACK',
        refactorGoal: input.refactorGoal,
        appliedFiles: patchResult.appliedFiles,
        diffSummary: diffSummary.trim(),
        rollbackOccurred: true,
        rollbackReason: `Automated test verification failed (Exit code: ${testSummary.exitCode}). Restored original code from snapshot. Snippet: ${errorSnippet}`,
        yagniResult,
        auditResults,
        testSummary,
        durationMs: Date.now() - startTime,
        message: `Self-healing refactor failed tests and was automatically rolled back cleanly.`,
      };
    }

    // Success: Tests passed, quality verified, commit refactor
    cleanupBackup();
    return {
      status: 'SUCCESS',
      refactorGoal: input.refactorGoal,
      appliedFiles: patchResult.appliedFiles,
      diffSummary: diffSummary.trim(),
      rollbackOccurred: false,
      yagniResult,
      auditResults,
      testSummary,
      durationMs: Date.now() - startTime,
      message: `Refactor verified and committed: ${patchResult.appliedFiles.length} file(s) modified, all tests passing.`,
    };
  }

  /**
   * Resolves appropriate test command targeting the modified files
   */
  private resolveTargetTestCommand(targetFiles: string[]): string {
    const testFiles = targetFiles.filter((f) => /\.(?:test|spec)\.[a-zA-Z0-9]+$/.test(f));
    if (testFiles.length > 0) {
      return `npx vitest run ${testFiles.join(' ')}`;
    }
    return 'npx vitest run';
  }

  /**
   * Runs test command with flatpak-spawn support if running inside container
   */
  private async runTestCommand(cmd: string, cwd: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const isSandboxed = !process.env.PATH?.includes('/usr/bin/node') && fs.existsSync('/usr/bin/flatpak-spawn');
    const finalCmd = isSandboxed
      ? `flatpak-spawn --host bash -c "cd ${cwd} && ${cmd}"`
      : cmd;

    try {
      const { stdout, stderr } = await execAsync(finalCmd, { cwd });
      return { exitCode: 0, stdout, stderr };
    } catch (err: any) {
      return {
        exitCode: err.code || 1,
        stdout: err.stdout || '',
        stderr: err.stderr || err.message || '',
      };
    }
  }
}
