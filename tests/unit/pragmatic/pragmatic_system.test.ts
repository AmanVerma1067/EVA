import { describe, it, expect, beforeEach } from 'vitest';
import { YagniDecisionLadder } from '../../../core/pragmatic/YagniDecisionLadder.js';
import { CodeReviewAuditor } from '../../../core/pragmatic/CodeReviewAuditor.js';
import { PragmaticYagniTool, CodeReviewTool } from '../../../tools/developer/PragmaticTools.js';
import { ExecutionContext } from '../../../core/tools/ToolContract.js';
import { AgentBrain } from '../../../core/planner/AgentBrain.js';
import { ToolRouter } from '../../../core/tools/ToolRouter.js';
import { ToolRegistry } from '../../../core/tools/ToolRegistry.js';
import { PolicyEngine } from '../../../security/policy/PolicyEngine.js';
import { AuditLogger } from '../../../security/audit/AuditLogger.js';
import { VoiceSystem } from '../../../voice/VoiceSystem.js';

describe('Phase 19: Ponytail Pragmatic AI Coding Framework', () => {
  const dummyContext: ExecutionContext = {
    sessionId: 'test-session',
    deviceId: 'test-device',
    workspaceRoot: process.cwd(),
  };

  describe('YagniDecisionLadder: 7-Step Decision Evaluation', () => {
    let ladder: YagniDecisionLadder;

    beforeEach(() => {
      ladder = new YagniDecisionLadder({ mode: 'full', persist: false });
    });

    it('Step 1 (Necessity): should reject speculative / future-proof requirements', () => {
      const res = ladder.evaluate({
        taskDescription: 'Build a generic plugin system just in case we might need later integrations',
      });
      expect(res.decision).toBe('REJECT');
      expect(res.step).toBe(1);
      expect(res.stepName).toBe('NECESSITY');
      expect(res.approved).toBe(false);
      expect(res.locBudget).toBe(0);
      expect(res.remediation).toBeDefined();
    });

    it('Step 2 (Codebase Reuse): should suggest reusing existing logger or context tools', () => {
      const res = ladder.evaluate({
        taskDescription: 'Add a new custom logging utility for writing logs',
      });
      expect(res.decision).toBe('REUSE');
      expect(res.step).toBe(2);
      expect(res.stepName).toBe('CODEBASE_REUSE');
      expect(res.approved).toBe(true);
      expect(res.suggestedApproach).toContain('core/logger/Logger.ts');
    });

    it('Step 3 (Standard Library): should suggest node:crypto for hashing and UUID generation', () => {
      const res = ladder.evaluate({
        taskDescription: 'Generate a secure SHA256 hash and UUID identifier',
      });
      expect(res.decision).toBe('STDLIB');
      expect(res.step).toBe(3);
      expect(res.stepName).toBe('STANDARD_LIBRARY');
      expect(res.approved).toBe(true);
      expect(res.suggestedApproach).toContain('node:crypto');
    });

    it('Step 3 (Standard Library): should suggest node:fs for file system manipulation', () => {
      const res = ladder.evaluate({
        taskDescription: 'Read file and create directory on the file system',
      });
      expect(res.decision).toBe('STDLIB');
      expect(res.step).toBe(3);
      expect(res.suggestedApproach).toContain('node:fs');
    });

    it('Step 4 (Native Platform): should suggest native platform commands for git and battery', () => {
      const res = ladder.evaluate({
        taskDescription: 'Check git status and commit history',
      });
      expect(res.decision).toBe('PLATFORM');
      expect(res.step).toBe(4);
      expect(res.stepName).toBe('NATIVE_PLATFORM');
      expect(res.approved).toBe(true);
      expect(res.suggestedApproach).toContain('git');
    });

    it('Step 5 (Installed Dependencies): should approve existing package or block new packages in FULL mode', () => {
      // zod is installed in package.json
      const installedRes = ladder.evaluate({
        taskDescription: 'Validate structured user input schema',
        proposedDependency: 'zod',
      });
      expect(installedRes.decision).toBe('DEPENDENCY');
      expect(installedRes.step).toBe(5);
      expect(installedRes.approved).toBe(true);

      // axios is not in package.json
      const newPkgRes = ladder.evaluate({
        taskDescription: 'Make http requests to an external API',
        proposedDependency: 'axios',
      });
      expect(newPkgRes.decision).toBe('REJECT');
      expect(newPkgRes.step).toBe(5);
      expect(newPkgRes.approved).toBe(false);
      expect(newPkgRes.suggestedApproach).toContain('fetch');
    });

    it('Step 6 (Minimal Complexity): should recommend one-liner for simple string transformations', () => {
      const res = ladder.evaluate({
        taskDescription: 'Capitalize string and trim leading whitespace',
        estimatedLinesOfCode: 5,
      });
      expect(res.decision).toBe('ONE_LINER');
      expect(res.step).toBe(6);
      expect(res.stepName).toBe('MINIMAL_COMPLEXITY');
      expect(res.approved).toBe(true);
      expect(res.locBudget).toBeLessThanOrEqual(15);
    });

    it('Step 7 (Minimal Implementation): should allocate strict LOC budget when all steps pass', () => {
      const res = ladder.evaluate({
        taskDescription: 'Implement custom priority queue for task execution',
        estimatedLinesOfCode: 60,
      });
      expect(res.decision).toBe('MINIMAL_CODE');
      expect(res.step).toBe(7);
      expect(res.stepName).toBe('MINIMAL_IMPLEMENTATION');
      expect(res.approved).toBe(true);
      expect(res.locBudget).toBe(60);
    });

    it('Anti-Over-Engineering Modes: should adapt budgets and behavior across modes', () => {
      // ULTRA mode
      ladder.setMode('ultra');
      expect(ladder.getMode()).toBe('ultra');
      const ultraRes = ladder.evaluate({
        taskDescription: 'Implement custom priority queue for task execution',
        estimatedLinesOfCode: 60,
      });
      expect(ultraRes.locBudget).toBe(30); // 50% of 60

      // OFF mode
      ladder.setMode('off');
      expect(ladder.getMode()).toBe('off');
      const offRes = ladder.evaluate({
        taskDescription: 'Build a generic plugin system just in case we might need later integrations',
      });
      expect(offRes.approved).toBe(true); // guardrail bypassed
    });
  });

  describe('CodeReviewAuditor: Automated Quality Gates & Security Rules', () => {
    let auditor: CodeReviewAuditor;

    beforeEach(() => {
      auditor = new CodeReviewAuditor();
    });

    it('should score clean senior-grade code with 100/100 and PASS verdict', () => {
      const cleanCode = `
export interface UserProfile {
  id: string;
  name: string;
}

export function formatProfile(profile: UserProfile): string {
  if (!profile.name) {
    return 'Anonymous';
  }
  return \`User: \${profile.name} (\${profile.id})\`;
}
`;
      const res = auditor.auditCode(cleanCode, 'UserProfile.ts');
      expect(res.score).toBe(100);
      expect(res.verdict).toBe('PASS');
      expect(res.violationsCount).toBe(0);
      expect(res.summary).toContain('✓ PASS');
    });

    it('should detect unused imports and deduct quality score', () => {
      const codeWithUnused = `
import { unusedHelper } from './helper.js';

export function add(a: number, b: number): number {
  return a + b;
}
`;
      const res = auditor.auditCode(codeWithUnused, 'Math.ts');
      expect(res.violations.some((v) => v.rule === 'NO_UNUSED_IMPORTS')).toBe(true);
      expect(res.score).toBe(97);
    });

    it('should catch hardcoded OpenAI and Anthropic API keys (CRITICAL)', () => {
      const leakingCode = `
const apiKey = "sk-proj-abc1234567890abcdef1234567890abcdef";
const anthropicKey = "sk-ant-api03-abcdef1234567890abcdef";

export function getClient() {
  return { key: apiKey, ant: anthropicKey };
}
`;
      const res = auditor.auditCode(leakingCode, 'Client.ts');
      expect(res.score).toBeLessThanOrEqual(20);
      expect(res.verdict).toBe('FAIL');
      expect(res.violations.some((v) => v.rule === 'NO_HARDCODED_SECRETS')).toBe(true);
      expect(res.metrics.secretLeaksFound).toBeGreaterThanOrEqual(1);
    });

    it('should detect hollow mock tests in test suites (HIGH)', () => {
      const hollowTest = `
import { describe, it, expect } from 'vitest';

describe('hollow suite', () => {
  it('does nothing useful', () => {
    expect(true).toBe(true);
  });
});
`;
      const res = auditor.auditCode(hollowTest, 'dummy.test.ts');
      expect(res.verdict).not.toBe('PASS');
      expect(res.violations.some((v) => v.rule === 'NO_HOLLOW_TESTS')).toBe(true);
    });

    it('should flag deep nesting and dynamic eval execution', () => {
      const complexCode = `
export function compute(val: number) {
  if (val > 0) {
    if (val > 10) {
      if (val > 20) {
        if (val > 30) {
          if (val > 40) {
            if (val > 50) {
              if (val > 60) {
                return eval("val * 2");
              }
            }
          }
        }
      }
    }
  }
  return 0;
}
`;
      const res = auditor.auditCode(complexCode, 'Compute.ts');
      expect(res.violations.some((v) => v.rule === 'MAX_NESTING_DEPTH')).toBe(true);
      expect(res.violations.some((v) => v.rule === 'NO_EVAL')).toBe(true);
      expect(res.verdict).toBe('FAIL');
    });

    it('should audit unified git diff patches', () => {
      const diff = `
--- a/src/index.ts
+++ b/src/index.ts
@@ -10,3 +10,4 @@
+const testKey = "sk-ant-12345678901234567890";
`;
      const res = auditor.auditDiff(diff);
      expect(res.violations.some((v) => v.rule === 'NO_HARDCODED_SECRETS')).toBe(true);
      expect(res.verdict).toBe('FAIL');
    });
  });

  describe('Pragmatic Developer Tools Dispatch', () => {
    it('pragmatic.yagni_eval tool should execute and verify correctly', async () => {
      const tool = new PragmaticYagniTool();
      const res = await tool.execute(
        {
          taskDescription: 'Add SHA256 checksum calculation for backup archives',
        },
        dummyContext
      );

      expect(res.success).toBe(true);
      expect(res.data?.decision).toBe('STDLIB');
      expect(res.data?.stepName).toBe('STANDARD_LIBRARY');

      const verification = await tool.verify({ taskDescription: '...' }, res);
      expect(verification.verified).toBe(true);
    });

    it('code.review tool should execute and verify correctly', async () => {
      const tool = new CodeReviewTool();
      const res = await tool.execute(
        {
          code: 'export const hello = (name: string): string => `Hello, ${name}`;',
          path: 'hello.ts',
        },
        dummyContext
      );

      expect(res.success).toBe(true);
      expect(res.data?.score).toBe(100);
      expect(res.data?.verdict).toBe('PASS');

      const verification = await tool.verify({}, res);
      expect(verification.verified).toBe(true);
    });
  });

  describe('AgentBrain YAGNI & Code Review Goal Routing', () => {
    const registry = new ToolRegistry();
    registry.register(new PragmaticYagniTool());
    registry.register(new CodeReviewTool());
    const router = new ToolRouter({ registry, policyEngine: new PolicyEngine(), auditLogger: new AuditLogger() });
    const brain = new AgentBrain({ router, voice: new VoiceSystem({ enabled: false }) });

    it('should parse natural language YAGNI check goal', () => {
      const plan = brain.parseGoalToPlan('check yagni for generic database driver abstraction');
      expect(plan.length).toBe(1);
      expect(plan[0].toolName).toBe('pragmatic.yagni_eval');
      expect(plan[0].parameters.taskDescription).toContain('generic database driver abstraction');
    });

    it('should parse natural language code review goal', () => {
      const plan = brain.parseGoalToPlan('review code in core/logger/Logger.ts');
      expect(plan.length).toBe(1);
      expect(plan[0].toolName).toBe('code.review');
      expect(plan[0].parameters.path).toBe('core/logger/Logger.ts');
    });

    it('should execute natural language YAGNI check end-to-end', async () => {
      const res = await brain.executeGoal({
        goal: 'check yagni for generic database driver abstraction just in case',
        sessionId: 'sess-yagni',
        deviceId: 'dev-yagni',
        speakResponse: false,
      });

      expect(res.success).toBe(true);
      expect(res.responseText).toContain('YAGNI Decision');
      expect(res.responseText).toContain('REJECT');
    });
  });
});
