/**
 * EVA Tool Router & Dispatch Pipeline
 * Conforms to EVA_AI_Implementation_Master_Spec Section 3.4, 8 & 16
 */

import { ToolRegistry } from './ToolRegistry.js';
import { PolicyEngine } from '../../security/policy/PolicyEngine.js';
import { AuditLogger } from '../../security/audit/AuditLogger.js';
import { ToolResult, VerificationResult, ExecutionContext } from './ToolContract.js';
import {
  ValidationError,
  PolicyViolationError,
  HumanApprovalRequiredError,
  TimeoutError,
  ToolExecutionError,
} from '../errors/EvaError.js';

export interface ToolDispatchInput {
  toolName: string;
  parameters: unknown;
  sessionId: string;
  deviceId: string;
  taskId: string;
  workspaceRoot?: string;
  approvalToken?: string;
}

export interface ToolDispatchOutput<T = unknown> {
  success: boolean;
  data?: T;
  verification?: VerificationResult;
  error?: {
    code: string;
    message: string;
    category: string;
    details?: unknown;
  };
  metrics: {
    durationMs: number;
    timestamp: number;
  };
}

export class ToolRouter {
  private registry: ToolRegistry;
  private policyEngine: PolicyEngine;
  private auditLogger: AuditLogger;

  constructor(options: {
    registry: ToolRegistry;
    policyEngine: PolicyEngine;
    auditLogger: AuditLogger;
  }) {
    this.registry = options.registry;
    this.policyEngine = options.policyEngine;
    this.auditLogger = options.auditLogger;
  }

