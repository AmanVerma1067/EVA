/**
 * EVA Error Hierarchy and Failure Classification System
 * Conforms to EVA_AI_Implementation_Master_Spec Section 12
 */

export type FailureCategory =
  | 'recoverable'
  | 'non-recoverable'
  | 'requires-human-input'
  | 'security-related'
  | 'unknown';

export interface EvaErrorDetails {
  code: string;
  category: FailureCategory;
  details?: Record<string, unknown>;
  recoverable: boolean;
  context?: Record<string, unknown>;
}

export class EvaError extends Error {
  public readonly code: string;
  public readonly category: FailureCategory;
  public readonly details: Record<string, unknown>;
  public readonly recoverable: boolean;
  public readonly timestamp: number;

  constructor(message: string, options: EvaErrorDetails) {
    super(message);
    this.name = this.constructor.name;
    this.code = options.code;
    this.category = options.category;
    this.details = options.details ?? {};
    this.recoverable = options.recoverable;
    this.timestamp = Date.now();

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  public toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      category: this.category,
      recoverable: this.recoverable,
      timestamp: this.timestamp,
      details: this.details,
    };
  }
}

export class SecurityError extends EvaError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, {
      code: 'SECURITY_VIOLATION',
      category: 'security-related',
      recoverable: false,
      details,
    });
  }
}

export class PolicyViolationError extends EvaError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, {
      code: 'POLICY_VIOLATION',
      category: 'security-related',
      recoverable: false,
      details,
    });
  }
}

export class ValidationError extends EvaError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, {
      code: 'VALIDATION_FAILED',
      category: 'recoverable',
      recoverable: true,
      details,
    });
  }
}

export class ToolExecutionError extends EvaError {
  constructor(
    message: string,
    options?: {
      code?: string;
      category?: FailureCategory;
      recoverable?: boolean;
      details?: Record<string, unknown>;
    }
  ) {
    super(message, {
      code: options?.code ?? 'TOOL_EXECUTION_FAILED',
      category: options?.category ?? 'recoverable',
      recoverable: options?.recoverable ?? true,
      details: options?.details,
    });
  }
}

export class TimeoutError extends EvaError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, {
      code: 'OPERATION_TIMEOUT',
      category: 'recoverable',
      recoverable: true,
      details,
    });
  }
}

export class AuthenticationError extends EvaError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, {
      code: 'AUTHENTICATION_FAILED',
      category: 'security-related',
      recoverable: false,
      details,
    });
  }
}

export class HumanApprovalRequiredError extends EvaError {
  public readonly requestId: string;

  constructor(message: string, requestId: string, details?: Record<string, unknown>) {
    super(message, {
      code: 'HUMAN_APPROVAL_REQUIRED',
      category: 'requires-human-input',
      recoverable: true,
      details: { ...details, requestId },
    });
    this.requestId = requestId;
  }
}

