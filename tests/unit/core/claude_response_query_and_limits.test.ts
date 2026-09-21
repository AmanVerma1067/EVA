import { describe, it, expect, beforeEach } from 'vitest';
import * as path from 'node:path';
import { PromptEnhancer, mentionsVSCode } from '../../../core/planner/PromptEnhancer.js';
import { AgentBrain } from '../../../core/planner/AgentBrain.js';
import { ToolRouter } from '../../../core/tools/ToolRouter.js';
import { ToolRegistry } from '../../../core/tools/ToolRegistry.js';
import { MemoryStore } from '../../../core/memory/MemoryStore.js';
import { PolicyEngine } from '../../../security/policy/PolicyEngine.js';
import { AuditLogger } from '../../../security/audit/AuditLogger.js';
import { ClaudeReviewTool, ClaudeTaskTool } from '../../../tools/claude/ClaudeCodeTool.js';
import { ExecutionContext } from '../../../core/tools/ToolContract.js';

describe('Claude Code Response Inquiries, Memory Tracking & Limit Detection', () => {
  const enhancer = new PromptEnhancer();
  const testMemoryFile = path.resolve(process.cwd(), '.eva/test_claude_memory.json');
  let memory: MemoryStore;
  let registry: ToolRegistry;
  let router: ToolRouter;
  let brain: AgentBrain;

  const dummyCtx: ExecutionContext = {
    taskId: 'test-claude-task',
    sessionId: 'test-sess',
    deviceId: 'test-dev',
    workspaceRoot: process.cwd(),
    abortSignal: new AbortController().signal,
  };

  beforeEach(() => {
    memory = new MemoryStore({ filePath: testMemoryFile });
    memory.reset();
    registry = new ToolRegistry();
    router = new ToolRouter({
      registry,
      policyEngine: new PolicyEngine(),
      auditLogger: new AuditLogger({ logFilePath: path.resolve(process.cwd(), '.eva/test_audit.json') }),
    });
    brain = new AgentBrain({ router, promptEnhancer: enhancer, memory });
  });

  describe('Disambiguation: Claude Code vs VS Code', () => {
    it('should NOT treat "Claude code" as Visual Studio Code', () => {
      expect(mentionsVSCode('What was the response of Claude code after reviewing the project')).toBe(false);
      expect(mentionsVSCode('What did Claude code say')).toBe(false);
      expect(mentionsVSCode('Tell claude to fix the tests')).toBe(false);
    });

    it('should correctly identify Visual Studio Code when explicitly requested', () => {
      expect(mentionsVSCode('Open Vareeka in vs code')).toBe(true);
      expect(mentionsVSCode('Open project in code')).toBe(true);
      expect(mentionsVSCode('Open Vareeka in vscode and review with claude')).toBe(true);
      expect(mentionsVSCode('Open project in Visual Studio Code')).toBe(true);
    });
  });

  describe('Prompt Enhancement for Questions vs Commands', () => {
    it('should enhance Claude response questions as inquiries, NOT commands to open VS Code', () => {
      const enhanced = enhancer.enhance('What was the response of Claude code after reviewing the project');
      expect(enhanced.intentCategory).toBe('GENERAL');
      expect(enhanced.enhancedPrompt).toContain('What was the response of Claude code after reviewing the project');
      expect(enhanced.enhancedPrompt).not.toContain('Open project in Visual Studio Code');
    });

    it('should enhance "what did claude say" as an inquiry', () => {
      const enhanced = enhancer.enhance('what did claude say');
      expect(enhanced.intentCategory).toBe('GENERAL');
      expect(enhanced.enhancedPrompt).toContain('what did claude say?');
    });
  });

  describe('Claude Code Tool Limit Detection', () => {
    it('should detect weekly limit in ClaudeReviewTool and mark completed: false', async () => {
      const limitMessage = "You've hit your weekly limit · resets Sep 13 at 9:30pm (Asia/Calcutta)";
      const tool = new ClaudeReviewTool({
        runner: async () => limitMessage,
      });

      const res = await tool.execute({}, dummyCtx);
      expect(res.success).toBe(true);
      expect(res.data?.completed).toBe(false);
      expect(res.data?.reviewSummary).toBe(limitMessage);

      const verify = await tool.verify({}, res);
      expect(verify.verified).toBe(false);
      expect(verify.status).toBe('FAILED');
      expect(verify.evidence).toContain('Claude Code hit usage limit.');
    });

    it('should detect weekly limit in ClaudeTaskTool and mark completed: false', async () => {
      const limitMessage = "You've hit your weekly limit · resets Sep 13 at 9:30pm (Asia/Calcutta)";
      const tool = new ClaudeTaskTool({
        runner: async () => limitMessage,
      });

      const res = await tool.execute({ taskPrompt: 'Fix tests' }, dummyCtx);
      expect(res.success).toBe(true);
      expect(res.data?.completed).toBe(false);
      expect(res.data?.resultText).toBe(limitMessage);

      const verify = await tool.verify({ taskPrompt: 'Fix tests' }, res);
      expect(verify.verified).toBe(false);
      expect(verify.status).toBe('FAILED');
      expect(verify.evidence).toContain('Claude Code hit usage limit.');
    });
  });

  describe('AgentBrain Memory Context & Dialogue Question Answering', () => {
    it('should accurately report limit message when asked about Claude response after review', async () => {
      const limitMessage = "You've hit your weekly limit · resets Sep 13 at 9:30pm (Asia/Calcutta)";
      registry.register(
        new ClaudeReviewTool({
          runner: async () => limitMessage,
        })
      );

      // Step 1: Run Claude review (which hits weekly limit)
      const reviewGoal = await brain.executeGoal({
        goal: 'review project with claude',
        sessionId: 'sess-1',
        deviceId: 'dev-1',
        speakResponse: false,
      });

      expect(reviewGoal.responseSpeech).toContain('Claude Code reported you have hit your weekly limit.');
      expect(reviewGoal.responseText).toContain('weekly limit');

      // Step 2: User asks "What was the response of Claude code after reviewing the project"
      const questionGoal = await brain.executeGoal({
        goal: 'What was the response of Claude code after reviewing the project',
        sessionId: 'sess-1',
        deviceId: 'dev-1',
        speakResponse: false,
      });

      expect(questionGoal.success).toBe(true);
      expect(questionGoal.plan).toHaveLength(0); // Dialogue query does NOT trigger tool actions
      expect(questionGoal.responseSpeech).toContain('Claude Code reported that you have hit your weekly usage limit.');
      expect(questionGoal.responseText).toContain("You've hit your weekly limit");
      expect(questionGoal.responseText).toContain('Sep 13 at 9:30pm');
    });

    it('should answer "What did claude say" after a successful code review', async () => {
      const reviewOutput = 'Architecture: Solid TypeScript. Security: Strict policy engine active.';
      registry.register(
        new ClaudeReviewTool({
          runner: async () => reviewOutput,
        })
      );

      // Step 1: Run review
      await brain.executeGoal({
        goal: 'review project with claude',
        sessionId: 'sess-2',
        deviceId: 'dev-2',
        speakResponse: false,
      });

      // Step 2: User asks "What did Claude code say?"
      const questionGoal = await brain.executeGoal({
        goal: 'What did Claude code say?',
        sessionId: 'sess-2',
        deviceId: 'dev-2',
        speakResponse: false,
      });

      expect(questionGoal.success).toBe(true);
      expect(questionGoal.responseText).toContain('Architecture: Solid TypeScript');
      expect(questionGoal.responseSpeech).toContain('Claude Code reported: Architecture: Solid TypeScript.');
    });

    it('should inform user if Claude Code has not executed yet', async () => {
      const questionGoal = await brain.executeGoal({
        goal: 'What was the response of Claude code after reviewing the project',
        sessionId: 'sess-3',
        deviceId: 'dev-3',
        speakResponse: false,
      });

      expect(questionGoal.success).toBe(true);
      expect(questionGoal.responseText).toContain('has not performed any reviews or tasks');
    });

    it('should NOT leak unrelated tool output when asked about Claude Code response', async () => {
      // Step 1: Simulate an unrelated command having run previously
      await brain.executeGoal({
        goal: 'how is my mac doing',
        sessionId: 'sess-leak-check',
        deviceId: 'dev-leak-check',
        speakResponse: false,
      });

      // Step 2: User asks about Claude Code response
      const questionGoal = await brain.executeGoal({
        goal: 'What was the response of Claude code after reviewing the project',
        sessionId: 'sess-leak-check',
        deviceId: 'dev-leak-check',
        speakResponse: false,
      });

      expect(questionGoal.success).toBe(true);
      expect(questionGoal.responseText).toContain('Claude Code has not performed any reviews or tasks');
      expect(questionGoal.responseSpeech).toContain('Claude Code has not performed any reviews or tasks');
      expect(questionGoal.responseText).not.toContain('Battery');
      expect(questionGoal.responseSpeech).not.toContain('Battery');
    });
  });
});

