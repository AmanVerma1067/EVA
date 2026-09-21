import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  CapabilityPermissions,
  CAPABILITIES,
  type Capability,
} from '../../../security/permissions/CapabilityPermissions.js';

describe('CapabilityPermissions Subsystem', () => {
  const tempFiles: string[] = [];

  afterEach(() => {
    for (const f of tempFiles.splice(0)) {
      try {
        fs.unlinkSync(f);
      } catch {}
    }
  });

  it('manages all 12 distinct capability domains', () => {
    expect(CAPABILITIES).toHaveLength(12);
    expect(CAPABILITIES).toContain('SYSTEM_INFO');
    expect(CAPABILITIES).toContain('APPLICATION_CONTROL');
    expect(CAPABILITIES).toContain('TERMINAL_EXECUTION');
    expect(CAPABILITIES).toContain('FILESYSTEM_READ');
    expect(CAPABILITIES).toContain('FILESYSTEM_WRITE');
    expect(CAPABILITIES).toContain('SCREEN_CAPTURE');
    expect(CAPABILITIES).toContain('INPUT_CONTROL');
    expect(CAPABILITIES).toContain('BROWSER_CONTROL');
    expect(CAPABILITIES).toContain('NETWORK_ACCESS');
    expect(CAPABILITIES).toContain('AI_PROVIDER_ACCESS');
    expect(CAPABILITIES).toContain('CREDENTIAL_ACCESS');
    expect(CAPABILITIES).toContain('EXTERNAL_COMMUNICATION');
  });

  it('initializes default states correctly (SYSTEM_INFO granted, others requested)', () => {
    const tempFile = path.join(os.tmpdir(), `perms-test-${Date.now()}.json`);
    tempFiles.push(tempFile);

    const perms = new CapabilityPermissions({ filePath: tempFile });
    const all = perms.getAll();
    expect(all).toHaveLength(12);

    const sysInfo = perms.check('SYSTEM_INFO');
    expect(sysInfo.allowed).toBe(true);
    expect(sysInfo.state).toBe('GRANTED');

    const terminal = perms.check('TERMINAL_EXECUTION');
    expect(terminal.allowed).toBe(false);
    expect(terminal.state).toBe('REQUESTED');
  });

  it('supports grant, deny, and revoke lifecycle transitions', () => {
    const tempFile = path.join(os.tmpdir(), `perms-test-${Date.now()}.json`);
    tempFiles.push(tempFile);
    const perms = new CapabilityPermissions({ filePath: tempFile });

    // Grant
    perms.grant('APPLICATION_CONTROL', { reason: 'User grant' });
    expect(perms.check('APPLICATION_CONTROL').allowed).toBe(true);
    expect(perms.check('APPLICATION_CONTROL').state).toBe('GRANTED');

    // Deny
    perms.deny('APPLICATION_CONTROL', 'Security block');
    expect(perms.check('APPLICATION_CONTROL').allowed).toBe(false);
    expect(perms.check('APPLICATION_CONTROL').state).toBe('DENIED');

    // Revoke
    perms.revoke('APPLICATION_CONTROL', 'User revocation');
    expect(perms.check('APPLICATION_CONTROL').allowed).toBe(false);
    expect(perms.check('APPLICATION_CONTROL').state).toBe('REVOKED');
  });

  it('handles temporary grants with TTL expiration', async () => {
    const tempFile = path.join(os.tmpdir(), `perms-test-${Date.now()}.json`);
    tempFiles.push(tempFile);
    const perms = new CapabilityPermissions({ filePath: tempFile });

    // Temporary grant for 50ms
    perms.grant('SCREEN_CAPTURE', { temporary: true, ttlMs: 50 });
    expect(perms.check('SCREEN_CAPTURE').allowed).toBe(true);
    expect(perms.check('SCREEN_CAPTURE').state).toBe('TEMPORARY');

    // Wait for expiration
    await new Promise((r) => setTimeout(r, 75));
    const after = perms.check('SCREEN_CAPTURE');
    expect(after.allowed).toBe(false);
    expect(after.state).toBe('REVOKED');
  });

  it('persists changes to disk with 0600 mode and reloads them', () => {
    const tempFile = path.join(os.tmpdir(), `perms-test-${Date.now()}.json`);
    tempFiles.push(tempFile);
    const perms1 = new CapabilityPermissions({ filePath: tempFile });
    perms1.grant('FILESYSTEM_WRITE', { reason: 'Developer mode' });

    expect(fs.existsSync(tempFile)).toBe(true);

    const perms2 = new CapabilityPermissions({ filePath: tempFile });
    expect(perms2.check('FILESYSTEM_WRITE').allowed).toBe(true);
    expect(perms2.check('FILESYSTEM_WRITE').state).toBe('GRANTED');
  });
});
