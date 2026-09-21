/**
 * EVA Capability-Based Permission Subsystem
 * Conforms to Section 10 of EVA Product Architecture, Distribution & Launch Spec
 * Manages explicit, capability-based security boundaries across 12 distinct domains.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { EvaHomeManager } from '../../core/distribution/EvaHomeManager.js';

export const CAPABILITIES = [
  'SYSTEM_INFO',
  'APPLICATION_CONTROL',
  'TERMINAL_EXECUTION',
  'FILESYSTEM_READ',
  'FILESYSTEM_WRITE',
  'SCREEN_CAPTURE',
  'INPUT_CONTROL',
  'BROWSER_CONTROL',
  'NETWORK_ACCESS',
  'AI_PROVIDER_ACCESS',
  'CREDENTIAL_ACCESS',
  'EXTERNAL_COMMUNICATION',
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export type PermissionState = 'REQUESTED' | 'GRANTED' | 'DENIED' | 'TEMPORARY' | 'REVOKED';

export interface PermissionRecord {
  capability: Capability;
  state: PermissionState;
  grantedAt?: number;
  expiresAt?: number;
  reason?: string;
}

export class CapabilityPermissions {
  private filePath: string;
  private permissions: Map<Capability, PermissionRecord> = new Map();

  constructor(options?: { filePath?: string; homeManager?: EvaHomeManager }) {
    if (options?.filePath) {
      this.filePath = options.filePath;
    } else {
      const home = options?.homeManager ?? new EvaHomeManager();
      this.filePath = path.join(home.getDirectoryPath('config'), 'permissions.json');
    }
    this.load();
  }

  private load(): void {
    // Initialize default states (baseline: READ and SYSTEM_INFO default granted, others REQUESTED)
    for (const cap of CAPABILITIES) {
      this.permissions.set(cap, {
        capability: cap,
        state: cap === 'SYSTEM_INFO' ? 'GRANTED' : 'REQUESTED',
        grantedAt: cap === 'SYSTEM_INFO' ? Date.now() : undefined,
      });
    }

    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const data = JSON.parse(raw);
        if (Array.isArray(data)) {
          for (const item of data) {
            if (item.capability && this.permissions.has(item.capability)) {
              this.permissions.set(item.capability, item);
            }
          }
        }
      }
    } catch {}
  }

  private save(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      }
      const records = Array.from(this.permissions.values());
      fs.writeFileSync(this.filePath, JSON.stringify(records, null, 2), { encoding: 'utf8', mode: 0o600 });
    } catch {}
  }

  public grant(
    capability: Capability,
    options?: { temporary?: boolean; ttlMs?: number; reason?: string }
  ): PermissionRecord {
    const isTemp = options?.temporary ?? false;
    const now = Date.now();
    const record: PermissionRecord = {
      capability,
      state: isTemp ? 'TEMPORARY' : 'GRANTED',
      grantedAt: now,
      expiresAt: isTemp && options?.ttlMs ? now + options.ttlMs : undefined,
      reason: options?.reason ?? (isTemp ? 'Temporary human authorization' : 'Human administrator grant'),
    };

    this.permissions.set(capability, record);
    this.save();
    return record;
  }

  public deny(capability: Capability, reason?: string): PermissionRecord {
    const record: PermissionRecord = {
      capability,
      state: 'DENIED',
      grantedAt: Date.now(),
      reason: reason ?? 'Explicitly denied by policy',
    };

    this.permissions.set(capability, record);
    this.save();
    return record;
  }

  public revoke(capability: Capability, reason?: string): PermissionRecord {
    const record: PermissionRecord = {
      capability,
      state: 'REVOKED',
      grantedAt: Date.now(),
      reason: reason ?? 'Access revoked by user',
    };

    this.permissions.set(capability, record);
    this.save();
    return record;
  }

  public check(capability: Capability): { allowed: boolean; state: PermissionState; reason: string } {
    const record = this.permissions.get(capability);
    if (!record) {
      return { allowed: false, state: 'DENIED', reason: 'Unknown capability' };
    }

    // Check expiry for temporary permissions
    if (record.state === 'TEMPORARY' && record.expiresAt && Date.now() > record.expiresAt) {
      this.revoke(capability, 'Temporary permission expired');
      return { allowed: false, state: 'REVOKED', reason: 'Temporary grant has expired' };
    }

    const allowed = record.state === 'GRANTED' || record.state === 'TEMPORARY';
    return {
      allowed,
      state: record.state,
      reason: record.reason ?? `Capability state: ${record.state}`,
    };
  }

  public getAll(): PermissionRecord[] {
    return Array.from(this.permissions.values());
  }

  public reset(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        fs.unlinkSync(this.filePath);
      }
    } catch {}
    this.load();
  }
}

