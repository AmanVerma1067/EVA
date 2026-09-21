/**
 * EVA macOS Window Management Tools (Phase 5)
 * Controls desktop application windows: listing, focusing, closing, and resizing.
 */

import { z } from 'zod';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ToolContract, RiskLevel, ToolResult, VerificationResult, ExecutionContext } from '../../core/tools/ToolContract.js';

const execFileAsync = promisify(execFile);

// ==========================================
// 1. window.list
// ==========================================
export const WindowListInputSchema = z.object({
  appName: z.string().optional(),
});
export type WindowListInput = z.infer<typeof WindowListInputSchema>;

export const WindowListOutputSchema = z.object({
  windows: z.array(
    z.object({
      appName: z.string(),
      title: z.string(),
      x: z.number().optional(),
      y: z.number().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
    })
  ),
  count: z.number(),
});
export type WindowListOutput = z.infer<typeof WindowListOutputSchema>;

export class WindowListTool implements ToolContract<WindowListInput, WindowListOutput> {
  public readonly name = 'window.list';
  public readonly version = '1.0.0';
  public readonly description = 'Lists open visible windows on macOS desktop';
  public readonly riskLevel: RiskLevel = 'READ';
  public readonly timeoutMs = 8000;
  public readonly inputSchema = WindowListInputSchema;
  public readonly outputSchema = WindowListOutputSchema;

  private runner?: () => Promise<WindowListOutput['windows']>;

  constructor(options?: { runner?: () => Promise<WindowListOutput['windows']> }) {
    this.runner = options?.runner;
  }

