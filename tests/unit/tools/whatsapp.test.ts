import { describe, it, expect } from 'vitest';
import { WhatsAppTool, WhatsAppCallTool, WhatsAppVideoCallTool, isAccessibilityError } from '../../../tools/messaging/WhatsAppTool.js';
import { AgentBrain } from '../../../core/planner/AgentBrain.js';
import { ToolRouter } from '../../../core/tools/ToolRouter.js';
import { ToolRegistry } from '../../../core/tools/ToolRegistry.js';
import { PolicyEngine } from '../../../security/policy/PolicyEngine.js';
import { AuditLogger } from '../../../security/audit/AuditLogger.js';
import { ExecutionContext } from '../../../core/tools/ToolContract.js';

describe('WhatsAppTool and Intent Parsing', () => {
  it('should parse natural language WhatsApp goals accurately', () => {
    const registry = new ToolRegistry();
    const router = new ToolRouter({ registry, policyEngine: new PolicyEngine(), auditLogger: new AuditLogger() });
    const brain = new AgentBrain({ router });

    const p1 = brain.parseGoalToPlan('send hi to shivam in whatsapp');
    expect(p1.length).toBe(1);
    expect(p1[0].toolName).toBe('whatsapp.send_message');
    expect(p1[0].parameters.recipient).toBe('Shivam');
    expect(p1[0].parameters.message).toBe('hi');

    const p2 = brain.parseGoalToPlan('send "meeting at 4pm" to Alice on whatsapp');
    expect(p2.length).toBe(1);
    expect(p2[0].toolName).toBe('whatsapp.send_message');
    expect(p2[0].parameters.recipient).toBe('Alice');
    expect(p2[0].parameters.message).toBe('meeting at 4pm');

    const p3 = brain.parseGoalToPlan('send hello to shivam');
    expect(p3.length).toBe(1);
    expect(p3[0].toolName).toBe('whatsapp.send_message');
    expect(p3[0].parameters.recipient).toBe('Shivam');
    expect(p3[0].parameters.message).toBe('hello');
  });

  it('should execute WhatsAppTool with runner', async () => {
    let sentRecipient = '';
    let sentMessage = '';

    const tool = new WhatsAppTool({
      runner: async (recipient, message) => {
        sentRecipient = recipient;
        sentMessage = message;
        return true;
      },
    });

    const dummyCtx: ExecutionContext = {
      taskId: 'task-wa',
      sessionId: 'sess-wa',
      deviceId: 'dev-wa',
      workspaceRoot: process.cwd(),
      abortSignal: new AbortController().signal,
    };

    const res = await tool.execute({ recipient: 'Shivam', message: 'hi' }, dummyCtx);
    expect(res.success).toBe(true);
    expect(sentRecipient).toBe('Shivam');
    expect(sentMessage).toBe('hi');

    const verification = await tool.verify({ recipient: 'Shivam', message: 'hi' }, res, dummyCtx);
    expect(verification.verified).toBe(true);
  });

  it('should detect macOS Accessibility and keystroke authorization errors', () => {
    expect(isAccessibilityError('System Events got an error: osascript is not allowed to send keystrokes. (1002)')).toBe(true);
    expect(isAccessibilityError('execution error: Not authorized to send Apple events. (-1743)')).toBe(true);
    expect(isAccessibilityError('assistive access is turned off')).toBe(true);
    expect(isAccessibilityError('Command failed: generic error')).toBe(false);
  });

  it('should return ACCESSIBILITY_PERMISSION_REQUIRED on WhatsApp call when keystrokes are blocked', async () => {
    const callTool = new WhatsAppCallTool({
      runner: async () => {
        throw new Error('System Events got an error: osascript is not allowed to send keystrokes. (1002)');
      },
    });

    const dummyCtx: ExecutionContext = {
      taskId: 'task-wa-call',
      sessionId: 'sess-wa-call',
      deviceId: 'dev-wa-call',
      workspaceRoot: process.cwd(),
      abortSignal: new AbortController().signal,
    };

    const res = await callTool.execute({ recipient: 'Alice' }, dummyCtx);
    expect(res.success).toBe(false);
    expect(res.error?.code).toBe('ACCESSIBILITY_PERMISSION_REQUIRED');
    expect(res.error?.message).toContain('Accessibility');
  });

  it('should return ACCESSIBILITY_PERMISSION_REQUIRED on WhatsApp video call when keystrokes are blocked', async () => {
    const videoCallTool = new WhatsAppVideoCallTool({
      runner: async () => {
        throw new Error('System Events got an error: osascript is not allowed to send keystrokes. (1002)');
      },
    });

    const dummyCtx: ExecutionContext = {
      taskId: 'task-wa-video',
      sessionId: 'sess-wa-video',
      deviceId: 'dev-wa-video',
      workspaceRoot: process.cwd(),
      abortSignal: new AbortController().signal,
    };

    const res = await videoCallTool.execute({ recipient: 'Bob' }, dummyCtx);
    expect(res.success).toBe(false);
    expect(res.error?.code).toBe('ACCESSIBILITY_PERMISSION_REQUIRED');
    expect(res.error?.message).toContain('Accessibility');
  });
});


