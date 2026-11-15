import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as http from 'node:http';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import { WebSocketGateway } from '../../../core/companion/WebSocketGateway.js';
import { EvaMobileClient } from '../../../core/companion/EvaMobileClient.js';
import { DevicePairingManager } from '../../../security/pairing/DevicePairingManager.js';
import { PolicyEngine } from '../../../security/policy/PolicyEngine.js';
import { CompanionStatusTool, RemoteApproveTool } from '../../../tools/developer/CompanionTools.js';
import { ExecutionContext } from '../../../core/tools/ToolContract.js';

describe('Phase 21: Production Companion Mobile App & WebSocket Gateway', () => {
  let server: http.Server;
  let gateway: WebSocketGateway;
  let pairingManager: DevicePairingManager;
  let policyEngine: PolicyEngine;
  let tempStorage: string;
  let port: number;

  beforeEach(async () => {
    tempStorage = path.join(os.tmpdir(), `eva-companion-test-${Date.now()}.json`);
    pairingManager = new DevicePairingManager({ storageFile: tempStorage });
    policyEngine = new PolicyEngine();
    gateway = new WebSocketGateway({ pairingManager, policyEngine });

    server = http.createServer((req, res) => {
      res.writeHead(200);
      res.end('OK');
    });

    gateway.attachToServer(server);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (typeof addr === 'object' && addr !== null) {
          port = addr.port;
        }
        resolve();
      });
    });
  });

  afterEach(async () => {
    gateway.stop();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    if (fs.existsSync(tempStorage)) {
      fs.rmSync(tempStorage, { force: true });
    }
  });

  describe('RFC 6455 Handshake & Authentication', () => {
    it('should complete RFC 6455 upgrade handshake and authenticate trusted device', async () => {
      const deviceId = 'iphone_aman_test';
      pairingManager.registerTrustedDevice(deviceId, 'Aman iPhone 16 Pro');
      const authToken = pairingManager.generateAuthToken(deviceId);

      const client = new EvaMobileClient({ port });
      await client.connect();
      expect(client.isConnected()).toBe(true);

      const authPromise = new Promise<void>((resolve) => {
        client.on('auth_success', () => resolve());
      });

      await client.authenticate(deviceId, authToken);
      await authPromise;

      expect(client.isAuthenticated()).toBe(true);
      expect(gateway.getConnectedClientsCount()).toBe(1);

      client.disconnect();
    });

    it('should reject unauthenticated device attempting connection with invalid token', async () => {
      const client = new EvaMobileClient({ port });
      await client.connect();

      const errorPromise = new Promise<string>((resolve) => {
        client.on('auth_error', (msg: any) => resolve(msg.message));
      });

      await client.authenticate('unknown_device', 'bad_token_hash');
      const errMsg = await errorPromise;

      expect(errMsg).toBeDefined();
      expect(client.isAuthenticated()).toBe(false);
      client.disconnect();
    });

    it('should block connection from revoked device', async () => {
      const deviceId = 'iphone_revoked';
      pairingManager.registerTrustedDevice(deviceId, 'Stolen iPhone');
      const token = pairingManager.generateAuthToken(deviceId);
      pairingManager.revokeDevice(deviceId);

      const client = new EvaMobileClient({ port });
      await client.connect();

      const errorPromise = new Promise<string>((resolve) => {
        client.on('auth_error', (msg: any) => resolve(msg.message));
      });

      await client.authenticate(deviceId, token);
      const errMsg = await errorPromise;

      expect(errMsg).toContain('not authorized or has been revoked');
      client.disconnect();
    });
  });

  describe('Remote Biometric Capability Approval Flow', () => {
    it('should push APPROVAL_REQUEST to companion and resolve promise when approved', async () => {
      const deviceId = 'iphone_biometric_user';
      pairingManager.registerTrustedDevice(deviceId, 'Aman iPhone');
      const authToken = pairingManager.generateAuthToken(deviceId);

      const client = new EvaMobileClient({ port });
      await client.connect();

      await new Promise<void>((resolve) => {
        client.on('auth_success', () => resolve());
        client.authenticate(deviceId, authToken);
      });

      // Listen for incoming approval request on companion
      client.on('approval_request', (req: any) => {
        expect(req.toolName).toBe('git.commit');
        expect(req.riskLevel).toBe('SENSITIVE');
        // Companion simulates user FaceID / biometric confirmation:
        client.respondToApproval(req.requestId, true);
      });

      // Desktop EVA triggers remote approval
      const approved = await gateway.requestRemoteApproval({
        requestId: 'req_sensitive_commit_1',
        toolName: 'git.commit',
        riskLevel: 'SENSITIVE',
        parameters: { message: 'feat: add phase 21' },
      });

      expect(approved).toBe(true);
      client.disconnect();
    });

    it('should handle rejection from companion', async () => {
      const deviceId = 'iphone_reject_user';
      pairingManager.registerTrustedDevice(deviceId, 'Aman iPhone');
      const authToken = pairingManager.generateAuthToken(deviceId);

      const client = new EvaMobileClient({ port });
      await client.connect();

      await new Promise<void>((resolve) => {
        client.on('auth_success', () => resolve());
        client.authenticate(deviceId, authToken);
      });

      // Companion user denies the sensitive action:
      client.on('approval_request', (req: any) => {
        client.respondToApproval(req.requestId, false);
      });

      const approved = await gateway.requestRemoteApproval({
        requestId: 'req_deny_action_1',
        toolName: 'terminal.exec',
        riskLevel: 'SENSITIVE',
        parameters: { command: 'rm unwanted.txt' },
      });

      expect(approved).toBe(false);
      client.disconnect();
    });
  });

  describe('Developer Companion Tools Dispatch', () => {
    const dummyCtx: ExecutionContext = {
      sessionId: 'sess-companion',
      deviceId: 'dev-companion',
      workspaceRoot: process.cwd(),
    };

    it('companion.gateway_status tool should execute and return status', async () => {
      const tool = new CompanionStatusTool({ pairingManager, gateway });
      const res = await tool.execute({}, dummyCtx);

      expect(res.success).toBe(true);
      expect(res.data?.online).toBe(true);
      expect(res.data?.connectedClientsCount).toBe(0);

      const verification = await tool.verify({}, res);
      expect(verification.verified).toBe(true);
    });

    it('companion.remote_approve tool should approve pending requests', async () => {
      // Create a pending approval in PolicyEngine
      const evalReq = {
        toolName: 'git.commit',
        riskLevel: 'SENSITIVE' as const,
        parameters: { message: 'test' },
        sessionId: 'sess-1',
        deviceId: 'dev-1',
        workspaceRoot: process.cwd(),
      };
      const decision = policyEngine.evaluate(evalReq);
      expect(decision.type).toBe('REQUIRE_APPROVAL');
      expect(decision.approvalRequestId).toBeDefined();

      const tool = new RemoteApproveTool({ policyEngine });
      const res = await tool.execute(
        {
          requestId: decision.approvalRequestId!,
          approved: true,
        },
        dummyCtx
      );

      expect(res.success).toBe(true);
      expect(res.data?.approved).toBe(true);
      expect(res.data?.approvalToken).toBeDefined();

      const verification = await tool.verify({ requestId: decision.approvalRequestId!, approved: true }, res);
      expect(verification.verified).toBe(true);
    });
  });
});
