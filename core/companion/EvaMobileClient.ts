/**
 * EVA Mobile Companion Reference Client (Phase 21)
 * 
 * Reference client SDK for iOS SwiftUI URLSessionWebSocketTask integration
 * and automated testing of the WebSocket gateway protocol.
 */

import * as net from 'node:net';
import * as crypto from 'node:crypto';
import { EventEmitter } from 'node:events';

export interface MobileClientOptions {
  host?: string;
  port?: number;
  deviceId?: string;
  authToken?: string;
}

export class EvaMobileClient extends EventEmitter {
  private socket?: net.Socket;
  private host: string;
  private port: number;
  private deviceId?: string;
  private authToken?: string;
  private buffer = Buffer.alloc(0);
  private connected = false;
  private authenticated = false;

  constructor(options?: MobileClientOptions) {
    super();
    this.host = options?.host || '127.0.0.1';
    this.port = options?.port || 8765;
    this.deviceId = options?.deviceId;
    this.authToken = options?.authToken;
  }

  /**
   * Connects to the EVA Gateway and completes the RFC 6455 handshake
   */
  public async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: this.host, port: this.port }, () => {
        this.socket = socket;
        this.performHandshake(resolve, reject);
      });

      socket.on('error', (err) => {
        this.emit('error', err);
        reject(err);
      });

      socket.on('close', () => {
        this.connected = false;
        this.authenticated = false;
        this.emit('close');
      });
    });
  }

  /**
   * Sends WebSocket Upgrade request
   */
  private performHandshake(resolve: () => void, reject: (err: Error) => void): void {
    if (!this.socket) return;

    const wsKey = crypto.randomBytes(16).toString('base64');
    const handshakeReq = [
      `GET /ws HTTP/1.1`,
      `Host: ${this.host}:${this.port}`,
      `Upgrade: websocket`,
      `Connection: Upgrade`,
      `Sec-WebSocket-Key: ${wsKey}`,
      `Sec-WebSocket-Version: 13`,
      `\r\n`,
    ].join('\r\n');

    this.socket.write(handshakeReq);

    let handshakeResponse = '';
    const onData = (chunk: Buffer) => {
      handshakeResponse += chunk.toString('utf-8');
      if (handshakeResponse.includes('\r\n\r\n')) {
        this.socket?.removeListener('data', onData);

        if (handshakeResponse.startsWith('HTTP/1.1 101')) {
          this.connected = true;
          this.attachFrameReader();
          resolve();
        } else {
          reject(new Error(`WebSocket handshake failed: ${handshakeResponse.slice(0, 100)}`));
        }
      }
    };

    this.socket.on('data', onData);
  }

  /**
   * Listens and parses incoming unmasked server frames
   */
  private attachFrameReader(): void {
    if (!this.socket) return;

    this.socket.on('data', (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.parseServerFrames();
    });
  }

  /**
   * Parses server frames
   */
  private parseServerFrames(): void {
    while (this.buffer.length >= 2) {
      const firstByte = this.buffer[0];
      const secondByte = this.buffer[1];

      const opcode = firstByte & 0x0f;
      let payloadLength = secondByte & 0x7f;
      let offset = 2;

      if (payloadLength === 126) {
        if (this.buffer.length < 4) return;
        payloadLength = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (payloadLength === 127) {
        if (this.buffer.length < 10) return;
        payloadLength = Number(this.buffer.readBigUInt64BE(2));
        offset = 10;
      }

      if (this.buffer.length < offset + payloadLength) {
        return;
      }

      const payload = this.buffer.subarray(offset, offset + payloadLength);
      this.buffer = this.buffer.subarray(offset + payloadLength);

      if (opcode === 0x1) {
        // Text message
        try {
          const parsed = JSON.parse(payload.toString('utf-8'));
          this.handleServerMessage(parsed);
        } catch {
          // Ignore parse errors
        }
      } else if (opcode === 0x8) {
        this.socket?.end();
      }
    }
  }

  private handleServerMessage(msg: Record<string, unknown>): void {
    const type = msg.type as string;

    if (type === 'AUTH_SUCCESS') {
      this.authenticated = true;
      this.emit('auth_success', msg);
    } else if (type === 'AUTH_ERROR') {
      this.authenticated = false;
      this.emit('auth_error', msg);
    } else if (type === 'APPROVAL_REQUEST') {
      this.emit('approval_request', msg);
    } else if (type === 'EXECUTION_COMPLETE') {
      this.emit('execution_complete', msg);
    }

    this.emit('message', msg);
  }

  /**
   * Authenticates client using HMAC-SHA256 token and anti-replay nonce
   */
  public async authenticate(deviceId = this.deviceId, token = this.authToken): Promise<void> {
    if (!deviceId || !token) {
      throw new Error('Device ID and Auth Token are required for authentication');
    }

    const payload = {
      type: 'AUTH',
      deviceId,
      token,
      timestamp: Date.now(),
      nonce: crypto.randomBytes(8).toString('hex'),
    };

    this.sendJson(payload);
  }

  /**
   * Submits a voice goal remotely
   */
  public submitGoal(goal: string, speakAloud = false): void {
    this.sendJson({
      type: 'VOICE_GOAL',
      goal,
      speakAloud,
    });
  }

  /**
   * Sends biometric or user approval response
   */
  public respondToApproval(requestId: string, approved: boolean): void {
    this.sendJson({
      type: 'APPROVAL_RESPONSE',
      requestId,
      approved,
      biometricVerified: true,
      timestamp: Date.now(),
    });
  }

  /**
   * Writes a masked RFC 6455 frame to the server (client-to-server frames MUST be masked)
   */
  private sendJson(data: Record<string, unknown>): void {
    if (!this.socket || this.socket.destroyed) {
      throw new Error('Socket not connected');
    }

    const payload = Buffer.from(JSON.stringify(data), 'utf-8');
    const len = payload.length;

    let header: Buffer;
    let offset = 2;

    if (len <= 125) {
      header = Buffer.alloc(2 + 4);
      header[0] = 0x81; // FIN + text opcode
      header[1] = 0x80 | len; // Mask bit = 1
      offset = 2;
    } else if (len <= 65535) {
      header = Buffer.alloc(4 + 4);
      header[0] = 0x81;
      header[1] = 0x80 | 126;
      header.writeUInt16BE(len, 2);
      offset = 4;
    } else {
      header = Buffer.alloc(10 + 4);
      header[0] = 0x81;
      header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(len), 2);
      offset = 10;
    }

    // Generate random 4-byte mask
    const mask = crypto.randomBytes(4);
    mask.copy(header, offset);

    // Apply mask to payload
    const maskedPayload = Buffer.alloc(len);
    for (let i = 0; i < len; i++) {
      maskedPayload[i] = payload[i] ^ mask[i % 4];
    }

    this.socket.write(Buffer.concat([header, maskedPayload]));
  }

  public isConnected(): boolean {
    return this.connected;
  }

  public isAuthenticated(): boolean {
    return this.authenticated;
  }

  public disconnect(): void {
    if (this.socket) {
      this.socket.end();
      this.socket.destroy();
    }
  }
}
