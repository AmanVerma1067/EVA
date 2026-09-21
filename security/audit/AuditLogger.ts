/**
 * EVA Audit Logger — Tamper-Evident Structured Audit System
 * Conforms to EVA_AI_Implementation_Master_Spec Section 16
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { redactSecrets } from '../../core/logger/Logger.js';

export type AuditLifecycleState =
  | 'REQUESTED'
  | 'AUTHORIZED'
  | 'EXECUTED'
  | 'VERIFIED'
  | 'REJECTED'
  | 'FAILED';

export interface AuditRecord {
  id: string;
  timestamp: string;
  state: AuditLifecycleState;
  toolName: string;
  sessionId: string;
  deviceId: string;
  taskId: string;
  parameters?: Record<string, unknown>;
  decision?: 'ALLOW' | 'REQUIRE_APPROVAL' | 'DENY';
  decisionReason?: string;
  executionMetrics?: {
    durationMs: number;
    success: boolean;
  };
  verificationEvidence?: string;
  error?: string;
  previousHash: string;
  recordHash: string;
}

export interface AuditLoggerOptions {
  logFilePath?: string;
  sink?: (record: AuditRecord) => void;
}

export class AuditLogger {
  private logFilePath?: string;
  private sink?: (record: AuditRecord) => void;
  private lastHash: string = 'GENESIS_BLOCK';
  private inMemoryRecords: AuditRecord[] = [];

  constructor(options?: AuditLoggerOptions) {
    this.logFilePath = options?.logFilePath;
    this.sink = options?.sink;

    if (this.logFilePath) {
      const dir = path.dirname(this.logFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  private calculateHash(data: Omit<AuditRecord, 'recordHash'>): string {
    const payload = JSON.stringify({
      id: data.id,
      timestamp: data.timestamp,
      state: data.state,
      toolName: data.toolName,
      sessionId: data.sessionId,
      deviceId: data.deviceId,
      taskId: data.taskId,
      parameters: data.parameters,
      previousHash: data.previousHash,
    });
    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  public record(entry: {
    state: AuditLifecycleState;
    toolName: string;
    sessionId: string;
    deviceId: string;
    taskId: string;
    parameters?: Record<string, unknown>;
    decision?: 'ALLOW' | 'REQUIRE_APPROVAL' | 'DENY';
    decisionReason?: string;
    executionMetrics?: { durationMs: number; success: boolean };
    verificationEvidence?: string;
    error?: string;
  }): AuditRecord {
    const id = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    const sanitizedParams = entry.parameters
      ? (redactSecrets(entry.parameters) as Record<string, unknown>)
      : undefined;

    const partialRecord: Omit<AuditRecord, 'recordHash'> = {
      id,
      timestamp,
      state: entry.state,
      toolName: entry.toolName,
      sessionId: entry.sessionId,
      deviceId: entry.deviceId,
      taskId: entry.taskId,
      parameters: sanitizedParams,
      decision: entry.decision,
      decisionReason: entry.decisionReason,
      executionMetrics: entry.executionMetrics,
      verificationEvidence: entry.verificationEvidence,
      error: entry.error,
      previousHash: this.lastHash,
    };

    const recordHash = this.calculateHash(partialRecord);
    const fullRecord: AuditRecord = {
      ...partialRecord,
      recordHash,
    };

    this.lastHash = recordHash;
    this.inMemoryRecords.push(fullRecord);

    if (this.sink) {
      this.sink(fullRecord);
    }

    if (this.logFilePath) {
      try {
        fs.appendFileSync(this.logFilePath, JSON.stringify(fullRecord) + '\n', 'utf-8');
      } catch (err) {
        process.stderr.write(`Failed to write audit log: ${String(err)}\n`);
      }
    }

    return fullRecord;
  }

  public getRecords(): readonly AuditRecord[] {
    return this.inMemoryRecords;
  }

  public verifyChainIntegrity(): boolean {
    let prev = 'GENESIS_BLOCK';
    for (const rec of this.inMemoryRecords) {
      if (rec.previousHash !== prev) {
        return false;
      }
      const { recordHash, ...data } = rec;
      const expectedHash = this.calculateHash(data);
      if (recordHash !== expectedHash) {
        return false;
      }
      prev = recordHash;
    }
    return true;
  }
}

