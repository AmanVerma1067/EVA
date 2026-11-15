/**
 * EVA Production Companion Mobile Gateway (Phase 21)
 * 
 * Provides an encrypted RFC 6455 WebSocket gateway connecting iOS SwiftUI
 * companion apps and mobile clients to desktop EVA with:
 * - HMAC-SHA256 authenticated device handshake & anti-replay protection
 * - Remote Push-to-Talk (PTT) voice relay to desktop AgentBrain
 * - Remote Biometric Approval Interface for SENSITIVE & CRITICAL capability gates
 * - Live real-time token radar and system status streaming
 */

import * as http from 'node:http';
import * as net from 'node:net';
import * as crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { DevicePairingManager } from '../../security/pairing/DevicePairingManager.js';
import { AgentBrain, AgentGoalResponse } from '../planner/AgentBrain.js';
import { PolicyEngine } from '../../security/policy/PolicyEngine.js';
import { rootLogger } from '../logger/Logger.js';

export interface GatewayClient {
  id: string;
  socket: net.Socket;
  deviceId?: string;
  authenticated: boolean;
  connectedAt: number;
  lastPing: number;
}

export interface ApprovalBroadcastRequest {
  requestId: string;
  toolName: string;
  riskLevel: string;
  parameters: Record<string, unknown>;
  createdAt: number;
  timeoutMs: number;
}

export interface GatewayMessage {
  type: string;
  [key: string]: unknown;
}

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

export class WebSocketGateway extends EventEmitter {
  private clients = new Map<string, GatewayClient>();
  private pendingApprovalResolvers = new Map<string, (approved: boolean) => void>();
  private pairingManager: DevicePairingManager;
  private brain?: AgentBrain;
  private policyEngine?: PolicyEngine;
  private logger = rootLogger.child('gateway');
  private heartbeatInterval?: NodeJS.Timeout;

  constructor(options: {
    pairingManager: DevicePairingManager;
    brain?: AgentBrain;
    policyEngine?: PolicyEngine;
  }) {
    super();
    this.pairingManager = options.pairingManager;
    this.brain = options.brain;
    this.policyEngine = options.policyEngine;

    // Periodic heartbeat check
    this.heartbeatInterval = setInterval(() => {
      this.checkHeartbeats();
    }, 15000).unref();
  }

  /**
   * Attaches the WebSocket upgrade listener to an HTTP server
   */
  public attachToServer(server: http.Server): void {
    server.on('upgrade', (req, socket, head) => {
      this.handleUpgrade(req, socket as net.Socket, head);
    });
  }

  /**
   * Handles RFC 6455 WebSocket Handshake
   */
  public handleUpgrade(req: http.IncomingMessage, socket: net.Socket, head: Buffer): void {
    const key = req.headers['sec-websocket-key'];
    const upgrade = req.headers['upgrade'];

    if (!upgrade || upgrade.toLowerCase() !== 'websocket' || !key) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return;
    }

    // Compute accept hash
    const acceptKey = crypto
      .createHash('sha1')
      .update(key + WS_GUID)
      .digest('base64');

