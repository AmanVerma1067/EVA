/**
 * EVA macOS Keyboard Control Tools (Phase 5)
 * Allows typing text and triggering system keyboard shortcuts.
 */

import { z } from 'zod';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ToolContract, RiskLevel, ToolResult, VerificationResult, ExecutionContext } from '../../core/tools/ToolContract.js';

const execFileAsync = promisify(execFile);

// ==========================================
// 1. keyboard.type
// ==========================================
export const KeyboardTypeInputSchema = z.object({
  text: z.string(),
  delayMs: z.number().optional(),
});
export type KeyboardTypeInput = z.infer<typeof KeyboardTypeInputSchema>;

export const KeyboardTypeOutputSchema = z.object({
  typedCharacters: z.number(),
  success: z.boolean(),
});
export type KeyboardTypeOutput = z.infer<typeof KeyboardTypeOutputSchema>;

export class KeyboardTypeTool implements ToolContract<KeyboardTypeInput, KeyboardTypeOutput> {
  public readonly name = 'keyboard.type';
  public readonly version = '1.0.0';
  public readonly description = 'Types text into the active focused macOS window';
  public readonly riskLevel: RiskLevel = 'NORMAL';
  public readonly timeoutMs = 10000;
  public readonly inputSchema = KeyboardTypeInputSchema;
  public readonly outputSchema = KeyboardTypeOutputSchema;

  private runner?: (text: string) => Promise<boolean>;

  constructor(options?: { runner?: (text: string) => Promise<boolean> }) {
    this.runner = options?.runner;
  }

  public async execute(params: KeyboardTypeInput, ctx: ExecutionContext): Promise<ToolResult<KeyboardTypeOutput>> {
    const startTime = Date.now();
    try {
      if (this.runner) {
        const ok = await this.runner(params.text);
        return {
          success: ok,
          data: { typedCharacters: params.text.length, success: ok },
          metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
        };
      }

      // Escape quotes for AppleScript
      const escaped = params.text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const script = `
        tell application "System Events"
          keystroke "${escaped}"
        end tell
      `;
      await execFileAsync('osascript', ['-e', script], { signal: ctx.abortSignal });

      return {
        success: true,
        data: { typedCharacters: params.text.length, success: true },
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    } catch (err) {
      return {
        success: false,
        error: { code: 'KEYBOARD_TYPE_FAILED', message: String(err), category: 'recoverable' },
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    }
  }

  public async verify(params: KeyboardTypeInput, result: ToolResult<KeyboardTypeOutput>): Promise<VerificationResult> {
    return {
      verified: result.success,
      status: result.success ? 'CONFIRMED' : 'FAILED',
      evidence: result.success ? 'Keyboard action executed successfully.' : (result.error?.message ?? 'Action failed.'),
    };
  }
}

// ==========================================
// 2. keyboard.shortcut
// ==========================================
export const KeyboardShortcutInputSchema = z.object({
  key: z.string(), // e.g. "c", "v", "space", "tab", "Return"
  modifiers: z.array(z.enum(['command', 'control', 'option', 'shift'])).default(['command']),
});
export type KeyboardShortcutInput = z.infer<typeof KeyboardShortcutInputSchema>;

export const KeyboardShortcutOutputSchema = z.object({
  executedShortcut: z.string(),
  success: z.boolean(),
});
export type KeyboardShortcutOutput = z.infer<typeof KeyboardShortcutOutputSchema>;

export class KeyboardShortcutTool implements ToolContract<KeyboardShortcutInput, KeyboardShortcutOutput> {
  public readonly name = 'keyboard.shortcut';
  public readonly version = '1.0.0';
  public readonly description = 'Executes a keyboard shortcut (e.g. Command+Space, Command+Tab)';
  public readonly riskLevel: RiskLevel = 'NORMAL';
  public readonly timeoutMs = 8000;
  public readonly inputSchema = KeyboardShortcutInputSchema;
  public readonly outputSchema = KeyboardShortcutOutputSchema;

  private runner?: (key: string, modifiers: string[]) => Promise<boolean>;

  constructor(options?: { runner?: (key: string, modifiers: string[]) => Promise<boolean> }) {
    this.runner = options?.runner;
  }

  public async execute(params: KeyboardShortcutInput, ctx: ExecutionContext): Promise<ToolResult<KeyboardShortcutOutput>> {
    const startTime = Date.now();
    const shortcutStr = `${params.modifiers.join('+')}+${params.key}`;

    try {
      if (this.runner) {
        const ok = await this.runner(params.key, params.modifiers);
        return {
          success: ok,
          data: { executedShortcut: shortcutStr, success: ok },
          metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
        };
      }

      const modMap = params.modifiers.map((m) => `${m} down`).join(', ');
      const script = `
        tell application "System Events"
          keystroke "${params.key}" using {${modMap}}
        end tell
      `;
      await execFileAsync('osascript', ['-e', script], { signal: ctx.abortSignal });

      return {
        success: true,
        data: { executedShortcut: shortcutStr, success: true },
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    } catch (err) {
      return {
        success: false,
        error: { code: 'KEYBOARD_SHORTCUT_FAILED', message: String(err), category: 'recoverable' },
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    }
  }

  public async verify(params: KeyboardShortcutInput, result: ToolResult<KeyboardShortcutOutput>): Promise<VerificationResult> {
    return {
      verified: result.success,
      status: result.success ? 'CONFIRMED' : 'FAILED',
      evidence: result.success ? 'Keyboard action executed successfully.' : (result.error?.message ?? 'Action failed.'),
    };
  }
}
