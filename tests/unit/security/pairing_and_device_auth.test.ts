import { describe, it, expect, beforeEach } from 'vitest';
import { DevicePairingManager } from '../../../security/pairing/DevicePairingManager.js';
import * as path from 'node:path';

describe('Phase 3 — Device Pairing, Auth & Anti-Replay', () => {
  let pairingManager: DevicePairingManager;
  const testStorage = path.resolve(process.cwd(), '.eva/test_devices.json');

  beforeEach(() => {
    pairingManager = new DevicePairingManager({ storageFile: testStorage });
    pairingManager.reset();
  });

  it('should generate a 6-digit pairing code and approve device', () => {
    const code = pairingManager.createPairingRequest('phone-ios-123', 'iPhone 15 Pro');
    expect(code).toMatch(/^\d{6}$/);

    const device = pairingManager.approvePairing(code);
    expect(device).not.toBeNull();
    expect(device?.deviceId).toBe('phone-ios-123');
    expect(device?.revoked).toBe(false);
    expect(pairingManager.isDeviceAuthorized('phone-ios-123')).toBe(true);
  });

  it('should reject invalid or expired pairing codes', () => {
    const result = pairingManager.approvePairing('999999');
    expect(result).toBeNull();
  });

  it('should immediately disallow revoked devices from authorization', () => {
    pairingManager.registerTrustedDevice('phone-abc', 'Alice Phone');
    expect(pairingManager.isDeviceAuthorized('phone-abc')).toBe(true);

    const token = pairingManager.generateAuthToken('phone-abc');
    expect(pairingManager.validateAuthToken(token).valid).toBe(true);

    // Revoke
    pairingManager.revokeDevice('phone-abc');
    expect(pairingManager.isDeviceAuthorized('phone-abc')).toBe(false);

    // Token validation must now fail
    expect(pairingManager.validateAuthToken(token).valid).toBe(false);
  });

  it('should detect and reject replay attacks with duplicate nonces', () => {
    const now = Date.now();
    const nonce = 'unique-nonce-abc-1';

    const first = pairingManager.validateAntiReplay({
      deviceId: 'dev-1',
      timestamp: now,
      nonce,
    });
    expect(first.valid).toBe(true);

    // Replay with identical nonce
    const replay = pairingManager.validateAntiReplay({
      deviceId: 'dev-1',
      timestamp: now,
      nonce,
    });
    expect(replay.valid).toBe(false);
    expect(replay.error).toContain('Replay attack detected');
  });

  it('should reject requests with stale timestamps (clock drift > 30s)', () => {
    const staleTime = Date.now() - 40000; // 40s ago
    const res = pairingManager.validateAntiReplay({
      deviceId: 'dev-1',
      timestamp: staleTime,
      nonce: 'nonce-stale-1',
    });
    expect(res.valid).toBe(false);
    expect(res.error).toContain('clock drift');
  });
});
