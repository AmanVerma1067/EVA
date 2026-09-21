/**
 * EVA Filesystem Write Tool (Phase 5)
 * Safely writes or appends content to scoped files within the workspace.
 */

import { z } from 'zod';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { ToolContract, RiskLevel, ToolResult, VerificationResult, ExecutionContext } from '../../core/tools/ToolContract.js';
import { SecurityError } from '../../core/errors/EvaError.js';

export const FileWriteInputSchema = z.object({
  filePath: z.string().min(1, 'File path cannot be empty'),
  content: z.string(),
  append: z.boolean().optional().default(false),
});
export type FileWriteInput = z.input<typeof FileWriteInputSchema>;

export const FileWriteOutputSchema = z.object({
  filePath: z.string(),
  bytesWritten: z.number(),
  operation: z.enum(['created', 'updated', 'appended']),
});
export type FileWriteOutput = z.infer<typeof FileWriteOutputSchema>;

export class FileWriteTool implements ToolContract<FileWriteInput, FileWriteOutput> {
  public readonly name = 'fs.write';
  public readonly version = '1.0.0';
  public readonly description = 'Writes or appends content to a scoped file within the workspace';
  public readonly riskLevel: RiskLevel = 'NORMAL';
  public readonly timeoutMs = 10000;
  public readonly inputSchema = FileWriteInputSchema;
  public readonly outputSchema = FileWriteOutputSchema;

  public async execute(params: FileWriteInput, ctx: ExecutionContext): Promise<ToolResult<FileWriteOutput>> {
    const startTime = Date.now();
    const resolvedPath = path.resolve(ctx.workspaceRoot, params.filePath);

    // Defense against path traversal
    if (!resolvedPath.startsWith(ctx.workspaceRoot)) {
      throw new SecurityError(`Path traversal forbidden: '${params.filePath}' resolves outside '${ctx.workspaceRoot}'`);
    }

    try {
      // Ensure parent directory exists
      await fs.mkdir(path.dirname(resolvedPath), { recursive: true });

      let existed = false;
      try {
        await fs.access(resolvedPath);
        existed = true;
      } catch {
        existed = false;
      }

      if (params.append) {
        await fs.appendFile(resolvedPath, params.content, 'utf8');
      } else {
        await fs.writeFile(resolvedPath, params.content, 'utf8');
      }

      const bytes = Buffer.byteLength(params.content, 'utf8');
      const op = params.append ? 'appended' : (existed ? 'updated' : 'created');

      return {
        success: true,
        data: {
          filePath: resolvedPath,
          bytesWritten: bytes,
          operation: op,
        },
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    } catch (err) {
      return {
        success: false,
        error: { code: 'FILE_WRITE_FAILED', message: String(err), category: 'recoverable' },
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    }
  }

  public async verify(params: FileWriteInput, result: ToolResult<FileWriteOutput>, ctx: ExecutionContext): Promise<VerificationResult> {
    if (!result.success || !result.data) {
      return { verified: false, status: 'FAILED', evidence: result.error?.message ?? 'Write failed.' };
    }

    try {
      await fs.access(result.data.filePath);
      return {
        verified: true,
        status: 'CONFIRMED',
        evidence: `File verified at ${result.data.filePath} (${result.data.bytesWritten} bytes written).`,
      };
    } catch (err) {
      return { verified: false, status: 'FAILED', evidence: `Verification failed: file does not exist after write.` };
    }
  }
}
