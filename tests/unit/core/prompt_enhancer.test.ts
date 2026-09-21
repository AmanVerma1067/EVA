import { describe, it, expect } from 'vitest';
import { PromptEnhancer } from '../../../core/planner/PromptEnhancer.js';

describe('PromptEnhancer Natural Language & Voice Transformations', () => {
  const enhancer = new PromptEnhancer();

  it('should enhance WhatsApp video call requests with recipient extraction', () => {
    const r1 = enhancer.enhance('videocalling anyone on whatsapp');
    expect(r1.intentCategory).toBe('CALL');
    expect(r1.entities.callType).toBe('video');
    expect(r1.enhancedPrompt).toContain('Start a WhatsApp video call with Anyone.');

    const r2 = enhancer.enhance('videocalling shivam on whatsapp');
    expect(r2.intentCategory).toBe('CALL');
    expect(r2.entities.recipient).toBe('Shivam');
    expect(r2.enhancedPrompt).toBe('Start a WhatsApp video call with Shivam.');
  });

  it('should enhance WhatsApp voice call requests with recipient extraction', () => {
    const r1 = enhancer.enhance('calling anyone on whatsapp');
    expect(r1.intentCategory).toBe('CALL');
    expect(r1.entities.callType).toBe('voice');
    expect(r1.enhancedPrompt).toContain('Start a WhatsApp voice call with Anyone.');

    const r2 = enhancer.enhance('calling shivam on whatsapp');
    expect(r2.intentCategory).toBe('CALL');
    expect(r2.entities.recipient).toBe('Shivam');
    expect(r2.enhancedPrompt).toBe('Start a WhatsApp voice call with Shivam.');
  });

  it('should enhance WhatsApp message requests and tolerate informal spelling', () => {
    const r1 = enhancer.enhance('sendong a message to priya saying running late');
    expect(r1.intentCategory).toBe('MESSAGE');
    expect(r1.entities.recipient).toBe('Priya');
    expect(r1.entities.message).toBe('running late');
    expect(r1.enhancedPrompt).toBe('Send WhatsApp message "running late" to Priya.');
  });

  it('should enhance compound developer workflows: VS Code + Claude Review + Claude Task', () => {
    const raw = 'opening vs code reviewing a project with the help of claude, and then competing a task with claude';
    const res = enhancer.enhance(raw);
    expect(res.intentCategory).toBe('DEVELOPER');
    expect(res.enhancedPrompt).toContain('Open project in Visual Studio Code');
    expect(res.enhancedPrompt).toContain('perform an automated codebase review with Claude Code');
    expect(res.enhancedPrompt).toContain('use Claude Code to execute the task');
    expect(res.refinements.length).toBeGreaterThan(0);
  });
});
