import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStore } from '../../../core/memory/MemoryStore.js';
import * as path from 'node:path';

describe('Phase 8 — Structured Memory & Context Engine', () => {
  let memory: MemoryStore;
  const testFile = path.resolve(process.cwd(), '.eva/test_memory.json');

  beforeEach(() => {
    memory = new MemoryStore({ filePath: testFile });
    memory.reset();
  });

  it('should save and recall project memory', () => {
    memory.saveProject({
      id: 'eva-core',
      name: 'EVA Agent',
      path: '/Users/aman/Desktop/EVA',
      techStack: ['TypeScript', 'Node.js', 'Vitest'],
      notes: 'Main agent codebase',
    });

    const recalled = memory.getProject('EVA Agent');
    expect(recalled).toBeDefined();
    expect(recalled?.path).toBe('/Users/aman/Desktop/EVA');
    expect(recalled?.techStack).toContain('TypeScript');
  });

  it('should store and retrieve user preferences', () => {
    memory.setPreference('preferredEditor', 'code');
    memory.setPreference('voiceSpeed', 1.15);

    expect(memory.getPreference('preferredEditor')).toBe('code');
    expect(memory.getPreference('voiceSpeed')).toBe(1.15);
    expect(memory.getPreference('nonExistent', 'default')).toBe('default');
  });

  it('should track conversation context for anaphora resolution', () => {
    memory.updateContext({
      lastRecipient: 'Shivam',
      lastApp: 'WhatsApp',
      lastGoal: 'call shivam on whatsapp',
    });

    const ctx = memory.getContext();
    expect(ctx.lastRecipient).toBe('Shivam');
    expect(ctx.lastApp).toBe('WhatsApp');

    memory.clearContext();
    expect(memory.getContext().lastRecipient).toBeUndefined();
  });
});

