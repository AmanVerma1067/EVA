/**
 * EVA Environment Inspector
 * Conforms to Section 5, 6, 18 of EVA Master Orchestration Spec
 * Non-intrusively discovers installed applications, running processes,
 * CLI tools in PATH, and Desktop projects on macOS.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface DiscoveredApp {
  name: string;
  appPath: string;
  bundleId?: string;
  isRunning?: boolean;
}

export interface DiscoveredCli {
  name: string;
  binaryPath: string;
}

export interface DiscoveredProject {
  name: string;
  path: string;
  hasPackageJson: boolean;
  hasGit: boolean;
}

export class EnvironmentInspector {
  private cachedApps: Map<string, DiscoveredApp> = new Map();
  private lastAppScanTime = 0;
  private readonly APP_CACHE_TTL_MS = 60000; // 1 min

  /**
   * Discovers installed macOS applications in /Applications and ~/Applications
   */
  public async getInstalledApps(): Promise<DiscoveredApp[]> {
    const now = Date.now();
    if (this.cachedApps.size > 0 && now - this.lastAppScanTime < this.APP_CACHE_TTL_MS) {
      return Array.from(this.cachedApps.values());
    }

    const appDirs = [
      '/Applications',
      path.join(os.homedir(), 'Applications'),
      '/System/Applications',
    ];

    const results: DiscoveredApp[] = [];

    for (const dir of appDirs) {
      try {
        if (!fs.existsSync(dir)) continue;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.endsWith('.app')) {
            const baseName = entry.name.replace(/\.app$/, '');
            const fullPath = path.join(dir, entry.name);
            let bundleId: string | undefined;

            // Optional info.plist inspection for bundleId
            try {
              const plistPath = path.join(fullPath, 'Contents', 'Info.plist');
              if (fs.existsSync(plistPath)) {
                // Quick regex search for CFBundleIdentifier
                const content = fs.readFileSync(plistPath, 'utf8');
                const match = content.match(/<key>CFBundleIdentifier<\/key>\s*<string>([^<]+)<\/string>/i);
                if (match && match[1]) {
                  bundleId = match[1].trim();
                }
              }
            } catch {}

            const appObj: DiscoveredApp = {
              name: baseName,
              appPath: fullPath,
              bundleId,
            };
            results.push(appObj);
            this.cachedApps.set(baseName.toLowerCase(), appObj);
            if (bundleId) {
              this.cachedApps.set(bundleId.toLowerCase(), appObj);
            }
          }
        }
      } catch {}
    }

    this.lastAppScanTime = now;
    return results;
  }

  /**
   * Finds an installed application by exact or fuzzy name
   */
  public async findApp(name: string): Promise<DiscoveredApp | undefined> {
    const lower = name.toLowerCase().trim();
    await this.getInstalledApps();

    // 1. Exact match in cache
    if (this.cachedApps.has(lower)) {
      return this.cachedApps.get(lower);
    }

    // 2. Prefix / partial match
    for (const [key, app] of this.cachedApps.entries()) {
      if (key === lower || key.startsWith(lower) || lower.startsWith(key)) {
        return app;
      }
    }

    // 3. Fallback to mdfind
    try {
      const { stdout } = await execFileAsync('mdfind', [`kMDItemKind == 'Application' && kMDItemFSName == '*${name}*.app'c`]);
      const lines = stdout.split('\n').map((l) => l.trim()).filter((l) => l.endsWith('.app'));
      if (lines.length > 0) {
        const foundPath = lines[0];
        const appName = path.basename(foundPath, '.app');
        return {
          name: appName,
          appPath: foundPath,
        };
      }
    } catch {}

    return undefined;
  }

  /**
   * Checks if an application or process is currently running
   */
  public async isAppRunning(appName: string, bundleId?: string): Promise<boolean> {
    const candidates = [appName];
    if (bundleId) candidates.push(bundleId);

    for (const cand of candidates) {
      try {
        const { stdout } = await execFileAsync('pgrep', ['-fi', cand]);
        if (stdout.trim().length > 0) return true;
      } catch {}
    }

    return false;
  }

  /**
   * Locates a CLI binary in PATH
   */
  public async findCli(binaryName: string): Promise<DiscoveredCli | undefined> {
    try {
      const { stdout } = await execFileAsync('which', [binaryName]);
      const binPath = stdout.trim();
      if (binPath && fs.existsSync(binPath)) {
        return { name: binaryName, binaryPath: binPath };
      }
    } catch {}

    // Common brew and local paths
    const fallbackDirs = ['/opt/homebrew/bin', '/usr/local/bin', path.join(os.homedir(), '.local', 'bin'), path.join(os.homedir(), '.cargo', 'bin')];
    for (const fDir of fallbackDirs) {
      const fullPath = path.join(fDir, binaryName);
      if (fs.existsSync(fullPath)) {
        return { name: binaryName, binaryPath: fullPath };
      }
    }

    return undefined;
  }

  /**
   * Discovers user projects on Desktop or workspace parent
   */
  public getDesktopProjects(): DiscoveredProject[] {
    const desktopDir = path.join(os.homedir(), 'Desktop');
    const projects: DiscoveredProject[] = [];

    const dirsToCheck = [desktopDir];
    const parent = path.dirname(process.cwd());
    if (path.basename(parent).toLowerCase() === 'desktop' && parent !== desktopDir) {
      dirsToCheck.push(parent);
    }

    for (const dDir of dirsToCheck) {
      try {
        if (fs.existsSync(dDir)) {
          const entries = fs.readdirSync(dDir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory() && !entry.name.startsWith('.')) {
              const pPath = path.join(dDir, entry.name);
              if (!projects.some((p) => p.name.toLowerCase() === entry.name.toLowerCase())) {
                projects.push({
                  name: entry.name,
                  path: pPath,
                  hasPackageJson: fs.existsSync(path.join(pPath, 'package.json')),
                  hasGit: fs.existsSync(path.join(pPath, '.git')),
                });
              }
            }
          }
        }
      } catch {}
    }

    return projects;
  }

  /**
   * Antigravity specific discovery on macOS
   */
  public async inspectAntigravity(): Promise<{
    app?: DiscoveredApp;
    cli?: DiscoveredCli;
    isRunning: boolean;
    recommendedStrategy: 'MACOS_APP_BUNDLE' | 'RUNNING_PROCESS_ACTIVATE' | 'TERMINAL_CLI' | 'NOT_FOUND';
  }> {
    const app = await this.findApp('Antigravity');
    const cli = (await this.findCli('agy')) || (await this.findCli('antigravity'));
    const isRunning = await this.isAppRunning('Antigravity', 'com.google.antigravity');

    let recommendedStrategy: 'MACOS_APP_BUNDLE' | 'RUNNING_PROCESS_ACTIVATE' | 'TERMINAL_CLI' | 'NOT_FOUND' = 'NOT_FOUND';
    if (isRunning) {
      recommendedStrategy = 'RUNNING_PROCESS_ACTIVATE';
    } else if (app) {
      recommendedStrategy = 'MACOS_APP_BUNDLE';
    } else if (cli) {
      recommendedStrategy = 'TERMINAL_CLI';
    }

    return {
      app,
      cli,
      isRunning,
      recommendedStrategy,
    };
  }
}
