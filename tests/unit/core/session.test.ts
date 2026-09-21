import { describe, it, expect } from 'vitest';
import { SessionManager } from '../../../core/session/SessionManager.js';
import { AuthenticationError } from '../../../core/errors/EvaError.js';

describe('SessionManager and Device Trust', () => {
  it('should register a device and issue a valid session token', () => {
    const manager = new SessionManager();
    const device = manager.registerDevice({
      deviceId: 'iphone-14-pro',
      deviceName: "Aman's iPhone",
      publicKey: 'ed25519_sample_key_12345',
    });

    expect(device.deviceId).toBe('iphone-14-pro');
    expect(device.revoked).toBe(false);

    const session = manager.createSession('iphone-14-pro');
    expect(session.sessionId).toBeDefined();
    expect(session.token.length).toBe(64); // 32 bytes hex
    expect(session.expiresAt).toBeGreaterThan(Date.now());

    const validated = manager.validateToken(session.token);
    expect(validated.sessionId).toBe(session.sessionId);
    expect(validated.deviceId).toBe('iphone-14-pro');
  });

  it('should reject unknown device session creation', () => {
    const manager = new SessionManager();
    expect(() => manager.createSession('unknown-device')).toThrow(AuthenticationError);
  });

  it('should reject invalid session tokens', () => {
    const manager = new SessionManager();
    expect(() => manager.validateToken('invalid-hex-token')).toThrow(AuthenticationError);
  });

  it('should reject expired session tokens', () => {
    const manager = new SessionManager({ sessionTtlMs: -1000 }); // Expired in the past
    manager.registerDevice({
      deviceId: 'dev-1',
      deviceName: 'Test Phone',
      publicKey: 'key1',
    });
    const session = manager.createSession('dev-1');

    expect(() => manager.validateToken(session.token)).toThrow('Session has expired');
  });

  it('should immediately invalidate active sessions when a device is revoked', () => {
    const manager = new SessionManager();
    manager.registerDevice({
      deviceId: 'stolen-phone',
      deviceName: 'Stolen iPhone',
      publicKey: 'key_stolen',
    });
    const session = manager.createSession('stolen-phone');

    // Valid prior to revocation
    expect(manager.validateToken(session.token)).toBeDefined();

    // Revoke device
    manager.revokeDevice('stolen-phone');

    // Should fail closed now
    expect(() => manager.validateToken(session.token)).toThrow();
  });
});

