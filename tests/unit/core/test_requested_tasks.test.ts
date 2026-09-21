import { describe, it, expect } from 'vitest';
import { PromptEnhancer } from '../../../core/planner/PromptEnhancer.js';
import { AgentBrain } from '../../../core/planner/AgentBrain.js';
import { ToolRouter } from '../../../core/tools/ToolRouter.js';
import { ToolRegistry } from '../../../core/tools/ToolRegistry.js';
import { WhatsAppCallTool } from '../../../tools/messaging/WhatsAppTool.js';
import { BrowserOpenTool } from '../../../tools/browser/BrowserTool.js';
import { ClaudeReviewTool } from '../../../tools/claude/ClaudeCodeTool.js';
import { VoiceSystem } from '../../../voice/VoiceSystem.js';
import { MemoryStore } from '../../../core/memory/MemoryStore.js';
import { PolicyEngine } from '../../../security/policy/PolicyEngine.js';
import { AuditLogger } from '../../../security/audit/AuditLogger.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('User Requested Task Scenarios', () => {
  const enhancer = new PromptEnhancer();

  const registry = new ToolRegistry();
  let capturedRecipient = '';
  let capturedBrowserUrl = '';
  let capturedReviewPath = '';

  registry.register(
    new WhatsAppCallTool({
      runner: async (recipient) => {
        capturedRecipient = recipient;
        return true;
      },
    })
  );

  registry.register(
    new BrowserOpenTool({
      runner: async (url) => {
        capturedBrowserUrl = url;
        return true;
      },
    })
  );

  registry.register(
    new ClaudeReviewTool({
      runner: async (projectPath) => {
        capturedReviewPath = projectPath;
        return 'Codebase Architecture & Security Review: All 26 modules passed audit. No critical vulnerabilities found. 100% test pass rate.';
      },
    })
  );

  const auditLogger = new AuditLogger();
  const policyEngine = new PolicyEngine();
  const router = new ToolRouter({ registry, policyEngine, auditLogger });
  const spokenList: string[] = [];
  const voice = new VoiceSystem({ enabled: false });
  voice.speak = async (text: string) => {
    spokenList.push(text);
    return true;
  };

  const testMemoryFile = path.join(process.cwd(), '.eva', 'test_tasks_memory.json');
  if (fs.existsSync(testMemoryFile)) fs.unlinkSync(testMemoryFile);
  const memory = new MemoryStore({ filePath: testMemoryFile });

  const brain = new AgentBrain({ router, voice, memory, policyEngine });

  it('Task 1: Calling someone on WhatsApp ("calling somone on whatsapp")', async () => {
    const goal = 'calling somone on whatsapp';
    const enhanced = enhancer.enhance(goal);
    expect(enhanced.intentCategory).toBe('CALL');
    expect(enhanced.enhancedPrompt).toContain('Start a WhatsApp voice call with Somone');

    const result = await brain.executeGoal({
      goal,
      sessionId: 'test-session',
      deviceId: 'test-device',
      speakResponse: true,
    });

    expect(result.success).toBe(true);
    expect(result.plan).toHaveLength(1);
    expect(result.plan[0].toolName).toBe('whatsapp.call');
    expect(result.plan[0].parameters).toEqual({ recipient: 'Somone' });
    expect(capturedRecipient).toBe('Somone');
    expect(result.responseSpeech).toContain('Voice call initiated to Somone on WhatsApp.');
    expect(spokenList).toContain('Voice call initiated to Somone on WhatsApp.');
  });

  it('Task 2: Playing Tu Mileya on YouTube ("playing tu mileya on youtube")', async () => {
    const goal = 'playing tu mileya on youtube';
    const enhanced = enhancer.enhance(goal);
    expect(enhanced.intentCategory).toBe('BROWSER');
    expect(enhanced.enhancedPrompt).toBe('Open YouTube and play "tu mileya".');

    const result = await brain.executeGoal({
      goal,
      sessionId: 'test-session',
      deviceId: 'test-device',
      speakResponse: true,
    });

    expect(result.success).toBe(true);
    expect(result.plan).toHaveLength(1);
    expect(result.plan[0].toolName).toBe('browser.open');
    expect(result.plan[0].parameters.url).toBe('https://www.youtube.com/results?search_query=tu%20mileya');
    expect(capturedBrowserUrl).toBe('https://www.youtube.com/results?search_query=tu%20mileya');
    expect(result.responseSpeech).toContain('Opened in your browser.');
  });

  it('Task 3: Opening Claude and asking to review the code ("ipening claude and asking to review the code")', async () => {
    const goal = 'ipening claude and asking to review the code';
    const enhanced = enhancer.enhance(goal);
    expect(enhanced.intentCategory).toBe('DEVELOPER');
    expect(enhanced.enhancedPrompt).toBe('Perform an automated architectural code review with Claude Code.');

    const result = await brain.executeGoal({
      goal,
      sessionId: 'test-session',
      deviceId: 'test-device',
      speakResponse: true,
    });

    expect(result.success).toBe(true);
    expect(result.plan).toHaveLength(1);
    expect(result.plan[0].toolName).toBe('claude.review_project');
    expect(result.responseSpeech).toBe('Claude Code completed the codebase review.');
    expect(result.responseText).toContain('Codebase Architecture & Security Review: All 26 modules passed audit.');
  });

  it('Task 4: Inquiring about Claude Code response with voice output ("let me know about the response in voice output")', async () => {
    const query = 'let me know about the response in voice output';
    expect(brain.isDialogueQuery(query)).toBe(true);

    const result = await brain.executeGoal({
      goal: query,
      sessionId: 'test-session',
      deviceId: 'test-device',
      speakResponse: true,
    });

    expect(result.success).toBe(true);
    expect(result.plan).toHaveLength(0); // Dialogue query does not trigger tools
    expect(result.responseSpeech).toContain('Claude Code reported: Codebase Architecture & Security Review: All 26 modules passed audit.');
    expect(result.responseText).toContain('Codebase Architecture & Security Review');
  });

  it('Task 4 variant: Inquiring with "what was the response of Claude code after reviewing the project"', async () => {
    const query = 'What was the response of Claude code after reviewing the project';
    expect(brain.isDialogueQuery(query)).toBe(true);

    const result = await brain.executeGoal({
      goal: query,
      sessionId: 'test-session',
      deviceId: 'test-device',
      speakResponse: true,
    });

    expect(result.success).toBe(true);
    expect(result.responseSpeech).toContain('Claude Code reported: Codebase Architecture & Security Review: All 26 modules passed audit.');
  });
});
