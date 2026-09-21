/**
 * Product distribution lifecycle services: setup, inspection and health checks.
 * These operations are deliberately local and do not download or execute releases.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { EvaHomeManager, EvaStorageSummary } from './EvaHomeManager.js';
import { PlatformDetails, PlatformGuard } from './PlatformGuard.js';
import { EvaDoctor } from '../health/EvaDoctor.js';

export type HealthStatus = 'PASS' | 'WARN' | 'FAIL';

export interface HealthCheck {
  name: string;
  status: HealthStatus;
  detail: string;
  remediation?: string;
}

export interface SetupResult {
  platform: PlatformDetails;
  homePath: string;
  createdDirectories: string[];
  configPath: string;
  createdConfig: boolean;
}

export class DistributionService {
  public constructor(private readonly home = new EvaHomeManager()) {}

  public setup(): SetupResult {
    const platform = PlatformGuard.assertSupportedPlatform();
    const initialized = this.home.initialize();
    const configPath = path.join(this.home.getDirectoryPath('config'), 'settings.json');
    let createdConfig = false;
    if (!fs.existsSync(configPath)) {
      fs.writeFileSync(configPath, JSON.stringify({ version: 1, releaseChannel: 'stable' }, null, 2) + '\n', {
        encoding: 'utf8',
        mode: 0o600,
      });
      createdConfig = true;
    }
    fs.chmodSync(configPath, 0o600);
    return { platform, homePath: this.home.getBasePath(), createdDirectories: initialized.createdDirectories, configPath, createdConfig };
  }

  public doctor(): HealthCheck[] {
    const doctor = new EvaDoctor({ home: this.home });
    return doctor.runDiagnostics().checks;
  }

  public getStorage(): EvaStorageSummary {
    return this.home.getStorageStats();
  }

  public clearLogs(): { removedFiles: number; freedBytes: number } {
    return this.home.clearLogs();
  }

  public clearCache(): { removedFiles: number; freedBytes: number } {
    return this.home.clearCache();
  }

  private checkDirectory(): HealthCheck {
    const basePath = this.home.getBasePath();
    if (!fs.existsSync(basePath)) {
      return { name: 'EVA home', status: 'WARN', detail: `${basePath} has not been initialized`, remediation: 'Run `eva setup`.' };
    }
    try {
      const mode = fs.statSync(basePath).mode & 0o777;
      return {
        name: 'EVA home',
        status: mode === 0o700 ? 'PASS' : 'WARN',
        detail: `${basePath} (mode ${mode.toString(8)})`,
        remediation: mode === 0o700 ? undefined : 'Restrict the EVA home directory to the current user (chmod 700).',
      };
    } catch {
      return { name: 'EVA home', status: 'FAIL', detail: `Cannot inspect ${basePath}`, remediation: 'Check ownership and filesystem permissions.' };
    }
  }

  private checkCommand(command: string, name: string, required = true): HealthCheck {
    const found = spawnSync('which', [command], { encoding: 'utf8' });
    if (found.status === 0 && found.stdout.trim()) {
      return { name, status: 'PASS', detail: found.stdout.trim() };
    }
    return {
      name,
      status: required ? 'FAIL' : 'WARN',
      detail: `${command} is not available on PATH`,
      remediation: required ? `Install ${name} and rerun \`eva doctor\`.` : `Install ${name} to enable coding-agent coordination.`,
    };
  }
}
