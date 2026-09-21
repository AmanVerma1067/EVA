/**
 * EVA Universal Tool Contract Interface
 * Conforms to EVA_AI_Implementation_Master_Spec Section 8 (Phase 2)
 */

import { z } from 'zod';

export type RiskLevel = 'READ' | 'NORMAL' | 'SENSITIVE' | 'CRITICAL';

export interface ExecutionContext {
  taskId: string;
  sessionId: string;
  deviceId: string;
  workspaceRoot: string;
  abortSignal: AbortSignal;
  approvalToken?: string;
}

export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    category: 'recoverable' | 'non-recoverable' | 'requires-human-input' | 'security-related';
    details?: Record<string, unknown>;
  };
  metrics: {
    durationMs: number;
    timestamp: number;
  };
}

export interface VerificationResult {
  verified: boolean;
  status: 'CONFIRMED' | 'FAILED' | 'PARTIAL';
  evidence: string;
}

export interface ToolContract<TInput = unknown, TOutput = unknown> {
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly riskLevel: RiskLevel;
  readonly timeoutMs: number;

  readonly inputSchema: z.ZodType<TInput, any, any>;
  readonly outputSchema: z.ZodType<TOutput, any, any>;

  execute(params: TInput, ctx: ExecutionContext): Promise<ToolResult<TOutput>>;
  verify(params: TInput, result: ToolResult<TOutput>, ctx: ExecutionContext): Promise<VerificationResult>;
}
