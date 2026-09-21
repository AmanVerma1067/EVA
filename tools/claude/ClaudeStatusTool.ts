import { z } from 'zod';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ExecutionContext, RiskLevel, ToolContract, ToolResult, VerificationResult } from '../../core/tools/ToolContract.js';
import { findClaudeCli } from './ClaudeCodeTool.js';

const execFileAsync = promisify(execFile);
const InputSchema = z.object({ projectPath: z.string().optional() });
const OutputSchema = z.object({ activeCount: z.number(), sessions: z.array(z.unknown()), summary: z.string() });

export class ClaudeStatusTool implements ToolContract<z.infer<typeof InputSchema>, z.infer<typeof OutputSchema>> {
  public readonly name = 'claude.status';
  public readonly version = '1.0.0';
  public readonly description = 'Reports active Claude Code background-agent sessions without changing them';
  public readonly riskLevel: RiskLevel = 'READ';
  public readonly timeoutMs = 10000;
  public readonly inputSchema = InputSchema;
  public readonly outputSchema = OutputSchema;

  public async execute(params: z.infer<typeof InputSchema>, ctx: ExecutionContext): Promise<ToolResult<z.infer<typeof OutputSchema>>> {
    const started = Date.now();
    try {
      const cli = await findClaudeCli();
      const args = ['agents', '--json'];
      if (params.projectPath) args.push('--cwd', params.projectPath);
      const { stdout } = await execFileAsync(cli, args, { cwd: ctx.workspaceRoot, signal: ctx.abortSignal, timeout: this.timeoutMs });
      const sessions = JSON.parse(stdout || '[]');
      if (!Array.isArray(sessions)) throw new Error('Claude returned an invalid background-agent status response.');
      return { success: true, data: { activeCount: sessions.length, sessions, summary: sessions.length ? `${sessions.length} Claude Code background session(s) are active.` : 'No active Claude Code background sessions.' }, metrics: { durationMs: Date.now() - started, timestamp: started } };
    } catch (error) {
      return { success: false, error: { code: 'CLAUDE_STATUS_FAILED', message: String(error), category: 'recoverable' }, metrics: { durationMs: Date.now() - started, timestamp: started } };
    }
  }

  public async verify(_params: z.infer<typeof InputSchema>, result: ToolResult<z.infer<typeof OutputSchema>>): Promise<VerificationResult> {
    return { verified: result.success, status: result.success ? 'CONFIRMED' : 'FAILED', evidence: result.data?.summary ?? result.error?.message ?? 'Claude status check failed.' };
  }
}
