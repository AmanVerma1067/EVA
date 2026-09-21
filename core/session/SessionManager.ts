/**
 * EVA Session and Device Trust Manager
 * Conforms to EVA_AI_Implementation_Master_Spec Section 8 (Phase 2 & 3)
 */

import * as crypto from 'node:crypto';
import { AuthenticationError } from '../errors/EvaError.js';

export interface DeviceInfo {
  deviceId: string;
  deviceName: string;
  publicKey: string;
  pairedAt: number;
  revoked: boolean;
}

export interface Session {
  sessionId: string;
  deviceId: string;
  token: string;
  createdAt: number;
  expiresAt: number;
  lastActiveAt: number;
  revoked: boolean;
}

export interface SessionManagerOptions {
  sessionTtlMs?: number;
}

export class SessionManager {
  private devices: Map<string, DeviceInfo> = new Map();
  private sessions: Map<string, Session> = new Map();
  private tokenToSessionId: Map<string, string> = new Map();
  private sessionTtlMs: number;

  constructor(options?: SessionManagerOptions) {
    this.sessionTtlMs = options?.sessionTtlMs ?? 12 * 60 * 60 * 1000; // 12 hours
  }

  public registerDevice(device: Omit<DeviceInfo, 'pairedAt' | 'revoked'>): DeviceInfo {
    const deviceInfo: DeviceInfo = {
      ...device,
      pairedAt: Date.now(),
      revoked: false,
    };
    this.devices.set(device.deviceId, deviceInfo);
    return deviceInfo;
  }

  public revokeDevice(deviceId: string): void {
    const device = this.devices.get(deviceId);
    if (device) {
      device.revoked = true;
    }
    // Revoke all active sessions for this device
    for (const session of this.sessions.values()) {
      if (session.deviceId === deviceId) {
        session.revoked = true;
      }
    }
  }

  public createSession(deviceId: string): Session {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new AuthenticationError(`Unknown device: ${deviceId}`);
    }
    if (device.revoked) {
      throw new AuthenticationError(`Device has been revoked: ${deviceId}`);
    }

    const sessionId = crypto.randomUUID();
    const token = crypto.randomBytes(32).toString('hex');
    const now = Date.now();

    const session: Session = {
      sessionId,
      deviceId,
      token,
      createdAt: now,
      expiresAt: now + this.sessionTtlMs,
      lastActiveAt: now,
      revoked: false,
    };

    this.sessions.set(sessionId, session);
    this.tokenToSessionId.set(token, sessionId);
    return session;
  }

  public validateToken(token: string): Session {
    const sessionId = this.tokenToSessionId.get(token);
    if (!sessionId) {
      throw new AuthenticationError('Invalid session token');
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new AuthenticationError('Session not found');
    }

    if (session.revoked) {
      throw new AuthenticationError('Session has been revoked');
    }

    const now = Date.now();
    if (now > session.expiresAt) {
      session.revoked = true;
      throw new AuthenticationError('Session has expired');
    }

    const device = this.devices.get(session.deviceId);
    if (!device || device.revoked) {
      session.revoked = true;
      throw new AuthenticationError('Underlying device is revoked or missing');
    }

    session.lastActiveAt = now;
    return session;
  }

  public revokeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.revoked = true;
      this.tokenToSessionId.delete(session.token);
    }
  }

  public getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }
}

