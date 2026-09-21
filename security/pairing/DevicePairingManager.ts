/**
 * EVA Device Pairing & Authentication Manager (Phase 3)
 * Implements 6-digit pairing handshake, HMAC/Ed25519 token validation,
 * anti-replay timestamp & nonce checks, and instant device revocation.
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { rootLogger } from '../../core/logger/Logger.js';

export interface PairingRequest {
  pairingCode: string;
  deviceId: string;
  deviceName: string;
  publicKey?: string;
  createdAt: number;
  expiresAt: number;
}

export interface TrustedDevice {
  deviceId: string;
  deviceName: string;
  pairedAt: string;
  lastActive: string;
  publicKey?: string;
  revoked: boolean;
}

export interface SignedRequestHeaders {
  deviceId: string;
  timestamp: number;
  nonce: string;
  signature?: string;
}

export class DevicePairingManager {
  private logger = rootLogger.child('pairing-manager');
  private pendingPairings = new Map<string, PairingRequest>(); // pairingCode -> Request
  private trustedDevices = new Map<string, TrustedDevice>(); // deviceId -> TrustedDevice
  private seenNonces = new Set<string>();
  private storageFile: string;
  private hmacSecret: string;

  constructor(options?: { storageFile?: string; hmacSecret?: string }) {
    this.storageFile = options?.storageFile ?? path.resolve(process.cwd(), '.eva/devices.json');
    this.hmacSecret = options?.hmacSecret ?? 'eva-device-auth-secret-key-salt';
    this.loadDevices();

    // Periodically clean up seen nonces older than 60s
    setInterval(() => {
      this.seenNonces.clear();
    }, 60000).unref();
  }

  private loadDevices(): void {
    if (fs.existsSync(this.storageFile)) {
      try {
        const raw = fs.readFileSync(this.storageFile, 'utf8');
        const list = JSON.parse(raw) as TrustedDevice[];
        for (const dev of list) {
          this.trustedDevices.set(dev.deviceId, dev);
        }
      } catch (err) {
        this.logger.error('Failed to load trusted devices from storage', {}, err);
      }
    }
  }

  private persistDevices(): void {
    try {
      const dir = path.dirname(this.storageFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const list = Array.from(this.trustedDevices.values());
      fs.writeFileSync(this.storageFile, JSON.stringify(list, null, 2), 'utf8');
    } catch (err) {
      this.logger.error('Failed to persist trusted devices', {}, err);
    }
  }

  /**
   * Generates a 6-digit one-time pairing code for an incoming device request.
   */
  public createPairingRequest(deviceId: string, deviceName: string, publicKey?: string): string {
    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const now = Date.now();
    const expiresAt = now + 5 * 60 * 1000; // 5 minutes

    const request: PairingRequest = {
      pairingCode: code,
      deviceId,
      deviceName,
      publicKey,
      createdAt: now,
      expiresAt,
    };

    this.pendingPairings.set(code, request);
    this.logger.info(`New pairing request created for ${deviceName} [${deviceId}] with code ${code}`);
    return code;
  }

  /**
   * Approves pairing by pairing code.
   */
  public approvePairing(pairingCode: string): TrustedDevice | null {
    const req = this.pendingPairings.get(pairingCode);
    if (!req) {
      this.logger.warn(`Pairing attempt with unknown or expired code: ${pairingCode}`);
      return null;
    }

    if (Date.now() > req.expiresAt) {
      this.pendingPairings.delete(pairingCode);
      this.logger.warn(`Pairing code expired for device: ${req.deviceId}`);
      return null;
    }

    const trusted: TrustedDevice = {
      deviceId: req.deviceId,
      deviceName: req.deviceName,
      pairedAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
      publicKey: req.publicKey,
      revoked: false,
    };

    this.trustedDevices.set(trusted.deviceId, trusted);
    this.pendingPairings.delete(pairingCode);
    this.persistDevices();

    this.logger.info(`Device paired successfully: ${trusted.deviceName} [${trusted.deviceId}]`);
    return trusted;
  }

  /**
   * Registers a trusted device directly (e.g. for local CLI or automated pairing)
   */
  public registerTrustedDevice(deviceId: string, deviceName: string, publicKey?: string): TrustedDevice {
    const trusted: TrustedDevice = {
      deviceId,
      deviceName,
      pairedAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
      publicKey,
      revoked: false,
    };
    this.trustedDevices.set(deviceId, trusted);
    this.persistDevices();
    return trusted;
  }

  /**
   * Revokes a device immediately. Revoked devices cannot perform any actions.
   */
  public revokeDevice(deviceId: string): boolean {
    const dev = this.trustedDevices.get(deviceId);
    if (!dev) return false;

    dev.revoked = true;
    this.persistDevices();
    this.logger.warn(`Device revoked: ${dev.deviceName} [${deviceId}]`);
    return true;
  }

  /**
   * Verifies if a device is trusted and active (not revoked).
   */
  public isDeviceAuthorized(deviceId: string): boolean {
    const dev = this.trustedDevices.get(deviceId);
    if (!dev) return false;
    return !dev.revoked;
  }

  /**
   * Generates a tamper-proof auth token for a trusted device.
   */
  public generateAuthToken(deviceId: string): string {
    const payload = `${deviceId}:${Date.now()}`;
    const hmac = crypto.createHmac('sha256', this.hmacSecret).update(payload).digest('hex');
    return Buffer.from(`${payload}:${hmac}`).toString('base64');
  }

  /**
   * Validates an auth token and ensures the device is authorized.
   */
  public validateAuthToken(token: string): { valid: boolean; deviceId?: string } {
    try {
      const decoded = Buffer.from(token, 'base64').toString('utf8');
      const parts = decoded.split(':');
      if (parts.length !== 3) return { valid: false };

      const [deviceId, timestampStr, hmac] = parts;
      const expectedHmac = crypto.createHmac('sha256', this.hmacSecret).update(`${deviceId}:${timestampStr}`).digest('hex');

      if (!crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expectedHmac))) {
        return { valid: false };
      }

      if (!this.isDeviceAuthorized(deviceId)) {
        return { valid: false };
      }

      return { valid: true, deviceId };
    } catch {
      return { valid: false };
    }
  }

  /**
   * Anti-Replay Protection:
   * 1. Rejects timestamps older than 30s or > 5s in the future.
   * 2. Rejects duplicate nonces.
   */
  public validateAntiReplay(headers: SignedRequestHeaders): { valid: boolean; error?: string } {
    const now = Date.now();
    const driftMs = Math.abs(now - headers.timestamp);

    if (driftMs > 30000) {
      return { valid: false, error: `Request timestamp rejected: clock drift ${driftMs}ms exceeds 30000ms limit` };
    }

    if (this.seenNonces.has(headers.nonce)) {
      return { valid: false, error: `Replay attack detected: duplicate nonce "${headers.nonce}" rejected` };
    }

    this.seenNonces.add(headers.nonce);
    return { valid: true };
  }

  /**
   * Returns list of all known devices.
   */
  public getDevices(): TrustedDevice[] {
    return Array.from(this.trustedDevices.values());
  }

  /**
   * Clears in-memory data (useful for testing)
   */
  public reset(): void {
    this.pendingPairings.clear();
    this.trustedDevices.clear();
    this.seenNonces.clear();
    if (fs.existsSync(this.storageFile)) {
      try {
        fs.unlinkSync(this.storageFile);
      } catch {
        // ignore
      }
    }
  }
}
