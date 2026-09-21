import { describe, it, expect } from 'vitest';
import { AuditLogger } from '../../../security/audit/AuditLogger.js';

describe('AuditLogger and Tamper Evidence', () => {
  it('should record audit records with cryptographic SHA-256 hash chaining', () => {
    const logger = new AuditLogger();

    const r1 = logger.record({
      state: 'REQUESTED',
      toolName: 'fs.read',
      sessionId: 'sess-1',
      deviceId: 'dev-1',
      taskId: 'task-1',
      parameters: { path: 'README.md' },
    });

    const r2 = logger.record({
      state: 'AUTHORIZED',
      toolName: 'fs.read',
      sessionId: 'sess-1',
      deviceId: 'dev-1',
      taskId: 'task-1',
      decision: 'ALLOW',
      decisionReason: 'READ tier auto-allowed',
    });

    const r3 = logger.record({
      state: 'EXECUTED',
      toolName: 'fs.read',
      sessionId: 'sess-1',
      deviceId: 'dev-1',
      taskId: 'task-1',
      executionMetrics: { durationMs: 12, success: true },
    });

    const r4 = logger.record({
      state: 'VERIFIED',
      toolName: 'fs.read',
      sessionId: 'sess-1',
      deviceId: 'dev-1',
      taskId: 'task-1',
      verificationEvidence: 'Bytes verified',
    });

    expect(r1.previousHash).toBe('GENESIS_BLOCK');
    expect(r2.previousHash).toBe(r1.recordHash);
    expect(r3.previousHash).toBe(r2.recordHash);
    expect(r4.previousHash).toBe(r3.recordHash);

    expect(logger.verifyChainIntegrity()).toBe(true);
  });

  it('should redact secrets from logged parameters in audit records', () => {
    const logger = new AuditLogger();

    const rec = logger.record({
      state: 'REQUESTED',
      toolName: 'auth.login',
      sessionId: 'sess-1',
      deviceId: 'dev-1',
      taskId: 'task-1',
      parameters: {
        username: 'alice',
        password: 'SuperSecretPassword',
        bearerToken: 'Bearer abcdef1234567890',
      },
    });

    expect(rec.parameters?.username).toBe('alice');
    expect(rec.parameters?.password).toBe('[REDACTED]');
  });

  it('should detect tampering in audit records', () => {
    const logger = new AuditLogger();
    logger.record({
      state: 'REQUESTED',
      toolName: 'terminal.exec',
      sessionId: 'sess-1',
      deviceId: 'dev-1',
      taskId: 'task-1',
    });
    logger.record({
      state: 'AUTHORIZED',
      toolName: 'terminal.exec',
      sessionId: 'sess-1',
      deviceId: 'dev-1',
      taskId: 'task-1',
    });

    // Artificially tamper with the first record
    const records = logger.getRecords() as any[];
    records[0].toolName = 'tampered.tool';

    expect(logger.verifyChainIntegrity()).toBe(false);
  });
});

