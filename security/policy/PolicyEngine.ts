/**
 * EVA Deterministic Policy Engine
 * Conforms to EVA_AI_Implementation_Master_Spec Section 3.4 & 17
 */

import { RiskLevel } from '../../core/tools/ToolContract.js';
import * as crypto from 'node:crypto';

export type PolicyDecisionType = 'ALLOW' | 'REQUIRE_APPROVAL' | 'DENY';

export interface PolicyDecision {
  type: PolicyDecisionType;
  reason: string;
  approvalRequestId?: string;
  riskLevel: RiskLevel;
}

export interface PolicyEvaluationRequest {
  toolName: string;
  riskLevel: RiskLevel;
  parameters: Record<string, unknown>;
  sessionId: string;
  deviceId: string;
  workspaceRoot: string;
  approvalToken?: string;
}

export interface PendingApprovalRequest {
  requestId: string;
  toolName: string;
  parameters: Record<string, unknown>;
  riskLevel: RiskLevel;
  sessionId: string;
  deviceId: string;
  createdAt: number;
  expiresAt: number;
}

const FORBIDDEN_COMMAND_PATTERNS = [
  /\brm\s+-[a-zA-Z]*[rf][a-zA-Z]*\s+[\/\\]/i, // rm -rf /, rm -fr /Users, etc.
  /\bmkfs\b/i,
  /\bdd\s+if=/i,
  />\s*\/dev\/sd[a-z]/i,
  /\bchmod\s+-[a-zA-Z]*[rR][a-zA-Z]*\s+777\s+[\/\\]/i,
  /:\(\)\s*\{\s*:\|:&\s*\};:/, // Fork bomb :(){ :|:& };:
  /\bcurl\b.*\|\s*(?:ba)?sh\b/i, // Remote code execution piping to shell
  /\bwget\b.*\|\s*(?:ba)?sh\b/i,
  /\bnc\s+.*(?:-e|evil)/i, // Reverse shell / netcat exfiltration
  /\bcat\s+\/etc\/(?:passwd|shadow)/i, // Sensitive system file reading
];

export class PolicyEngine {
  private pendingApprovals: Map<string, PendingApprovalRequest> = new Map();
  private approvedTokens: Map<string, PendingApprovalRequest> = new Map();
  private approvalTimeoutMs: number;

  constructor(options?: { approvalTimeoutMs?: number }) {
    this.approvalTimeoutMs = options?.approvalTimeoutMs ?? 30 * 1000; // 30s
  }

  public evaluate(request: PolicyEvaluationRequest): PolicyDecision {
    // 1. Proactive Safety Checks on parameters
    if (request.toolName.startsWith('terminal.')) {
      const command = typeof request.parameters.command === 'string' ? request.parameters.command : '';
      for (const pattern of FORBIDDEN_COMMAND_PATTERNS) {
        if (pattern.test(command)) {
          return {
            type: 'DENY',
            reason: `Command matches strictly forbidden system destruction pattern: ${pattern.source}`,
            riskLevel: 'CRITICAL',
          };
        }
      }
    }

    // 2. Check if a valid approval token was supplied for SENSITIVE or CRITICAL actions
    if (request.approvalToken) {
      const approved = this.approvedTokens.get(request.approvalToken);
      if (approved && approved.toolName === request.toolName) {
        this.approvedTokens.delete(request.approvalToken); // One-time use token
        return {
          type: 'ALLOW',
          reason: 'Valid human approval token provided',
          riskLevel: request.riskLevel,
        };
      }
      return {
        type: 'DENY',
        reason: 'Invalid or expired approval token',
        riskLevel: request.riskLevel,
      };
    }

    // 3. Enforce Risk Tiers
    switch (request.riskLevel) {
      case 'READ':
        return {
          type: 'ALLOW',
          reason: 'Read-only operation permitted autonomously',
          riskLevel: 'READ',
        };

      case 'NORMAL':
        return {
          type: 'ALLOW',
          reason: 'Normal operational action permitted autonomously with audit',
          riskLevel: 'NORMAL',
        };

      case 'SENSITIVE':
      case 'CRITICAL': {
        const requestId = crypto.randomUUID();
        const now = Date.now();
        const pending: PendingApprovalRequest = {
          requestId,
          toolName: request.toolName,
          parameters: request.parameters,
          riskLevel: request.riskLevel,
          sessionId: request.sessionId,
          deviceId: request.deviceId,
          createdAt: now,
          expiresAt: now + this.approvalTimeoutMs,
        };
        this.pendingApprovals.set(requestId, pending);

        return {
          type: 'REQUIRE_APPROVAL',
          reason: `Action requires explicit human confirmation due to ${request.riskLevel} risk tier`,
          approvalRequestId: requestId,
          riskLevel: request.riskLevel,
        };
      }

      default:
        return {
          type: 'DENY',
          reason: 'Unknown risk classification - fail closed',
          riskLevel: 'CRITICAL',
        };
    }
  }

  public approve(requestId: string): string {
    const pending = this.pendingApprovals.get(requestId);
    if (!pending) {
      throw new Error(`Approval request not found: ${requestId}`);
    }
    if (Date.now() > pending.expiresAt) {
      this.pendingApprovals.delete(requestId);
      throw new Error(`Approval request has expired: ${requestId}`);
    }

    this.pendingApprovals.delete(requestId);
    const approvalToken = `appr_${crypto.randomBytes(24).toString('hex')}`;
    this.approvedTokens.set(approvalToken, pending);
    return approvalToken;
  }

  public reject(requestId: string): void {
    this.pendingApprovals.delete(requestId);
  }

  public getPendingApproval(requestId: string): PendingApprovalRequest | undefined {
    return this.pendingApprovals.get(requestId);
  }
}
