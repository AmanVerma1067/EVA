/**
 * EVA Application Launcher Tool
 * Conforms to EVA_AI_Implementation_Master_Spec Section 8 (Phase 2)
 */

import { z } from 'zod';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ToolContract, ToolResult, VerificationResult, ExecutionContext, RiskLevel } from '../../core/tools/ToolContract.js';

const execFileAsync = promisify(execFile);

export const APP_NAME_MAP: Record<string, string> = {
  'chrome': 'Google Chrome',
  'google chrome': 'Google Chrome',
  'calculator': 'Calculator',
  'calc': 'Calculator',
  'safari': 'Safari',
  'code': 'Visual Studio Code',
  'vscode': 'Visual Studio Code',
  'vs code': 'Visual Studio Code',
  'visual studio code': 'Visual Studio Code',
  'whatsapp': 'WhatsApp',
  'finder': 'Finder',
  'terminal': 'Terminal',
  'iterm': 'iTerm',
  'iterm2': 'iTerm',
  'notes': 'Notes',
  'music': 'Music',
  'spotify': 'Spotify',
  'messages': 'Messages',
  'facetime': 'FaceTime',
  'settings': 'System Settings',
  'system settings': 'System Settings',
  'system preferences': 'System Settings',
  'mail': 'Mail',
  'calendar': 'Calendar',
  'reminders': 'Reminders',
  'photos': 'Photos',
  'preview': 'Preview',
  'textedit': 'TextEdit',
  'activity monitor': 'Activity Monitor',
  'antigravity': 'Antigravity',
};

export const APP_TO_PROCESS_NAMES: Record<string, string[]> = {
  'visual studio code': ['Code', 'Electron'],
  'google chrome': ['Google Chrome', 'Chrome'],
  'calculator': ['Calculator'],
  'safari': ['Safari'],
  'whatsapp': ['WhatsApp'],
  'finder': ['Finder'],
  'terminal': ['Terminal'],
  'iterm': ['iTerm2', 'iTerm'],
  'notes': ['Notes'],
  'music': ['Music'],
  'spotify': ['Spotify'],
  'messages': ['Messages'],
  'facetime': ['FaceTime'],
  'system settings': ['System Settings'],
  'activity monitor': ['Activity Monitor'],
  'preview': ['Preview'],
  'textedit': ['TextEdit'],
  'mail': ['Mail'],
  'calendar': ['Calendar'],
  'reminders': ['Reminders'],
  'photos': ['Photos'],
  'antigravity': ['Antigravity', 'Electron', 'com.google.antigravity'],
};

export async function findMacAppPids(appName: string, abortSignal?: AbortSignal): Promise<number[]> {
  const lower = appName.toLowerCase().trim();
  const processNames = APP_TO_PROCESS_NAMES[lower] || [appName];

  // 1. Check exact process names using pgrep -x
  for (const pName of processNames) {
    try {
      const { stdout } = await execFileAsync('pgrep', ['-x', pName], { signal: abortSignal });
      const pids = stdout
        .split('\n')
        .map((l) => parseInt(l.trim(), 10))
        .filter((n) => !isNaN(n));
      if (pids.length > 0) return pids;
    } catch {
      // Exit 1 means process not found
    }
  }

  // 2. Check full command line or fuzzy via pgrep -fi
  for (const pName of processNames) {
    try {
      const { stdout } = await execFileAsync('pgrep', ['-fi', pName], { signal: abortSignal });
      const pids = stdout
        .split('\n')
        .map((l) => parseInt(l.trim(), 10))
        .filter((n) => !isNaN(n));
      if (pids.length > 0) return pids;
    } catch {}
  }

  // 3. Check via macOS System Events
  try {
    const script = `tell application "System Events" to get unix id of every process whose name is "${appName}" or displayed name is "${appName}"`;
    const { stdout } = await execFileAsync('osascript', ['-e', script], { signal: abortSignal });
    const pids = stdout
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n));
    if (pids.length > 0) return pids;
  } catch {}

  return [];
}

