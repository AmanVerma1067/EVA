/**
 * EVA macOS Mouse Automation Tools (Phase 5)
 * Controls mouse cursor movement and clicking.
 */

import { z } from 'zod';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ToolContract, RiskLevel, ToolResult, VerificationResult, ExecutionContext } from '../../core/tools/ToolContract.js';

const execFileAsync = promisify(execFile);

// ==========================================
// 1. mouse.click
// ==========================================
export const MouseClickInputSchema = z.object({
  x: z.number().optional(),
  y: z.number().optional(),
  button: z.enum(['left', 'right', 'double']).default('left'),
});
export type MouseClickInput = z.infer<typeof MouseClickInputSchema>;

export const MouseClickOutputSchema = z.object({
  clicked: z.boolean(),
  button: z.string(),
  x: z.number().optional(),
  y: z.number().optional(),
});
export type MouseClickOutput = z.infer<typeof MouseClickOutputSchema>;

export class MouseClickTool implements ToolContract<MouseClickInput, MouseClickOutput> {
  public readonly name = 'mouse.click';
  public readonly version = '1.0.0';
  public readonly description = 'Clicks the mouse at specified desktop coordinates or current position';
  public readonly riskLevel: RiskLevel = 'NORMAL';
  public readonly timeoutMs = 8000;
  public readonly inputSchema = MouseClickInputSchema;
  public readonly outputSchema = MouseClickOutputSchema;

  private runner?: (x?: number, y?: number, button?: string) => Promise<boolean>;

  constructor(options?: { runner?: (x?: number, y?: number, button?: string) => Promise<boolean> }) {
    this.runner = options?.runner;
  }

  public async execute(params: MouseClickInput, ctx: ExecutionContext): Promise<ToolResult<MouseClickOutput>> {
    const startTime = Date.now();
    try {
      if (this.runner) {
        const ok = await this.runner(params.x, params.y, params.button);
        return {
          success: ok,
          data: { clicked: ok, button: params.button, x: params.x, y: params.y },
          metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
        };
      }

      // If x and y provided, click via AppleScript / CoreGraphics event simulation
      if (params.x !== undefined && params.y !== undefined) {
        const script = `
          tell application "System Events"
            -- Native macOS position click
            click at {${params.x}, ${params.y}}
          end tell
        `;
        await execFileAsync('osascript', ['-e', script], { signal: ctx.abortSignal });
      } else {
        // Click frontmost window center or default position
        const script = `
          tell application "System Events"
            click
          end tell
        `;
        await execFileAsync('osascript', ['-e', script], { signal: ctx.abortSignal });
      }

      return {
        success: true,
        data: { clicked: true, button: params.button, x: params.x, y: params.y },
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    } catch (err) {
      return {
        success: false,
        error: { code: 'MOUSE_CLICK_FAILED', message: String(err), category: 'recoverable' },
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    }
  }

  public async verify(params: MouseClickInput, result: ToolResult<MouseClickOutput>): Promise<VerificationResult> {
    return {
      verified: result.success,
      status: result.success ? 'CONFIRMED' : 'FAILED',
      evidence: result.success ? 'Mouse click dispatched successfully.' : (result.error?.message ?? 'Failed.'),
    };
  }
}

