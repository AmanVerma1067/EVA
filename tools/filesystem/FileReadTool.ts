/**
 * EVA Scoped Filesystem Read Tool
 * Conforms to EVA_AI_Implementation_Master_Spec Section 8 (Phase 2) & Threat Model
 */

import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ToolContract, ToolResult, VerificationResult, ExecutionContext, RiskLevel } from '../../core/tools/ToolContract.js';

export const FileReadInputSchema = z.object({
  path: z.string().min(1),
  encoding: z.enum(['utf-8', 'base64']).default('utf-8'),
  maxBytes: z.number().int().positive().max(10 * 1024 * 1024).default(2 * 1024 * 1024), // 2MB default max
});

export const FileReadOutputSchema = z.object({
  path: z.string(),
  content: z.string(),
  bytesRead: z.number(),
  encoding: z.string(),
});

export type FileReadInput = z.infer<typeof FileReadInputSchema>;
export type FileReadOutput = z.infer<typeof FileReadOutputSchema>;

export class FileReadTool implements ToolContract<FileReadInput, FileReadOutput> {
  public readonly name = 'fs.read';
  public readonly version = '1.0.0';
  public readonly description = 'Reads file content within the permitted workspace scope';
  public readonly riskLevel: RiskLevel = 'READ';
  public readonly timeoutMs = 10000;

  public readonly inputSchema = FileReadInputSchema;
  public readonly outputSchema = FileReadOutputSchema;

  public async execute(params: FileReadInput, ctx: ExecutionContext): Promise<ToolResult<FileReadOutput>> {
    const startTime = Date.now();

    try {
      const resolvedWorkspace = path.resolve(ctx.workspaceRoot);
      const targetPath = path.resolve(resolvedWorkspace, params.path);

      // Path Traversal Security Check
      // Must ensure targetPath starts with resolvedWorkspace
      // Must ensure targetPath starts with resolvedWorkspace and does not use tilde expansion
      if (params.path.startsWith('~')) {
        return {
          success: false,
          error: {
            code: 'PATH_TRAVERSAL_DETECTED',
            message: `Access denied: Target path '${params.path}' escapes permitted workspace root '${resolvedWorkspace}'`,
            category: 'security-related',
          },
          metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
        };
      }

      const relative = path.relative(resolvedWorkspace, targetPath);
      const isOutside = relative.startsWith('..') || path.isAbsolute(relative);

      if (isOutside) {
        return {
          success: false,
          error: {
            code: 'PATH_TRAVERSAL_DETECTED',
            message: `Access denied: Target path '${params.path}' escapes permitted workspace root '${resolvedWorkspace}'`,
            category: 'security-related',
            details: { targetPath, workspaceRoot: resolvedWorkspace },
          },
          metrics: {
            durationMs: Date.now() - startTime,
            timestamp: startTime,
          },
        };
      }

      if (!fs.existsSync(targetPath)) {
        return {
          success: false,
          error: {
            code: 'FILE_NOT_FOUND',
            message: `File does not exist: '${params.path}'`,
            category: 'recoverable',
          },
          metrics: {
            durationMs: Date.now() - startTime,
            timestamp: startTime,
          },
        };
      }

      const stat = fs.statSync(targetPath);
      if (!stat.isFile()) {
        return {
          success: false,
          error: {
            code: 'NOT_A_FILE',
            message: `Path is a directory or special device, not a regular file: '${params.path}'`,
            category: 'recoverable',
          },
          metrics: {
            durationMs: Date.now() - startTime,
            timestamp: startTime,
          },
        };
      }

      if (stat.size > params.maxBytes) {
        return {
          success: false,
          error: {
            code: 'FILE_TOO_LARGE',
            message: `File size (${stat.size} bytes) exceeds maximum permitted read limit (${params.maxBytes} bytes)`,
            category: 'recoverable',
            details: { size: stat.size, maxBytes: params.maxBytes },
          },
          metrics: {
            durationMs: Date.now() - startTime,
            timestamp: startTime,
          },
        };
      }

      const buffer = fs.readFileSync(targetPath);
      const content = buffer.toString(params.encoding);

      return {
        success: true,
        data: {
          path: params.path,
          content,
          bytesRead: buffer.length,
          encoding: params.encoding,
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
          code: 'FILE_READ_FAILED',
          message: `Failed to read file '${params.path}': ${String(err)}`,
          category: 'recoverable',
        },
        metrics: {
          durationMs: Date.now() - startTime,
          timestamp: startTime,
        },
      };
    }
  }

  public async verify(
    params: FileReadInput,
    result: ToolResult<FileReadOutput>
  ): Promise<VerificationResult> {
    if (!result.success || !result.data) {
      return {
        verified: false,
        status: 'FAILED',
        evidence: `File read failed: ${result.error?.message}`,
      };
    }

    const verified = typeof result.data.content === 'string' && result.data.bytesRead >= 0;
    return {
      verified,
      status: verified ? 'CONFIRMED' : 'FAILED',
      evidence: `File verified read: ${result.data.bytesRead} bytes read from '${params.path}'`,
    };
  }
}

