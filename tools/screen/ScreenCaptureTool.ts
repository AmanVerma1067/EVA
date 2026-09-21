/**
 * EVA Screenshot Capture Tool
 * Conforms to EVA_AI_Implementation_Master_Spec Section 8 (Phase 2)
 */

import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ToolContract, ToolResult, VerificationResult, ExecutionContext, RiskLevel } from '../../core/tools/ToolContract.js';

const execFileAsync = promisify(execFile);

export const ScreenCaptureInputSchema = z.object({
  targetPath: z.string().optional(),
  displayIndex: z.number().int().min(1).default(1),
});

export const ScreenCaptureOutputSchema = z.object({
  imagePath: z.string(),
  fileSizeBytes: z.number(),
  timestamp: number(),
});

function number() {
  return z.number();
}

export type ScreenCaptureInput = z.infer<typeof ScreenCaptureInputSchema>;
export type ScreenCaptureOutput = z.infer<typeof ScreenCaptureOutputSchema>;

export class ScreenCaptureTool implements ToolContract<ScreenCaptureInput, ScreenCaptureOutput> {
  public readonly name = 'screen.capture';
  public readonly version = '1.0.0';
  public readonly description = 'Captures a screenshot of the macOS display and writes to disk';
  public readonly riskLevel: RiskLevel = 'READ';
  public readonly timeoutMs = 10000;

  public readonly inputSchema = ScreenCaptureInputSchema;
  public readonly outputSchema = ScreenCaptureOutputSchema;

  private capturer?: (targetPath: string) => Promise<void>;

  constructor(options?: { capturer?: (targetPath: string) => Promise<void> }) {
    this.capturer = options?.capturer;
  }

  public async execute(params: ScreenCaptureInput, ctx: ExecutionContext): Promise<ToolResult<ScreenCaptureOutput>> {
    const startTime = Date.now();
    const destination = params.targetPath
      ? path.resolve(ctx.workspaceRoot, params.targetPath)
      : path.join(os.tmpdir(), `eva_screenshot_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.png`);

    try {
      if (this.capturer) {
        await this.capturer(destination);
      } else {
        // macOS native screencapture (-x = silent, no sound)
        await execFileAsync('screencapture', ['-x', destination], { signal: ctx.abortSignal });
      }

      if (!fs.existsSync(destination)) {
        return {
          success: false,
          error: {
            code: 'CAPTURE_FILE_MISSING',
            message: `Screenshot command completed but file was not created at '${destination}'`,
            category: 'recoverable',
          },
          metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
        };
      }

      const stat = fs.statSync(destination);

      return {
        success: true,
        data: {
          imagePath: destination,
          fileSizeBytes: stat.size,
          timestamp: startTime,
        },
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'SCREEN_CAPTURE_FAILED',
          message: `Failed to capture screen: ${String(err)}`,
          category: 'recoverable',
        },
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    }
  }

  public async verify(
    params: ScreenCaptureInput,
    result: ToolResult<ScreenCaptureOutput>
  ): Promise<VerificationResult> {
    if (!result.success || !result.data) {
      return {
        verified: false,
        status: 'FAILED',
        evidence: `Screen capture failed: ${result.error?.message}`,
      };
    }

    const fileExists = fs.existsSync(result.data.imagePath);
    const size = fileExists ? fs.statSync(result.data.imagePath).size : 0;
    const verified = fileExists && size > 0;

    return {
      verified,
      status: verified ? 'CONFIRMED' : 'FAILED',
      evidence: verified
        ? `Screenshot verified at '${result.data.imagePath}' (${size} bytes)`
        : `Screenshot file missing or zero bytes at '${result.data.imagePath}'`,
    };
  }
}

