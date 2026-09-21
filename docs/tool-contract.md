# EVA — Tool Contract Specification

## 1. Purpose

Every tool in EVA is a self-contained, typed, testable, and audited software module. No tool may execute arbitrary side-effects without conforming to this contract.

## 2. Universal Tool Interface

All tools implement the following TypeScript interface:

```typescript
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
    details?: unknown;
    category: 'RECOVERABLE' | 'NON_RECOVERABLE' | 'REQUIRES_HUMAN_INPUT' | 'SECURITY_VIOLATION';
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
  
  readonly inputSchema: z.ZodType<TInput>;
  readonly outputSchema: z.ZodType<TOutput>;

  /**
   * Executes the discrete tool action.
   */
  execute(params: TInput, ctx: ExecutionContext): Promise<ToolResult<TOutput>>;

  /**
   * Objectively verifies whether the action achieved its intended outcome.
   */
  verify(params: TInput, result: ToolResult<TOutput>, ctx: ExecutionContext): Promise<VerificationResult>;
}
```

## 3. Mandatory Invariants

1. **Schema Validation**:
   - Every input parameter MUST strictly match `inputSchema` via Zod before `execute()` is called.
   - Extra unrecognized fields MUST be stripped or rejected (`z.object({ ... }).strict()`).
2. **Timeouts**:
   - Every tool execution is bounded by `timeoutMs` (default 30,000ms max).
   - If execution exceeds `timeoutMs`, the process/operation is aborted immediately via `AbortSignal`.
3. **Structured Errors**:
   - Tools never throw raw unchecked exceptions to the caller. All failures return a structured `ToolResult` with error category classification.
4. **Objective Verification**:
   - Every tool defines a `verify()` method.
   - Example: Launching an application is verified by checking `pgrep` or running AppleScript to ensure process exists.
   - Example: Writing a file is verified by reading back the file and calculating its SHA-256 hash.
5. **No Secret Ingestion**:
   - Output data must not echo credentials, auth tokens, or private environment variables.