export function normalizeMacAppName(rawName: string): string {
  let cleaned = rawName
    .replace(/^(?:application|app)\s+/i, '')
    .replace(/[.!?]+$/, '')
    .trim();
  const lower = cleaned.toLowerCase();
  if (APP_NAME_MAP[lower]) {
    return APP_NAME_MAP[lower];
  }
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export const AppLaunchInputSchema = z.object({
  appName: z.string().min(1).regex(/^[a-zA-Z0-9 ._-]+$/, 'App name must contain only alphanumeric characters, spaces, dots, underscores, or hyphens'),
});

export const AppLaunchOutputSchema = z.object({
  launched: z.boolean(),
  appName: z.string(),
  message: z.string(),
});

export type AppLaunchInput = z.infer<typeof AppLaunchInputSchema>;
export type AppLaunchOutput = z.infer<typeof AppLaunchOutputSchema>;

export class AppLaunchTool implements ToolContract<AppLaunchInput, AppLaunchOutput> {
  public readonly name = 'app.launch';
  public readonly version = '1.0.0';
  public readonly description = 'Launches a macOS application by name or bundle identifier';
  public readonly riskLevel: RiskLevel = 'NORMAL';
  public readonly timeoutMs = 15000;

  public readonly inputSchema = AppLaunchInputSchema;
  public readonly outputSchema = AppLaunchOutputSchema;

  private runner?: (appName: string) => Promise<boolean>;
  private verifier?: (appName: string) => Promise<boolean>;

  constructor(options?: {
    runner?: (appName: string) => Promise<boolean>;
    verifier?: (appName: string) => Promise<boolean>;
  }) {
    this.runner = options?.runner;
    this.verifier = options?.verifier;
  }

  public async execute(params: AppLaunchInput, ctx: ExecutionContext): Promise<ToolResult<AppLaunchOutput>> {
    const startTime = Date.now();
    const appToLaunch = normalizeMacAppName(params.appName);

    try {
      if (this.runner) {
        await this.runner(appToLaunch);
      } else {
        try {
          await execFileAsync('open', ['-a', appToLaunch], { signal: ctx.abortSignal });
        } catch (firstErr) {
          if (appToLaunch.toLowerCase() === 'antigravity') {
            try {
              await execFileAsync('open', ['-b', 'com.google.antigravity'], { signal: ctx.abortSignal });
            } catch {
              await execFileAsync('open', ['-a', '/Applications/Antigravity.app'], { signal: ctx.abortSignal });
            }
          } else if (appToLaunch !== params.appName) {
            await execFileAsync('open', ['-a', params.appName], { signal: ctx.abortSignal });
          } else {
            throw firstErr;
          }
        }
      }

      return {
        success: true,
        data: {
          launched: true,
          appName: appToLaunch,
          message: `Application '${appToLaunch}' launched successfully.`,
        },
        metrics: {
          durationMs: Date.now() - startTime,
          timestamp: startTime,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'APP_LAUNCH_FAILED',
          message: `Failed to launch application '${appToLaunch}': ${String(err)}`,
          category: 'recoverable',
          details: { error: String(err) },
        },
        metrics: {
          durationMs: Date.now() - startTime,
          timestamp: startTime,
        },
      };
    }
  }

  public async verify(
    params: AppLaunchInput,
    result: ToolResult<AppLaunchOutput>,
    ctx: ExecutionContext
  ): Promise<VerificationResult> {
    if (!result.success) {
      return {
        verified: false,
        status: 'FAILED',
        evidence: `Launch operation failed: ${result.error?.message}`,
      };
    }

    const appToVerify = normalizeMacAppName(params.appName);

    try {
      let isRunning = false;
      if (this.verifier) {
        isRunning = await this.verifier(appToVerify);
      } else {
        const pids = await findMacAppPids(appToVerify, ctx.abortSignal);
        isRunning = pids.length > 0;
      }

      return {
        verified: isRunning,
        status: isRunning ? 'CONFIRMED' : 'FAILED',
        evidence: isRunning
          ? `Application process '${appToVerify}' verified active in process table.`
          : `Process '${appToVerify}' was not found in process table after launch.`,
      };
    } catch (err) {
      return {
        verified: false,
        status: 'FAILED',
        evidence: `Verification failed for '${appToVerify}': ${String(err)}`,
      };
    }
  }
}
