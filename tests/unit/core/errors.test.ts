import { describe, it, expect } from 'vitest';
import {
  EvaError,
  SecurityError,
  PolicyViolationError,
  ValidationError,
  ToolExecutionError,
  TimeoutError,
  AuthenticationError,
  HumanApprovalRequiredError,
} from '../../../core/errors/EvaError.js';

describe('EvaError Hierarchy', () => {
  it('should instantiate EvaError with full failure classification', () => {
    const error = new EvaError('Base error', {
      code: 'TEST_ERROR',
      category: 'recoverable',
      recoverable: true,
      details: { param: 'foo' },
    });

    expect(error.message).toBe('Base error');
    expect(error.code).toBe('TEST_ERROR');
    expect(error.category).toBe('recoverable');
    expect(error.recoverable).toBe(true);
    expect(error.details).toEqual({ param: 'foo' });
    expect(error.timestamp).toBeGreaterThan(0);
    expect(error.toJSON()).toMatchObject({
      name: 'EvaError',
      code: 'TEST_ERROR',
      category: 'recoverable',
    });
  });

  it('should correctly classify SecurityError as non-recoverable security-related', () => {
    const error = new SecurityError('Unauthorized attempt', { ip: '1.2.3.4' });
    expect(error.code).toBe('SECURITY_VIOLATION');
    expect(error.category).toBe('security-related');
    expect(error.recoverable).toBe(false);
  });

  it('should correctly classify PolicyViolationError', () => {
    const error = new PolicyViolationError('Command blocked by policy', { command: 'rm -rf /' });
    expect(error.code).toBe('POLICY_VIOLATION');
    expect(error.category).toBe('security-related');
    expect(error.recoverable).toBe(false);
  });

  it('should correctly classify ValidationError as recoverable', () => {
    const error = new ValidationError('Invalid argument', { field: 'path' });
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.category).toBe('recoverable');
    expect(error.recoverable).toBe(true);
  });

  it('should handle HumanApprovalRequiredError with requestId', () => {
    const error = new HumanApprovalRequiredError('Approval needed', 'req-12345', { tool: 'fs.delete' });
    expect(error.code).toBe('HUMAN_APPROVAL_REQUIRED');
    expect(error.category).toBe('requires-human-input');
    expect(error.requestId).toBe('req-12345');
    expect(error.details.requestId).toBe('req-12345');
  });
});

