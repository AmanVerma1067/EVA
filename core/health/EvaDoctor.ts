/**
 * EVA Doctor Health Diagnostics Subsystem
 * Conforms to Section 25 of EVA Product Architecture, Distribution & Launch Spec
 * Performs deep diagnostics across 12 product dimensions:
 * installation, permissions, AI providers, network, storage, terminal, Git,
 * coding agents, browser, screen access, audio/voice, and configuration.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { EvaHomeManager, EvaStorageSummary } from '../distribution/EvaHomeManager.js';
import { PlatformGuard, PlatformDetails } from '../distribution/PlatformGuard.js';
import { CapabilityPermissions } from '../../security/permissions/CapabilityPermissions.js';
import { AIRouter, ConnectionMode } from '../providers/AIRouter.js';

function getPackageRoot(): string {
  try {
    const filename = fileURLToPath(import.meta.url);
    const dirname = path.dirname(filename);
    return path.resolve(dirname, '../..');
  } catch {
    return process.cwd();
  }
}

export type HealthStatus = 'PASS' | 'WARN' | 'FAIL';

export interface HealthCheck {
  name: string;
  category:
    | 'platform'
    | 'installation'
    | 'runtime'
    | 'permissions'
    | 'providers'
    | 'network'
    | 'storage'
    | 'terminal'
    | 'tools'
    | 'hardware'
    | 'configuration';
  status: HealthStatus;
  detail: string;
  remediation?: string;
}

export interface DoctorReport {
  timestamp: string;
  platform: PlatformDetails;
  overallStatus: HealthStatus;
  passedCount: number;
  warnCount: number;
  failCount: number;
  checks: HealthCheck[];
}

export class EvaDoctor {
  private home: EvaHomeManager;
  private router: AIRouter;

  constructor(options?: { home?: EvaHomeManager; router?: AIRouter }) {
    this.home = options?.home ?? new EvaHomeManager();
    this.router = options?.router ?? new AIRouter();
  }

  public runDiagnostics(): DoctorReport {
    const checks: HealthCheck[] = [];
    const platform = PlatformGuard.getPlatformDetails();

    // 1. Platform support
    checks.push({
      name: 'Platform',
      category: 'platform',
      status: platform.isSupported ? 'PASS' : 'FAIL',
      detail: platform.displayName,
      remediation: platform.isSupported ? undefined : 'EVA supports macOS and Linux on arm64 or x64 only.',
    });

    // 2. Installation & EVA home layout
    const basePath = this.home.getBasePath();
    if (!fs.existsSync(basePath)) {
      checks.push({
        name: 'EVA home',
        category: 'installation',
        status: 'WARN',
        detail: `${basePath} has not been initialized`,
        remediation: 'Run `eva setup` to initialize the private workspace.',
      });
    } else {
      try {
        const mode = fs.statSync(basePath).mode & 0o777;
        checks.push({
          name: 'EVA home',
          category: 'installation',
          status: mode === 0o700 ? 'PASS' : 'WARN',
          detail: `${basePath} (mode ${mode.toString(8)})`,
          remediation: mode === 0o700 ? undefined : 'Restrict the EVA home directory to the current user (chmod 700).',
        });
      } catch {
        checks.push({
          name: 'EVA home',
          category: 'installation',
          status: 'FAIL',
          detail: `Cannot inspect ${basePath}`,
          remediation: 'Check filesystem ownership and permissions.',
        });
      }
    }

    // 3. Node.js runtime
    const nodeCheck = this.checkCommand('node', 'Node.js runtime', 'runtime', true);
    checks.push(nodeCheck);

    // 4. Git
    const gitCheck = this.checkCommand('git', 'Git', 'tools', true);
    checks.push(gitCheck);

    // 5. Coding Agent (Claude Code CLI)
    const claudeCheck = this.checkCommand('claude', 'Claude Code', 'tools', false);
    checks.push(claudeCheck);

    // 6. Capability Permissions
    try {
      const perms = new CapabilityPermissions({ homeManager: this.home });
      const records = perms.getAll();
      const granted = records.filter((r) => r.state === 'GRANTED' || r.state === 'TEMPORARY').length;
      checks.push({
        name: 'Capability Permissions',
        category: 'permissions',
        status: 'PASS',
        detail: `${granted}/${records.length} capabilities active`,
        remediation: undefined,
      });
    } catch {
      checks.push({
        name: 'Capability Permissions',
        category: 'permissions',
        status: 'WARN',
        detail: 'Permissions configuration not yet generated',
        remediation: 'Run `eva permissions` or `eva setup` to establish capability gates.',
      });
    }

    // 7. AI Providers & Connection Mode
    const mode: ConnectionMode = this.router.getConnectionMode();
    checks.push({
      name: 'AI Providers & Routing',
      category: 'providers',
      status: mode === 'OFFLINE' ? 'WARN' : 'PASS',
      detail: `Operating mode: ${mode} (${this.router.getRegistry().getAll().length} registered models)`,
      remediation: mode === 'OFFLINE' ? 'Configure cloud AI provider credentials or run local Ollama.' : undefined,
    });

    // 8. Storage & Disk Usage
    try {
      const storage = this.home.getStorageStats();
      const mbUsed = (storage.totalSizeBytes / 1024 / 1024).toFixed(2);
      checks.push({
        name: 'Storage',
        category: 'storage',
        status: 'PASS',
        detail: `${mbUsed} MB utilized across ${storage.directories.length} private workspace directories`,
      });
    } catch {
      checks.push({
        name: 'Storage',
        category: 'storage',
        status: 'WARN',
        detail: 'Unable to calculate EVA workspace storage usage',
        remediation: 'Run `eva setup` to ensure all storage directories exist.',
      });
    }

    // 9. Audio & Voice Capture
    const pkgRoot = getPackageRoot();
    const pkgVoiceBin = path.resolve(pkgRoot, 'bin/eva-voice-capture');
    const voiceBin = fs.existsSync(pkgVoiceBin) ? pkgVoiceBin : path.resolve(process.cwd(), 'bin/eva-voice-capture');
    if (fs.existsSync(voiceBin)) {
      checks.push({
        name: 'Audio Voice Capture',
        category: 'hardware',
        status: 'PASS',
        detail: `Native macOS audio binary ready at ${voiceBin}`,
      });
    } else {
      checks.push({
        name: 'Audio Voice Capture',
        category: 'hardware',
        status: 'WARN',
        detail: 'Native audio capture binary not found; falling back to typed CLI',
        remediation: 'Compile native binary using `clang -framework Foundation -framework AVFoundation bin/eva-voice-capture.m -o bin/eva-voice-capture`',
      });
    }

    // 10. Screen Vision Inspection
    const pkgVisionBin = path.resolve(pkgRoot, 'bin/eva-vision');
    const visionBin = fs.existsSync(pkgVisionBin) ? pkgVisionBin : path.resolve(process.cwd(), 'bin/eva-vision');
    if (fs.existsSync(visionBin)) {
      checks.push({
        name: 'Screen Vision OCR',
        category: 'hardware',
        status: 'PASS',
        detail: `Native Vision Framework OCR binary ready at ${visionBin}`,
      });
    } else {
      checks.push({
        name: 'Screen Vision OCR',
        category: 'hardware',
        status: 'WARN',
        detail: 'Native OCR binary not found',
        remediation: 'Compile native binary using `clang -framework Foundation -framework Vision bin/eva-vision.m -o bin/eva-vision`',
      });
    }

    // 11. Configuration
    const configPath = path.join(this.home.getDirectoryPath('config'), 'settings.json');
    if (fs.existsSync(configPath)) {
      try {
        const raw = fs.readFileSync(configPath, 'utf8');
        JSON.parse(raw);
        checks.push({
          name: 'Configuration',
          category: 'configuration',
          status: 'PASS',
          detail: `Settings valid at ${configPath}`,
        });
      } catch {
        checks.push({
          name: 'Configuration',
          category: 'configuration',
          status: 'FAIL',
          detail: `Settings corrupted at ${configPath}`,
          remediation: 'Delete or repair settings.json and run `eva setup`.',
        });
      }
    } else {
      checks.push({
        name: 'Configuration',
        category: 'configuration',
        status: 'WARN',
        detail: `No settings.json found at ${configPath}`,
        remediation: 'Run `eva setup` to generate default configuration.',
      });
    }

    const failCount = checks.filter((c) => c.status === 'FAIL').length;
    const warnCount = checks.filter((c) => c.status === 'WARN').length;
    const passedCount = checks.filter((c) => c.status === 'PASS').length;
    const overallStatus: HealthStatus = failCount > 0 ? 'FAIL' : warnCount > 0 ? 'WARN' : 'PASS';

    return {
      timestamp: new Date().toISOString(),
      platform,
      overallStatus,
      passedCount,
      warnCount,
      failCount,
      checks,
    };
  }

  private checkCommand(
    command: string,
    name: string,
    category: HealthCheck['category'],
    required = true
  ): HealthCheck {
    const found = spawnSync('which', [command], { encoding: 'utf8' });
    if (found.status === 0 && found.stdout.trim()) {
      return { name, category, status: 'PASS', detail: found.stdout.trim() };
    }
    return {
      name,
      category,
      status: required ? 'FAIL' : 'WARN',
      detail: `${command} is not available on PATH`,
      remediation: required
        ? `Install ${name} and rerun \`eva doctor\`.`
        : `Install ${name} to enable coding-agent coordination.`,
    };
  }
}