  public async dispatch<T = unknown>(input: ToolDispatchInput): Promise<ToolDispatchOutput<T>> {
    const startTime = Date.now();
    const workspaceRoot = input.workspaceRoot ?? process.cwd();

    // 1. Audit Request Initiation
    this.auditLogger.record({
      state: 'REQUESTED',
      toolName: input.toolName,
      sessionId: input.sessionId,
      deviceId: input.deviceId,
      taskId: input.taskId,
      parameters: typeof input.parameters === 'object' && input.parameters !== null
        ? (input.parameters as Record<string, unknown>)
        : { raw: input.parameters },
    });

    // 2. Lookup Tool in Registry
    const tool = this.registry.get(input.toolName);
    if (!tool) {
      const errorMsg = `Tool not found: '${input.toolName}'`;
      this.auditLogger.record({
        state: 'REJECTED',
        toolName: input.toolName,
        sessionId: input.sessionId,
        deviceId: input.deviceId,
        taskId: input.taskId,
        error: errorMsg,
      });
      return {
        success: false,
        error: {
          code: 'TOOL_NOT_FOUND',
          message: errorMsg,
          category: 'non-recoverable',
        },
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    }

    // 3. Schema Validation via Zod
    const schemaValidation = tool.inputSchema.safeParse(input.parameters);
    if (!schemaValidation.success) {
      const validationIssues = schemaValidation.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
      const errorMsg = `Input parameter schema validation failed: ${validationIssues}`;

      this.auditLogger.record({
        state: 'REJECTED',
        toolName: input.toolName,
        sessionId: input.sessionId,
        deviceId: input.deviceId,
        taskId: input.taskId,
        error: errorMsg,
      });

      return {
        success: false,
        error: {
          code: 'VALIDATION_FAILED',
          message: errorMsg,
          category: 'recoverable',
          details: schemaValidation.error.errors,
        },
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    }

    const validatedParams = schemaValidation.data;

    // 4. Policy Engine Gate
    const policyDecision = this.policyEngine.evaluate({
      toolName: tool.name,
      riskLevel: tool.riskLevel,
      parameters: validatedParams,
      sessionId: input.sessionId,
      deviceId: input.deviceId,
      workspaceRoot,
      approvalToken: input.approvalToken,
    });

    if (policyDecision.type === 'DENY') {
      const errorMsg = `Policy denied tool execution: ${policyDecision.reason}`;
      this.auditLogger.record({
        state: 'REJECTED',
        toolName: tool.name,
        sessionId: input.sessionId,
        deviceId: input.deviceId,
        taskId: input.taskId,
        decision: 'DENY',
        decisionReason: policyDecision.reason,
        error: errorMsg,
      });

      return {
        success: false,
        error: {
          code: 'POLICY_DENIED',
          message: errorMsg,
          category: 'security-related',
        },
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    }

    if (policyDecision.type === 'REQUIRE_APPROVAL') {
      this.auditLogger.record({
        state: 'REJECTED',
        toolName: tool.name,
        sessionId: input.sessionId,
        deviceId: input.deviceId,
        taskId: input.taskId,
        decision: 'REQUIRE_APPROVAL',
        decisionReason: policyDecision.reason,
      });

      return {
        success: false,
        error: {
          code: 'HUMAN_APPROVAL_REQUIRED',
          message: policyDecision.reason,
          category: 'requires-human-input',
          details: { approvalRequestId: policyDecision.approvalRequestId },
        },
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    }

    // 5. Authorized - Audit AUTHORIZED
    this.auditLogger.record({
      state: 'AUTHORIZED',
      toolName: tool.name,
      sessionId: input.sessionId,
      deviceId: input.deviceId,
      taskId: input.taskId,
      decision: 'ALLOW',
      decisionReason: policyDecision.reason,
    });

    // 6. Execute with Timeout & AbortSignal
    const abortController = new AbortController();
    const timeoutTimer = setTimeout(() => {
      abortController.abort();
    }, tool.timeoutMs);

    const executionContext: ExecutionContext = {
      taskId: input.taskId,
      sessionId: input.sessionId,
      deviceId: input.deviceId,
      workspaceRoot,
      abortSignal: abortController.signal,
      approvalToken: input.approvalToken,
    };

    let executionResult: ToolResult<T>;
    try {
      executionResult = await tool.execute(validatedParams, executionContext);
    } catch (err: unknown) {
      clearTimeout(timeoutTimer);
      const isAborted = abortController.signal.aborted;
      const errorMsg = isAborted ? `Tool timed out after ${tool.timeoutMs}ms` : String(err);
      const category = isAborted ? 'recoverable' : 'non-recoverable';

      this.auditLogger.record({
        state: 'FAILED',
        toolName: tool.name,
        sessionId: input.sessionId,
        deviceId: input.deviceId,
        taskId: input.taskId,
        error: errorMsg,
        executionMetrics: { durationMs: Date.now() - startTime, success: false },
      });

      return {
        success: false,
        error: {
          code: isAborted ? 'OPERATION_TIMEOUT' : 'EXECUTION_EXCEPTION',
          message: errorMsg,
          category,
        },
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    } finally {
      clearTimeout(timeoutTimer);
    }

    // 7. Audit EXECUTED
    this.auditLogger.record({
      state: 'EXECUTED',
      toolName: tool.name,
      sessionId: input.sessionId,
      deviceId: input.deviceId,
      taskId: input.taskId,
      executionMetrics: {
        durationMs: executionResult.metrics.durationMs,
        success: executionResult.success,
      },
      error: executionResult.error?.message,
    });

    if (!executionResult.success) {
      return {
        success: false,
        error: executionResult.error,
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    }

    // 8. Verification Step
    let verification: VerificationResult;
    try {
      verification = await tool.verify(validatedParams, executionResult, executionContext);
    } catch (err) {
      verification = {
        verified: false,
        status: 'FAILED',
        evidence: `Verification threw error: ${String(err)}`,
      };
    }

    // 9. Audit VERIFIED
    this.auditLogger.record({
      state: 'VERIFIED',
      toolName: tool.name,
      sessionId: input.sessionId,
      deviceId: input.deviceId,
      taskId: input.taskId,
      verificationEvidence: verification.evidence,
    });

    return {
      success: verification.verified,
      data: executionResult.data,
      verification,
      metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
    };
  }
}

