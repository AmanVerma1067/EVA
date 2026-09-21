/**
 * EVA Scoped File Search Tool (Phase 5)
 * Searches for files by pattern or content within the workspace directory.
 */

import { z } from 'zod';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { ToolContract, RiskLevel, ToolResult, VerificationResult, ExecutionContext } from '../../core/tools/ToolContract.js';
import { SecurityError } from '../../core/errors/EvaError.js';

export const FileSearchInputSchema = z.object({
  query: z.string().min(1, 'Search query cannot be empty'),
  subDirectory: z.string().optional(),
  maxResults: z.number().optional().default(20),
});
export type FileSearchInput = z.input<typeof FileSearchInputSchema>;

export const FileSearchOutputSchema = z.object({
  matches: z.array(
    z.object({
      path: z.string(),
      name: z.string(),
      sizeBytes: z.number(),
    })
  ),
  totalFound: z.number(),
});
export type FileSearchOutput = z.infer<typeof FileSearchOutputSchema>;

export class FileSearchTool implements ToolContract<FileSearchInput, FileSearchOutput> {
  public readonly name = 'fs.search';
  public readonly version = '1.0.0';
  public readonly description = 'Searches for files by name query within workspace';
  public readonly riskLevel: RiskLevel = 'READ';
  public readonly timeoutMs = 10000;
  public readonly inputSchema = FileSearchInputSchema;
  public readonly outputSchema = FileSearchOutputSchema;

  public async execute(params: FileSearchInput, ctx: ExecutionContext): Promise<ToolResult<FileSearchOutput>> {
    const startTime = Date.now();
    const searchRoot = params.subDirectory
      ? path.resolve(ctx.workspaceRoot, params.subDirectory)
      : ctx.workspaceRoot;

    // Security path traversal check
    if (!searchRoot.startsWith(ctx.workspaceRoot)) {
      throw new SecurityError(`Search outside workspace forbidden: '${params.subDirectory}'`);
    }

    try {
      const matches: FileSearchOutput['matches'] = [];
      const queryLower = params.query.toLowerCase();
      const maxResults = params.maxResults ?? 20;

      async function walk(dir: string) {
        if (matches.length >= maxResults) return;
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') {
            continue;
          }

          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            await walk(fullPath);
          } else if (entry.isFile()) {
            if (entry.name.toLowerCase().includes(queryLower)) {
              const stat = await fs.stat(fullPath);
              matches.push({
                path: path.relative(ctx.workspaceRoot, fullPath),
                name: entry.name,
                sizeBytes: stat.size,
              });
              if (matches.length >= maxResults) break;
            }
          }
        }
      }

      await walk(searchRoot);

      return {
        success: true,
        data: { matches, totalFound: matches.length },
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    } catch (err) {
      return {
        success: false,
        error: { code: 'FILE_SEARCH_FAILED', message: String(err), category: 'recoverable' },
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    }
  }

  public async verify(params: FileSearchInput, result: ToolResult<FileSearchOutput>): Promise<VerificationResult> {
    return {
      verified: result.success,
      status: result.success ? 'CONFIRMED' : 'FAILED',
      evidence: result.success ? `Found ${result.data?.totalFound ?? 0} matches.` : 'Search failed.',
    };
  }
}
