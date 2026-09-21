/**
 * EVA Screen Vision & Visual Inspection Tool (Phase 9)
 * Uses native Apple Vision Framework OCR (VNRecognizeTextRequest)
 * to extract on-screen text, buttons, and visual state without cloud APIs.
 */

import { z } from 'zod';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';
import { ToolContract, RiskLevel, ToolResult, VerificationResult, ExecutionContext } from '../../core/tools/ToolContract.js';

const execFileAsync = promisify(execFile);

export function resolveDefaultVisionBinary(): string {
  try {
    const filename = fileURLToPath(import.meta.url);
    const dirname = path.dirname(filename);
    const pkgCandidate = path.resolve(dirname, '../../bin/eva-vision');
    if (fs.existsSync(pkgCandidate)) {
      return pkgCandidate;
    }
  } catch {}
  return path.resolve(process.cwd(), 'bin/eva-vision');
}

export const ScreenInspectInputSchema = z.object({
  imagePath: z.string().optional(),
  query: z.string().optional(),
});
export type ScreenInspectInput = z.infer<typeof ScreenInspectInputSchema>;

export const ScreenInspectOutputSchema = z.object({
  elements: z.array(
    z.object({
      text: z.string(),
      confidence: z.number(),
      x: z.number().optional(),
      y: z.number().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
    })
  ),
  detectedTextCount: z.number(),
  allText: z.string(),
  matchingElements: z.array(z.string()).optional(),
});
export type ScreenInspectOutput = z.infer<typeof ScreenInspectOutputSchema>;

export class ScreenVisionTool implements ToolContract<ScreenInspectInput, ScreenInspectOutput> {
  public readonly name = 'screen.inspect';
  public readonly version = '1.0.0';
  public readonly description = 'Inspects screen image using Apple Vision OCR to extract text and UI elements';
  public readonly riskLevel: RiskLevel = 'READ';
  public readonly timeoutMs = 15000;
  public readonly inputSchema = ScreenInspectInputSchema;
  public readonly outputSchema = ScreenInspectOutputSchema;

  private binaryPath: string;
  private runner?: (imagePath: string) => Promise<ScreenInspectOutput['elements']>;

  constructor(options?: {
    binaryPath?: string;
    runner?: (imagePath: string) => Promise<ScreenInspectOutput['elements']>;
  }) {
    this.binaryPath = options?.binaryPath ?? resolveDefaultVisionBinary();
    this.runner = options?.runner;
  }

  public getBinaryPath(): string {
    return this.binaryPath;
  }

  public async execute(params: ScreenInspectInput, ctx: ExecutionContext): Promise<ToolResult<ScreenInspectOutput>> {
    const startTime = Date.now();
    let tempFile: string | null = null;
    let targetImage = params.imagePath;

    try {
      if (this.runner) {
        const elements = await this.runner(targetImage || '/dummy/path.png');
        const allText = elements.map((e) => e.text).join('\n');
        const matches = params.query
          ? elements
              .filter((e) => e.text.toLowerCase().includes(params.query!.toLowerCase()))
              .map((e) => e.text)
          : undefined;
        return {
          success: true,
          data: {
            elements,
            detectedTextCount: elements.length,
            allText,
            matchingElements: matches,
          },
          metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
        };
      }

      // If no image provided, capture live desktop screen to OS temporary directory
      if (!targetImage || !fs.existsSync(targetImage)) {
        tempFile = path.join(os.tmpdir(), `eva_vision_${Date.now()}.png`);
        await execFileAsync('screencapture', ['-x', tempFile], { signal: ctx.abortSignal });
        targetImage = tempFile;
      }

      const { stdout } = await execFileAsync(this.binaryPath, [targetImage], { signal: ctx.abortSignal });
      let elements: ScreenInspectOutput['elements'] = [];
      try {
        elements = JSON.parse(stdout.trim() || '[]');
      } catch {
        elements = [];
      }

      if (tempFile && fs.existsSync(tempFile)) {
        try {
          fs.unlinkSync(tempFile);
        } catch {}
      }

      const allText = elements.map((e) => e.text).join('\n');
      const matches = params.query
        ? elements
            .filter((e) => e.text.toLowerCase().includes(params.query!.toLowerCase()))
            .map((e) => e.text)
        : undefined;

      return {
        success: true,
        data: {
          elements,
          detectedTextCount: elements.length,
          allText: allText.substring(0, 4000),
          matchingElements: matches,
        },
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    } catch (err) {
      if (tempFile && fs.existsSync(tempFile)) {
        try {
          fs.unlinkSync(tempFile);
        } catch {}
      }

      return {
        success: false,
        error: { code: 'SCREEN_INSPECT_FAILED', message: String(err), category: 'recoverable' },
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    }
  }

  public async verify(params: ScreenInspectInput, result: ToolResult<ScreenInspectOutput>): Promise<VerificationResult> {
    return {
      verified: result.success,
      status: result.success ? 'CONFIRMED' : 'FAILED',
      evidence: result.success
        ? `Visual inspection complete (${result.data?.detectedTextCount ?? 0} elements extracted).`
        : (result.error?.message ?? 'Visual inspection failed.'),
    };
  }
}
