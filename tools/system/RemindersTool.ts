/**
 * EVA Apple Reminders Integration Tool (Phase 11)
 * Automates creating and querying Apple Reminders on macOS via AppleScript.
 */

import { z } from 'zod';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ToolContract, RiskLevel, ToolResult, VerificationResult, ExecutionContext } from '../../core/tools/ToolContract.js';

const execFileAsync = promisify(execFile);

// ==========================================
// 1. reminders.add
// ==========================================
export const RemindersAddInputSchema = z.object({
  title: z.string().min(1, 'Reminder title cannot be empty'),
  notes: z.string().optional(),
});
export type RemindersAddInput = z.infer<typeof RemindersAddInputSchema>;

export const RemindersAddOutputSchema = z.object({
  created: z.boolean(),
  title: z.string(),
});
export type RemindersAddOutput = z.infer<typeof RemindersAddOutputSchema>;

export class RemindersAddTool implements ToolContract<RemindersAddInput, RemindersAddOutput> {
  public readonly name = 'reminders.add';
  public readonly version = '1.0.0';
  public readonly description = 'Creates a new reminder in Apple Reminders on macOS';
  public readonly riskLevel: RiskLevel = 'NORMAL';
  public readonly timeoutMs = 10000;
  public readonly inputSchema = RemindersAddInputSchema;
  public readonly outputSchema = RemindersAddOutputSchema;

  private runner?: (title: string, notes?: string) => Promise<boolean>;

  constructor(options?: { runner?: (title: string, notes?: string) => Promise<boolean> }) {
    this.runner = options?.runner;
  }

  public async execute(params: RemindersAddInput, ctx: ExecutionContext): Promise<ToolResult<RemindersAddOutput>> {
    const startTime = Date.now();
    try {
      if (this.runner) {
        const ok = await this.runner(params.title, params.notes);
        return {
          success: ok,
          data: { created: ok, title: params.title },
          metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
        };
      }

      const cleanTitle = params.title.replace(/"/g, '\\"');
      const cleanNotes = (params.notes ?? '').replace(/"/g, '\\"');
      const script = `
        tell application "Reminders"
          set defaultList to default list
          make new reminder at end of defaultList with properties {name:"${cleanTitle}", body:"${cleanNotes}"}
        end tell
      `;
      await execFileAsync('osascript', ['-e', script], { signal: ctx.abortSignal });

      return {
        success: true,
        data: { created: true, title: params.title },
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    } catch (err) {
      return {
        success: false,
        error: { code: 'REMINDERS_ADD_FAILED', message: String(err), category: 'recoverable' },
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    }
  }

  public async verify(params: RemindersAddInput, result: ToolResult<RemindersAddOutput>): Promise<VerificationResult> {
    return {
      verified: result.success,
      status: result.success ? 'CONFIRMED' : 'FAILED',
      evidence: result.success ? `Created reminder '${params.title}'.` : 'Failed to create reminder.',
    };
  }
}

