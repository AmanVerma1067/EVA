import { describe, it, expect, beforeEach } from 'vitest';
import * as path from 'node:path';
import { PromptEnhancer } from '../../../core/planner/PromptEnhancer.js';
import { AgentBrain } from '../../../core/planner/AgentBrain.js';
import { ToolRouter } from '../../../core/tools/ToolRouter.js';
import { ToolRegistry } from '../../../core/tools/ToolRegistry.js';
import { MemoryStore } from '../../../core/memory/MemoryStore.js';
import { PolicyEngine } from '../../../security/policy/PolicyEngine.js';
import { AuditLogger } from '../../../security/audit/AuditLogger.js';

describe('Chatbot Conversational Dialogue, Greetings & Action Planning', () => {
  const enhancer = new PromptEnhancer();
  const testMemoryFile = path.resolve(process.cwd(), '.eva/test_chatbot_memory.json');
  let memory: MemoryStore;
  let registry: ToolRegistry;
  let router: ToolRouter;
  let brain: AgentBrain;

  beforeEach(() => {
    memory = new MemoryStore({ filePath: testMemoryFile });
    memory.reset();
    registry = new ToolRegistry();
    router = new ToolRouter({
      registry,
      policyEngine: new PolicyEngine(),
      auditLogger: new AuditLogger({ logFilePath: path.resolve(process.cwd(), '.eva/test_chatbot_audit.json') }),
    });
    brain = new AgentBrain({ router, promptEnhancer: enhancer, memory });
  });

  describe('Social Greetings & Conversational Chit-Chat', () => {
    it('should respond warmly to "hi" without unmapped error', async () => {
      const res = await brain.executeGoal({
        goal: 'hi',
        sessionId: 'sess-test',
        deviceId: 'dev-test',
        speakResponse: false,
      });

      expect(res.success).toBe(true);
      expect(res.responseText).toContain('Hello');
      expect(res.responseText).toContain('EVA');
      expect(res.responseSpeech).toContain('Hello');
      expect(res.plan).toHaveLength(0);
    });

    it('should respond to "hello eva" naturally', async () => {
      const res = await brain.executeGoal({
        goal: 'hello eva',
        sessionId: 'sess-test',
        deviceId: 'dev-test',
        speakResponse: false,
      });

      expect(res.success).toBe(true);
      expect(res.responseText).toContain('Hello');
      expect(res.responseSpeech).toContain('EVA');
    });

    it('should respond to "who are you" with capabilities and identity', async () => {
      const res = await brain.executeGoal({
        goal: 'who are you',
        sessionId: 'sess-test',
        deviceId: 'dev-test',
        speakResponse: false,
      });

      expect(res.success).toBe(true);
      expect(res.responseText).toContain('Private AI Operating Layer');
      expect(res.responseText).toContain('Desktop Projects');
      expect(res.responseText).toContain('Claude Code');
      expect(res.responseSpeech).toContain('EVA');
    });

    it('should respond to "how are you" with ready status', async () => {
      const res = await brain.executeGoal({
        goal: 'how are you',
        sessionId: 'sess-test',
        deviceId: 'dev-test',
        speakResponse: false,
      });

      expect(res.success).toBe(true);
      expect(res.responseText).toContain('running smoothly');
      expect(res.responseSpeech).toContain('running smoothly');
    });

    it('should respond politely to "thank you"', async () => {
      const res = await brain.executeGoal({
        goal: 'thank you',
        sessionId: 'sess-test',
        deviceId: 'dev-test',
        speakResponse: false,
      });

      expect(res.success).toBe(true);
      expect(res.responseText).toContain('welcome');
      expect(res.responseSpeech).toContain('welcome');
    });
  });

  describe('Project Discovery & Environment Inquiries', () => {
    it('should answer "what projects do I have" by detecting desktop projects', async () => {
      const res = await brain.executeGoal({
        goal: 'what projects do I have',
        sessionId: 'sess-test',
        deviceId: 'dev-test',
        speakResponse: false,
      });

      expect(res.success).toBe(true);
      expect(res.responseText).toContain('Desktop Projects');
      expect(res.responseSpeech).toContain('Desktop');
    });
  });

  describe('Action Planning vs Chatbot Disambiguation', () => {
    it('should plan concrete actions when an action is requested', async () => {
      const res = await brain.executeGoal({
        goal: 'open D2S in vs code',
        sessionId: 'sess-test',
        deviceId: 'dev-test',
        speakResponse: false,
      });

      expect(res.plan).toHaveLength(1);
      expect(res.plan[0].toolName).toBe('vscode.open');
      expect(res.plan[0].parameters.path).toBe('D2S');
    });
  });
});