  public async execute(params: WindowListInput, ctx: ExecutionContext): Promise<ToolResult<WindowListOutput>> {
    const startTime = Date.now();
    try {
      if (this.runner) {
        const windows = await this.runner();
        return {
          success: true,
          data: { windows, count: windows.length },
          metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
        };
      }

      // AppleScript query to System Events
      const script = `
        set outList to ""
        tell application "System Events"
          set procs to (every process whose visible is true)
          repeat with p in procs
            set pName to name of p
            try
              repeat with w in (every window of p)
                set wTitle to name of w
                set outList to outList & pName & ":::" & wTitle & "\\n"
              end repeat
            end try
          end repeat
        end tell
        return outList
      `;

      const { stdout } = await execFileAsync('osascript', ['-e', script], { signal: ctx.abortSignal });
      const lines = stdout.trim().split('\n').filter(Boolean);
      const windows = lines.map((line) => {
        const [appName, title] = line.split(':::');
        return {
          appName: appName?.trim() || 'Unknown',
          title: title?.trim() || 'Window',
        };
      });

      const filtered = params.appName
        ? windows.filter((w) => w.appName.toLowerCase().includes(params.appName!.toLowerCase()))
        : windows;

      return {
        success: true,
        data: { windows: filtered, count: filtered.length },
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    } catch (err) {
      return {
        success: false,
        error: { code: 'WINDOW_LIST_FAILED', message: String(err), category: 'recoverable' },
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    }
  }

  public async verify(params: WindowListInput, result: ToolResult<WindowListOutput>): Promise<VerificationResult> {
    return {
      verified: result.success,
      status: result.success ? 'CONFIRMED' : 'FAILED',
      evidence: result.success ? 'Window operation completed successfully.' : (result.error?.message ?? 'Operation failed.'),
    };
  }
}

// ==========================================
// 2. window.focus
// ==========================================
export const WindowFocusInputSchema = z.object({
  appName: z.string(),
  title: z.string().optional(),
});
export type WindowFocusInput = z.infer<typeof WindowFocusInputSchema>;

export const WindowFocusOutputSchema = z.object({
  focused: z.boolean(),
  appName: z.string(),
});
export type WindowFocusOutput = z.infer<typeof WindowFocusOutputSchema>;

export class WindowFocusTool implements ToolContract<WindowFocusInput, WindowFocusOutput> {
  public readonly name = 'window.focus';
  public readonly version = '1.0.0';
  public readonly description = 'Brings an application window to the foreground';
  public readonly riskLevel: RiskLevel = 'NORMAL';
  public readonly timeoutMs = 8000;
  public readonly inputSchema = WindowFocusInputSchema;
  public readonly outputSchema = WindowFocusOutputSchema;

  private runner?: (appName: string) => Promise<boolean>;

  constructor(options?: { runner?: (appName: string) => Promise<boolean> }) {
    this.runner = options?.runner;
  }

  public async execute(params: WindowFocusInput, ctx: ExecutionContext): Promise<ToolResult<WindowFocusOutput>> {
    const startTime = Date.now();
    try {
      if (this.runner) {
        const ok = await this.runner(params.appName);
        return {
          success: ok,
          data: { focused: ok, appName: params.appName },
          metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
        };
      }

      const script = `
        tell application "${params.appName}" to activate
        tell application "System Events"
          if exists (process "${params.appName}") then
            set frontmost of process "${params.appName}" to true
          end if
        end tell
      `;
      await execFileAsync('osascript', ['-e', script], { signal: ctx.abortSignal });

      return {
        success: true,
        data: { focused: true, appName: params.appName },
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    } catch (err) {
      return {
        success: false,
        error: { code: 'WINDOW_FOCUS_FAILED', message: String(err), category: 'recoverable' },
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    }
  }

  public async verify(params: WindowFocusInput, result: ToolResult<WindowFocusOutput>): Promise<VerificationResult> {
    return {
      verified: result.success,
      status: result.success ? 'CONFIRMED' : 'FAILED',
      evidence: result.success ? 'Window operation completed successfully.' : (result.error?.message ?? 'Operation failed.'),
    };
  }
}

// ==========================================
// 3. window.close
// ==========================================
export const WindowCloseInputSchema = z.object({
  appName: z.string(),
});
export type WindowCloseInput = z.infer<typeof WindowCloseInputSchema>;

export const WindowCloseOutputSchema = z.object({
  closed: z.boolean(),
  appName: z.string(),
});
export type WindowCloseOutput = z.infer<typeof WindowCloseOutputSchema>;

export class WindowCloseTool implements ToolContract<WindowCloseInput, WindowCloseOutput> {
  public readonly name = 'window.close';
  public readonly version = '1.0.0';
  public readonly description = 'Closes the frontmost window of an application';
  public readonly riskLevel: RiskLevel = 'NORMAL';
  public readonly timeoutMs = 8000;
  public readonly inputSchema = WindowCloseInputSchema;
  public readonly outputSchema = WindowCloseOutputSchema;

  private runner?: (appName: string) => Promise<boolean>;

  constructor(options?: { runner?: (appName: string) => Promise<boolean> }) {
    this.runner = options?.runner;
  }

  public async execute(params: WindowCloseInput, ctx: ExecutionContext): Promise<ToolResult<WindowCloseOutput>> {
    const startTime = Date.now();
    try {
      if (this.runner) {
        const ok = await this.runner(params.appName);
        return {
          success: ok,
          data: { closed: ok, appName: params.appName },
          metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
        };
      }

      const script = `
        try
          tell application "${params.appName}" to close front window
        on error
          tell application "System Events"
            if exists (process "${params.appName}") then
              tell process "${params.appName}"
                if (count of windows) > 0 then
                  click (first button whose subrole is "AXCloseButton") of window 1
                end if
              end tell
            end if
          end tell
        end try
      `;
      await execFileAsync('osascript', ['-e', script], { signal: ctx.abortSignal });

      return {
        success: true,
        data: { closed: true, appName: params.appName },
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    } catch (err) {
      return {
        success: false,
        error: { code: 'WINDOW_CLOSE_FAILED', message: String(err), category: 'recoverable' },
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    }
  }

  public async verify(params: WindowCloseInput, result: ToolResult<WindowCloseOutput>): Promise<VerificationResult> {
    return {
      verified: result.success,
      status: result.success ? 'CONFIRMED' : 'FAILED',
      evidence: result.success ? 'Window operation completed successfully.' : (result.error?.message ?? 'Operation failed.'),
    };
  }
}
