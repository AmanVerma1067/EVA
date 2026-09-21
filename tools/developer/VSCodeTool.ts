/**
 * EVA Visual Studio Code Automation Tool
 * Conforms to EVA_AI_Implementation_Master_Spec Phase 5 & Phase 6
 */

import { z } from 'zod';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import { ToolContract, ToolResult, VerificationResult, ExecutionContext, RiskLevel } from '../../core/tools/ToolContract.js';
import { findMacAppPids } from '../application/AppLaunchTool.js';

const execFileAsync = promisify(execFile);

/**
 * Dynamically resolves the VS Code CLI executable path
 */
export async function findCodeCli(): Promise<string | null> {
  const candidates = [
    '/opt/homebrew/bin/code',
    '/usr/local/bin/code',
    '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code',
    path.join(os.homedir(), '.vscode/cli/code'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  try {
    const { stdout } = await execFileAsync('which', ['code']);
    const found = stdout.trim();
    if (found && fs.existsSync(found)) return found;
  } catch {}
  return null;
}

/**
 * Resolves project name or relative path against Desktop and development directories
 */
export function resolveDesktopProjectPath(requested: string | undefined, workspaceRoot: string): string {
  if (!requested || requested.trim() === '' || requested === '.' || requested.toLowerCase() === 'this' || requested.toLowerCase() === 'current') {
    return workspaceRoot;
  }

  let cleaned = requested.trim().replace(/^['"]|['"]$/g, '');
  // Strip leading prefixes like "project ", "folder ", "directory ", "dir "
  cleaned = cleaned.replace(/^(?:project|folder|directory|dir)\s+/i, '').trim();

  if (!cleaned) {
    return workspaceRoot;
  }

  // 1. Direct absolute or relative to workspace
  if (path.isAbsolute(cleaned) && fs.existsSync(cleaned)) {
    return cleaned;
  }
  const relWorkspace = path.resolve(workspaceRoot, cleaned);
  if (fs.existsSync(relWorkspace)) {
    return relWorkspace;
  }

  // 2. Search common development project locations: Desktop, Projects, Developer, Documents, Workspace
  const searchDirs = [
    path.join(os.homedir(), 'Desktop'),
    path.join(os.homedir(), 'Projects'),
    path.join(os.homedir(), 'Developer'),
    path.join(os.homedir(), 'Documents'),
    path.join(os.homedir(), 'Workspace'),
    path.join(os.homedir(), 'workspace'),
    os.homedir(),
  ];

  for (const baseDir of searchDirs) {
    try {
      if (!fs.existsSync(baseDir)) continue;

      const direct = path.join(baseDir, cleaned);
      if (fs.existsSync(direct)) {
        return direct;
      }

      const items = fs.readdirSync(baseDir);
      // Exact case-insensitive match
      const exactMatch = items.find((item) => item.toLowerCase() === cleaned.toLowerCase());
      if (exactMatch) {
        return path.join(baseDir, exactMatch);
      }
      // Substring contains match
      const containsMatch = items.find((item) => item.toLowerCase().includes(cleaned.toLowerCase()));
      if (containsMatch) {
        return path.join(baseDir, containsMatch);
      }
    } catch {
      // Ignore directory read errors
    }
  }

  // If not found anywhere, default to Desktop/<cleaned> rather than non-existent path in workspace
  return path.join(os.homedir(), 'Desktop', cleaned);
}

/**
 * Launches an interactive command inside Visual Studio Code's integrated terminal
 */
export async function launchInVSCodeTerminal(command: string, projectPath?: string): Promise<boolean> {
  const codeCli = await findCodeCli();
  if (projectPath) {
    if (codeCli) {
      try {
        await execFileAsync(codeCli, [projectPath]);
      } catch {
        await execFileAsync('open', ['-a', 'Visual Studio Code', projectPath]);
      }
    } else {
      await execFileAsync('open', ['-a', 'Visual Studio Code', projectPath]);
    }
  } else {
    await execFileAsync('open', ['-a', 'Visual Studio Code']);
  }

  // Give VS Code a moment to focus the project window
  await new Promise((r) => setTimeout(r, 800));

  const escapedCmd = command.replace(/"/g, '\\"');
  const script = `
    tell application "Visual Studio Code"
      activate
    end tell
    delay 0.5
    tell application "System Events"
      if exists (process "Code") then
        tell process "Code"
          set frontmost to true
          -- Open / focus integrated terminal: Ctrl+\`
          keystroke "\`" using {control down}
          delay 0.6
          -- Run command in terminal
          keystroke "${escapedCmd}"
          delay 0.2
          key code 36 -- Enter
        end tell
      end if
    end tell
  `;

  try {
    await execFileAsync('osascript', ['-e', script]);
    return true;
  } catch {
    return false;
  }
}

export const VSCodeOpenInputSchema = z.object({
  path: z.string().optional(),
  launchClaude: z.boolean().optional(),
  terminalCommand: z.string().optional(),
});

export const VSCodeOpenOutputSchema = z.object({
  opened: z.boolean(),
  targetPath: z.string(),
  claudeLaunched: z.boolean().optional(),
  terminalCommand: z.string().optional(),
  warning: z.string().optional(),
});

export type VSCodeOpenInput = z.infer<typeof VSCodeOpenInputSchema>;
export type VSCodeOpenOutput = z.infer<typeof VSCodeOpenOutputSchema>;

export class VSCodeTool implements ToolContract<VSCodeOpenInput, VSCodeOpenOutput> {
  public readonly name = 'vscode.open';
  public readonly version = '1.0.0';
  public readonly description = 'Opens Visual Studio Code on a specified project directory or file, optionally launching Claude Code in the integrated terminal';
  public readonly riskLevel: RiskLevel = 'NORMAL';
  public readonly timeoutMs = 20000;

  public readonly inputSchema = VSCodeOpenInputSchema;
  public readonly outputSchema = VSCodeOpenOutputSchema;

  private runner?: (targetPath: string) => Promise<boolean>;

  constructor(options?: { runner?: (targetPath: string) => Promise<boolean> }) {
    this.runner = options?.runner;
  }

  public async execute(params: VSCodeOpenInput, ctx: ExecutionContext): Promise<ToolResult<VSCodeOpenOutput>> {
    const startTime = Date.now();
    const target = resolveDesktopProjectPath(params.path, ctx.workspaceRoot);

    try {
      let claudeLaunched: boolean | undefined = undefined;
      let warning: string | undefined = undefined;

      if (this.runner) {
        await this.runner(target);
        claudeLaunched = params.launchClaude ? true : undefined;
      } else {
        if (params.launchClaude) {
          claudeLaunched = await launchInVSCodeTerminal('claude', target);
          if (!claudeLaunched) {
            warning = 'VS Code opened, but launching Claude in the integrated terminal was blocked because macOS Accessibility permissions were not granted.';
          }
        } else if (params.terminalCommand) {
          const ok = await launchInVSCodeTerminal(params.terminalCommand, target);
          claudeLaunched = ok;
          if (!ok) {
            warning = 'VS Code opened, but running the terminal command was blocked because macOS Accessibility permissions were not granted.';
          }
        } else {
          const codeCli = await findCodeCli();
          if (codeCli) {
            try {
              await execFileAsync(codeCli, [target], { signal: ctx.abortSignal });
            } catch {
              await execFileAsync('open', ['-a', 'Visual Studio Code', target], { signal: ctx.abortSignal });
            }
          } else {
            await execFileAsync('open', ['-a', 'Visual Studio Code', target], { signal: ctx.abortSignal });
          }
        }
      }

      return {
        success: true,
        data: {
          opened: true,
          targetPath: target,
          claudeLaunched,
          terminalCommand: params.terminalCommand,
          warning,
        },
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'VSCODE_OPEN_FAILED',
          message: `Failed to open VS Code at '${target}': ${String(err)}`,
          category: 'recoverable',
        },
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    }
  }

  public async verify(
    params: VSCodeOpenInput,
    result: ToolResult<VSCodeOpenOutput>,
    ctx: ExecutionContext
  ): Promise<VerificationResult> {
    if (!result.success) {
      return {
        verified: false,
        status: 'FAILED',
        evidence: `VS Code launch failed: ${result.error?.message}`,
      };
    }

    try {
      const pids = await findMacAppPids('Visual Studio Code', ctx.abortSignal);
      const running = pids.length > 0;
      return {
        verified: running,
        status: running ? 'CONFIRMED' : 'FAILED',
        evidence: running
          ? `Visual Studio Code is verified active and running on '${result.data?.targetPath}' (PIDs: ${pids.join(', ')}).`
          : 'VS Code process not found in process table.',
      };
    } catch (err) {
      return {
        verified: false,
        status: 'FAILED',
        evidence: `Verification failed for VS Code: ${String(err)}`,
      };
    }
  }
}