    const responseHeaders = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptKey}`,
      '\r\n',
    ].join('\r\n');

    socket.write(responseHeaders);

    const clientId = `client_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const client: GatewayClient = {
      id: clientId,
      socket,
      authenticated: false,
      connectedAt: Date.now(),
      lastPing: Date.now(),
    };

    this.clients.set(clientId, client);
    this.logger.info(`Companion WebSocket connection established: ${clientId}`);

    // Buffer incoming socket data
    let buffer = Buffer.alloc(0);

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      buffer = Buffer.from(this.parseFrames(client, buffer));
    });

    socket.on('close', () => {
      this.clients.delete(clientId);
      this.logger.info(`Companion WebSocket disconnected: ${clientId}`);
    });

    socket.on('error', (err) => {
      this.logger.warn(`Companion socket error [${clientId}]:`, { error: String(err) });
      this.clients.delete(clientId);
      socket.destroy();
    });

    // Enforce 5-second authentication timeout
    setTimeout(() => {
      if (this.clients.has(clientId) && !client.authenticated) {
        this.logger.warn(`Disconnecting unauthenticated companion: ${clientId}`);
        this.sendJson(client, { type: 'AUTH_TIMEOUT', message: 'Authentication handshake timed out (5s limit)' });
        socket.destroy();
        this.clients.delete(clientId);
      }
    }, 5000).unref();
  }

  /**
   * RFC 6455 Frame Parser
   */
  private parseFrames(client: GatewayClient, buffer: Buffer): Buffer {
    while (buffer.length >= 2) {
      const firstByte = buffer[0];
      const secondByte = buffer[1];

      const fin = (firstByte & 0x80) === 0x80;
      const opcode = firstByte & 0x0f;
      const isMasked = (secondByte & 0x80) === 0x80;
      let payloadLength = secondByte & 0x7f;

      let offset = 2;

      if (payloadLength === 126) {
        if (buffer.length < 4) return buffer;
        payloadLength = buffer.readUInt16BE(2);
        offset = 4;
      } else if (payloadLength === 127) {
        if (buffer.length < 10) return buffer;
        payloadLength = Number(buffer.readBigUInt64BE(2));
        offset = 10;
      }

      const maskLength = isMasked ? 4 : 0;
      const totalFrameLength = offset + maskLength + payloadLength;

      if (buffer.length < totalFrameLength) {
        // Incomplete frame, wait for more data
        return buffer;
      }

      let payload = buffer.subarray(offset + maskLength, totalFrameLength);

      if (isMasked) {
        const mask = buffer.subarray(offset, offset + 4);
        const unmasked = Buffer.alloc(payloadLength);
        for (let i = 0; i < payloadLength; i++) {
          unmasked[i] = payload[i] ^ mask[i % 4];
        }
        payload = unmasked;
      }

      buffer = Buffer.from(buffer.subarray(totalFrameLength));

      // Handle Opcode
      if (opcode === 0x1) {
        // Text message
        const text = payload.toString('utf-8');
        this.handleClientMessage(client, text);
      } else if (opcode === 0x8) {
        // Close frame
        client.socket.end();
        this.clients.delete(client.id);
        return buffer;
      } else if (opcode === 0x9) {
        // Ping
        client.lastPing = Date.now();
        this.sendFrame(client, 0x0a, payload); // Respond with Pong
      } else if (opcode === 0x0a) {
        // Pong
        client.lastPing = Date.now();
      }
    }

    return buffer;
  }

  /**
   * Dispatches and processes JSON messages from companion clients
   */
  private async handleClientMessage(client: GatewayClient, rawText: string): Promise<void> {
    try {
      const msg = JSON.parse(rawText) as GatewayMessage;

      switch (msg.type) {
        case 'AUTH':
          this.handleAuth(client, msg);
          break;

        case 'PING':
          client.lastPing = Date.now();
          this.sendJson(client, { type: 'PONG', timestamp: Date.now() });
          break;

        case 'VOICE_GOAL':
          await this.handleVoiceGoal(client, msg);
          break;

        case 'APPROVAL_RESPONSE':
          this.handleApprovalResponse(client, msg);
          break;

        case 'STATUS_QUERY':
          this.handleStatusQuery(client);
          break;

        default:
          this.sendJson(client, { type: 'ERROR', message: `Unknown message type: ${msg.type}` });
          break;
      }
    } catch (err: unknown) {
      this.sendJson(client, { type: 'ERROR', message: 'Failed to parse JSON message frame' });
    }
  }

  /**
   * Validates device authentication token and anti-replay headers
   */
  private handleAuth(client: GatewayClient, msg: GatewayMessage): void {
    const deviceId = typeof msg.deviceId === 'string' ? msg.deviceId : '';
    const token = typeof msg.token === 'string' ? msg.token : '';
    const timestamp = typeof msg.timestamp === 'number' ? msg.timestamp : 0;
    const nonce = typeof msg.nonce === 'string' ? msg.nonce : '';

    if (!deviceId || !token) {
      this.sendJson(client, { type: 'AUTH_ERROR', message: 'Missing deviceId or authToken' });
      client.socket.destroy();
      return;
    }

    // 1. Verify device is paired and authorized
    if (!this.pairingManager.isDeviceAuthorized(deviceId)) {
      this.sendJson(client, { type: 'AUTH_ERROR', message: 'Device not authorized or has been revoked' });
      client.socket.destroy();
      return;
    }

    // 2. Validate HMAC Token
    const tokenValidation = this.pairingManager.validateAuthToken(token);
    if (!tokenValidation.valid || tokenValidation.deviceId !== deviceId) {
      this.sendJson(client, { type: 'AUTH_ERROR', message: 'Invalid or forged authentication token' });
      client.socket.destroy();
      return;
    }

    // 3. Validate Anti-Replay Timestamp & Nonce
    if (timestamp && nonce) {
      const replayCheck = this.pairingManager.validateAntiReplay({
        deviceId,
        timestamp,
        nonce,
      });
      if (!replayCheck.valid) {
        this.sendJson(client, { type: 'AUTH_ERROR', message: `Anti-replay rejection: ${replayCheck.error}` });
        client.socket.destroy();
        return;
      }
    }

    client.authenticated = true;
    client.deviceId = deviceId;
    this.logger.info(`Companion authenticated successfully: ${deviceId} (client: ${client.id})`);

    this.sendJson(client, {
      type: 'AUTH_SUCCESS',
      deviceId,
      serverTime: Date.now(),
      message: 'Authenticated to EVA Desktop Gateway',
    });

    this.emit('client_authenticated', { clientId: client.id, deviceId });
  }

  /**
   * Executes a voice goal submitted remotely from mobile companion
   */
  private async handleVoiceGoal(client: GatewayClient, msg: GatewayMessage): Promise<void> {
    if (!client.authenticated || !client.deviceId) {
      this.sendJson(client, { type: 'ERROR', message: 'Authentication required' });
      return;
    }

    const goal = typeof msg.goal === 'string' ? msg.goal.trim() : '';
    if (!goal) {
      this.sendJson(client, { type: 'ERROR', message: 'Empty goal submitted' });
      return;
    }

    if (!this.brain) {
      this.sendJson(client, { type: 'ERROR', message: 'EVA runtime brain not attached to gateway' });
      return;
    }

    this.sendJson(client, {
      type: 'EXECUTION_START',
      goal,
      timestamp: Date.now(),
    });

    try {
      const res = await this.brain.executeGoal({
        goal,
        sessionId: `companion_session_${client.deviceId}`,
        deviceId: client.deviceId,
        speakResponse: msg.speakAloud === true,
        onApprovalRequired: async (approval) => {
          return this.requestRemoteApproval(approval);
        },
      });

      this.sendJson(client, {
        type: 'EXECUTION_COMPLETE',
        goal,
        success: res.success,
        responseText: res.responseText,
        spokenSummary: res.responseSpeech,
        stepsExecuted: res.executionResults.length,
      });
    } catch (err: unknown) {
      this.sendJson(client, {
        type: 'EXECUTION_ERROR',
        goal,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Broadcasts an approval request to paired companion and awaits biometric/user approval
   */
  public async requestRemoteApproval(approval: {
    toolName: string;
    riskLevel: string;
    parameters: Record<string, unknown>;
    requestId: string;
  }): Promise<boolean> {
    const payload: ApprovalBroadcastRequest = {
      requestId: approval.requestId,
      toolName: approval.toolName,
      riskLevel: approval.riskLevel,
      parameters: approval.parameters,
      createdAt: Date.now(),
      timeoutMs: 30000,
    };

    return new Promise<boolean>((resolve) => {
      // Store resolver
      const timer = setTimeout(() => {
        this.pendingApprovalResolvers.delete(approval.requestId);
        resolve(false);
      }, payload.timeoutMs);

      this.pendingApprovalResolvers.set(approval.requestId, (approved) => {
        clearTimeout(timer);
        this.pendingApprovalResolvers.delete(approval.requestId);
        resolve(approved);
      });

      // Broadcast to all authenticated companion clients
      this.broadcast({
        type: 'APPROVAL_REQUEST',
        ...payload,
      });
    });
  }

  /**
   * Handles approval response from mobile companion
   */
  private handleApprovalResponse(client: GatewayClient, msg: GatewayMessage): void {
    if (!client.authenticated) {
      this.sendJson(client, { type: 'ERROR', message: 'Authentication required' });
      return;
    }

    const requestId = typeof msg.requestId === 'string' ? msg.requestId : '';
    const approved = msg.approved === true;

    if (!requestId) {
      this.sendJson(client, { type: 'ERROR', message: 'Missing requestId' });
      return;
    }

    const resolver = this.pendingApprovalResolvers.get(requestId);
    if (resolver) {
      resolver(approved);
      this.sendJson(client, {
        type: 'APPROVAL_ACK',
        requestId,
        status: approved ? 'APPROVED' : 'DENIED',
      });
      this.logger.info(`Remote approval response processed: ${requestId} -> ${approved ? 'APPROVED' : 'DENIED'}`);
    } else {
      this.sendJson(client, { type: 'ERROR', message: `No pending approval found for requestId: ${requestId}` });
    }
  }

  /**
   * Responds with system health, token radar, and device pairing status
   */
  private handleStatusQuery(client: GatewayClient): void {
    if (!client.authenticated) {
      this.sendJson(client, { type: 'ERROR', message: 'Authentication required' });
      return;
    }

    this.sendJson(client, {
      type: 'STATUS_REPORT',
      serverTime: Date.now(),
      connectedClients: this.clients.size,
      authenticatedDevices: Array.from(this.clients.values())
        .filter((c) => c.authenticated)
        .map((c) => c.deviceId),
      memoryRssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    });
  }

  /**
   * Sends a JSON message framed for RFC 6455
   */
  public sendJson(client: GatewayClient, data: Record<string, unknown>): void {
    const payload = Buffer.from(JSON.stringify(data), 'utf-8');
    this.sendFrame(client, 0x01, payload);
  }

  /**
   * Broadcasts a JSON message to all authenticated companion clients
   */
  public broadcast(data: Record<string, unknown>): void {
    for (const client of this.clients.values()) {
      if (client.authenticated) {
        this.sendJson(client, data);
      }
    }
  }

  /**
   * Writes an RFC 6455 frame to the client socket (unmasked, server-to-client)
   */
  private sendFrame(client: GatewayClient, opcode: number, payload: Buffer): void {
    if (client.socket.destroyed || !client.socket.writable) {
      return;
    }

    const len = payload.length;
    let header: Buffer;

    if (len <= 125) {
      header = Buffer.alloc(2);
      header[0] = 0x80 | (opcode & 0x0f); // FIN + opcode
      header[1] = len; // Mask bit = 0
    } else if (len <= 65535) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | (opcode & 0x0f);
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | (opcode & 0x0f);
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }

    try {
      client.socket.write(Buffer.concat([header, payload]));
    } catch {
      // Handle socket write failure
    }
  }

  private checkHeartbeats(): void {
    const now = Date.now();
    for (const [id, client] of this.clients.entries()) {
      if (now - client.lastPing > 45000) {
        this.logger.warn(`Disconnecting stale companion client: ${id}`);
        client.socket.destroy();
        this.clients.delete(id);
      }
    }
  }

  public getConnectedClientsCount(): number {
    return Array.from(this.clients.values()).filter((c) => c.authenticated).length;
  }

  public getPendingApprovalsCount(): number {
    return this.pendingApprovalResolvers.size;
  }

  public stop(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    for (const client of this.clients.values()) {
      client.socket.destroy();
    }
    this.clients.clear();
  }
}
