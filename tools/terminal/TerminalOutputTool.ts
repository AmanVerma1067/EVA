/**
 * EVA Terminal Output Retrieval Tool
 * Conforms to EVA_AI_Implementation_Master_Spec Section 8 (Phase 2)
 */

import { z } from 'zod';
import { ToolContract, ToolResult, VerificationResult, ExecutionContext, RiskLevel } from '../../core/tools/ToolContract.js';
import { terminalExecutionBuffer, TerminalExecOutput } from './TerminalExecTool.js';

export const TerminalOutputInputSchema = z.object({
  executionId: z.string().min(1),
});

export const TerminalOutputOutputSchema = z.object({
  executionId: z.string(),
  found: z.boolean(),
  exitCode: z.number().optional(),
  stdout: z.string().optional(),
  stderr: z.string().optional(),
});

export type TerminalOutputInput = z.infer<typeof TerminalOutputInputSchema>;
export type TerminalOutputOutput = z.infer<typeof TerminalOutputOutputSchema>;

export class TerminalOutputTool implements ToolContract<TerminalOutputInput, TerminalOutputOutput> {
  public readonly name = 'terminal.output';
  public readonly version = '1.0.0';
  public readonly description = 'Retrieves previously executed terminal output by execution ID';
  public readonly riskLevel: RiskLevel = 'READ';
  public readonly timeoutMs = 5000;

  public readonly inputSchema = TerminalOutputInputSchema;
  public readonly outputSchema = TerminalOutputOutputSchema;

  public async execute(params: TerminalOutputInput, ctx: ExecutionContext): Promise<ToolResult<TerminalOutputOutput>> {
    const startTime = Date.now();
    const buffered = terminalExecutionBuffer.get(params.executionId);

    if (!buffered) {
      return {
        success: false,
        error: {
          code: 'OUTPUT_BUFFER_NOT_FOUND',
          message: `No execution buffer found for ID '${params.executionId}'`,
          category: 'recoverable',
        },
        metrics: {
          durationMs: Date.now() - startTime,
          timestamp: startTime,
        },
      };
    }

    return {
      success: true,
      data: {
        executionId: params.executionId,
        found: true,
        exitCode: buffered.exitCode,
        stdout: buffered.stdout,
        stderr: buffered.stderr,
      },
      metrics: {
        durationMs: Date.now() - startTime,
        timestamp: startTime,
      },
    };
  }

  public async verify(
    params: TerminalOutputInput,
    result: ToolResult<TerminalOutputOutput>
  ): Promise<VerificationResult> {
    const verified = Boolean(result.success && result.data?.found);
    return {
      verified,
      status: verified ? 'CONFIRMED' : 'FAILED',
      evidence: verified
        ? `Successfully retrieved output for execution '${params.executionId}'`
        : `Failed to retrieve output for execution '${params.executionId}'`,
    };
  }
}

