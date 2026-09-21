import { z } from 'zod';
import * as path from 'node:path';
import { EvaHomeManager } from '../distribution/EvaHomeManager.js';

const DEFAULT_EVA_HOME = new EvaHomeManager().getBasePath();

export const ConfigSchema = z.object({
  environment: z.enum(['development', 'test', 'production']).default('development'),
  server: z.object({
    host: z.string().default('127.0.0.1'),
    port: z.number().int().min(1024).max(65535).default(8765),
    tlsEnabled: z.boolean().default(false),
  }).default({}),
  security: z.object({
    sessionTtlMs: z.number().int().positive().default(12 * 60 * 60 * 1000), // 12 hours
    pairingPinTtlMs: z.number().int().positive().default(5 * 60 * 1000), // 5 minutes
    maxApprovalWaitMs: z.number().int().positive().default(30 * 1000), // 30 seconds
    nonceWindowMs: z.number().int().positive().default(30 * 1000), // 30 seconds
  }).default({}),
  agent: z.object({
    maxTaskDurationMs: z.number().int().positive().default(10 * 60 * 1000), // 10 minutes
    maxToolCallsPerTask: z.number().int().positive().default(50),
    maxConsecutiveRetries: z.number().int().positive().default(3),
    toolTimeoutDefaultMs: z.number().int().positive().default(30 * 1000), // 30 seconds
  }).default({}),
  storage: z.object({
    dataDir: z.string().default(DEFAULT_EVA_HOME),
    auditLogPath: z.string().default(path.join(DEFAULT_EVA_HOME, 'audit', 'audit.log')),
    databasePath: z.string().default(path.join(DEFAULT_EVA_HOME, 'state', 'eva.sqlite')),
    trustedDevicesPath: z.string().default(path.join(DEFAULT_EVA_HOME, 'config', 'trusted_devices.json')),
  }).default({}),
  workspace: z.object({
    allowedRoots: z.array(z.string()).default([process.cwd()]),
  }).default({}),
});

export type EvaConfig = z.infer<typeof ConfigSchema>;

let currentConfig: EvaConfig | null = null;

export function loadConfig(overrides?: Partial<EvaConfig>): EvaConfig {
  const evaHome = new EvaHomeManager().getBasePath();
  const parsed = ConfigSchema.parse({
    environment: process.env.NODE_ENV ?? 'development',
    server: {
      host: process.env.EVA_HOST ?? '127.0.0.1',
      port: process.env.EVA_PORT ? parseInt(process.env.EVA_PORT, 10) : 8765,
    },
    storage: {
      dataDir: process.env.EVA_DATA_DIR ?? evaHome,
      auditLogPath: process.env.EVA_AUDIT_LOG ?? path.join(evaHome, 'audit', 'audit.log'),
      databasePath: process.env.EVA_DB ?? path.join(evaHome, 'state', 'eva.sqlite'),
      trustedDevicesPath: process.env.EVA_DEVICES ?? path.join(evaHome, 'config', 'trusted_devices.json'),
    },
    ...overrides,
  });

  currentConfig = parsed;
  return parsed;
}

export function getConfig(): EvaConfig {
  if (!currentConfig) {
    return loadConfig();
  }
  return currentConfig;
}
