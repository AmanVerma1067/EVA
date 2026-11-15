/**
 * EVA Companion Gateway Tools (Phase 21)
 * Provides companion.gateway_status and companion.remote_approve tools
 */

import { z } from 'zod';
import { ToolContract, RiskLevel, ToolResult, VerificationResult, ExecutionContext } from '../../core/tools/ToolContract.js';
import { DevicePairingManager } from '../../security/pairing/DevicePairingManager.js';
import { PolicyEngine } from '../../security/policy/PolicyEngine.js';
import { WebSocketGateway } from '../../core/companion/WebSocketGateway.js';

// ==========================================
// 1. companion.gateway_status
// ==========================================
export const CompanionStatusInputSchema = z.object({}).optional();
export type CompanionStatusInput = z.infer<typeof CompanionStatusInputSchema>;

export const CompanionStatusOutputSchema = z.object({
  online: z.boolean(),
  connectedClientsCount: z.number(),
  pendingApprovalsCount: z.number(),
  trustedDevicesCount: z.number(),
  devices: z.array(
    z.object({
      deviceId: z.string(),
      deviceName: z.string(),
      pairedAt: z.string(),
      revoked: z.boolean(),
    })
  ),
});
export type CompanionStatusOutput = z.infer<typeof CompanionStatusOutputSchema>;

export class CompanionStatusTool implements ToolContract<CompanionStatusInput, CompanionStatusOutput> {
  public readonly name = 'companion.gateway_status';
  public readonly version = '1.0.0';
  public readonly description = 'Inspects mobile companion gateway status, active WebSocket sessions, and pending remote approvals';
  public readonly riskLevel: RiskLevel = 'READ';
  public readonly timeoutMs = 5000;
  public readonly inputSchema = CompanionStatusInputSchema;
  public readonly outputSchema = CompanionStatusOutputSchema;

  private pairingManager: DevicePairingManager;
  private gateway?: WebSocketGateway;

  constructor(options?: { pairingManager?: DevicePairingManager; gateway?: WebSocketGateway }) {
    this.pairingManager = options?.pairingManager ?? new DevicePairingManager();
    this.gateway = options?.gateway;
  }

  public async execute(params: CompanionStatusInput, ctx: ExecutionContext): Promise<ToolResult<CompanionStatusOutput>> {
    const startTime = Date.now();
    try {
      const devices = this.pairingManager.getDevices().map((d) => ({
        deviceId: d.deviceId,
        deviceName: d.deviceName,
        pairedAt: d.pairedAt,
        revoked: d.revoked,
      }));

      const connectedClientsCount = this.gateway ? this.gateway.getConnectedClientsCount() : 0;
      const pendingApprovalsCount = this.gateway ? this.gateway.getPendingApprovalsCount() : 0;

      return {
        success: true,
        data: {
          online: true,
          connectedClientsCount,
          pendingApprovalsCount,
          trustedDevicesCount: devices.length,
          devices,
        },
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    } catch (err: unknown) {
      return {
        success: false,
        error: {
          code: 'GATEWAY_STATUS_ERROR',
          message: err instanceof Error ? err.message : String(err),
          category: 'recoverable',
        },
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    }
  }

  public async verify(params: CompanionStatusInput, result: ToolResult<CompanionStatusOutput>): Promise<VerificationResult> {
    if (!result.success || !result.data) {
      return { verified: false, status: 'FAILED', evidence: 'Failed to inspect gateway status' };
    }
    return {
      verified: true,
      status: 'CONFIRMED',
      evidence: `Gateway inspected: ${result.data.connectedClientsCount} connected client(s), ${result.data.trustedDevicesCount} paired device(s).`,
    };
  }
}

// ==========================================
// 2. companion.remote_approve
// ==========================================
export const RemoteApproveInputSchema = z.object({
  requestId: z.string().min(1),
  approved: z.boolean(),
  reason: z.string().optional(),
});
export type RemoteApproveInput = z.infer<typeof RemoteApproveInputSchema>;

export const RemoteApproveOutputSchema = z.object({
  requestId: z.string(),
  approved: z.boolean(),
  approvalToken: z.string().optional(),
  message: z.string(),
});
export type RemoteApproveOutput = z.infer<typeof RemoteApproveOutputSchema>;

export class RemoteApproveTool implements ToolContract<RemoteApproveInput, RemoteApproveOutput> {
  public readonly name = 'companion.remote_approve';
  public readonly version = '1.0.0';
  public readonly description = 'Remotely approves or rejects a pending human capability authorization request';
  public readonly riskLevel: RiskLevel = 'SENSITIVE';
  public readonly timeoutMs = 10000;
  public readonly inputSchema = RemoteApproveInputSchema;
  public readonly outputSchema = RemoteApproveOutputSchema;

  private policyEngine: PolicyEngine;

  constructor(options?: { policyEngine?: PolicyEngine }) {
    this.policyEngine = options?.policyEngine ?? new PolicyEngine();
  }

  public async execute(params: RemoteApproveInput, ctx: ExecutionContext): Promise<ToolResult<RemoteApproveOutput>> {
    const startTime = Date.now();
    try {
      if (params.approved) {
        const approvalToken = this.policyEngine.approve(params.requestId);
        return {
          success: true,
          data: {
            requestId: params.requestId,
            approved: true,
            approvalToken,
            message: `Request '${params.requestId}' approved successfully. Generated authorization token.`,
          },
          metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
        };
      } else {
        this.policyEngine.reject(params.requestId);
        return {
          success: true,
          data: {
            requestId: params.requestId,
            approved: false,
            message: `Request '${params.requestId}' rejected.`,
          },
          metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
        };
      }
    } catch (err: unknown) {
      return {
        success: false,
        error: {
          code: 'REMOTE_APPROVE_ERROR',
          message: err instanceof Error ? err.message : String(err),
          category: 'recoverable',
        },
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    }
  }

  public async verify(params: RemoteApproveInput, result: ToolResult<RemoteApproveOutput>): Promise<VerificationResult> {
    if (!result.success || !result.data) {
      return { verified: false, status: 'FAILED', evidence: 'Remote approval operation failed' };
    }
    return {
      verified: true,
      status: 'CONFIRMED',
      evidence: `Remote approval resolution: ${params.requestId} -> ${params.approved ? 'APPROVED' : 'REJECTED'}.`,
    };
  }
}
