/**
 * EVA Home Directory & Data Retention Manager
 * Conforms to Section 7 & 8 of EVA Product Architecture, Distribution & Launch Spec
 * Manages the private application workspace layout, secure directory permissions (0o700),
 * and data retention/cleanup policies.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export const EVA_HOME_DIRECTORIES = [
  'config',
  'logs',
  'sessions',
  'plans',
  'memory',
  'cache',
  'artifacts',
  'tasks',
  'audit',
  'providers',
  'state',
  'backups',
  'workspace',
] as const;

export type EvaDirectoryName = (typeof EVA_HOME_DIRECTORIES)[number];

export interface StorageDirectoryStats {
  name: EvaDirectoryName;
  path: string;
  exists: boolean;
  fileCount: number;
  totalSizeBytes: number;
}

export interface EvaStorageSummary {
  basePath: string;
  totalSizeBytes: number;
  directories: StorageDirectoryStats[];
}

export class EvaHomeManager {
  private basePath: string;

  constructor(customBasePath?: string) {
    if (customBasePath) {
      this.basePath = customBasePath;
    } else if (process.env.EVA_HOME) {
      this.basePath = process.env.EVA_HOME;
    } else if (process.platform === 'linux' && process.env.XDG_DATA_HOME) {
      this.basePath = path.join(process.env.XDG_DATA_HOME, 'eva');
    } else if (process.platform === 'linux') {
      this.basePath = path.join(os.homedir(), '.local', 'share', 'eva');
    } else if (process.platform === 'darwin') {
      this.basePath = path.join(os.homedir(), 'Library', 'Application Support', 'EVA');
    } else {
      this.basePath = path.join(os.homedir(), '.eva');
    }
  }

  public getBasePath(): string {
    return this.basePath;
  }

  public getDirectoryPath(name: EvaDirectoryName): string {
    return path.join(this.basePath, name);
  }

  /**
   * Initializes all required EVA_HOME subdirectories with private per-user permissions (0o700)
   */
  public initialize(): { initialized: boolean; createdDirectories: string[] } {
    const createdDirectories: string[] = [];

    if (!fs.existsSync(this.basePath)) {
      fs.mkdirSync(this.basePath, { recursive: true, mode: 0o700 });
      createdDirectories.push(this.basePath);
    }
    fs.chmodSync(this.basePath, 0o700);

    for (const dirName of EVA_HOME_DIRECTORIES) {
      const dirPath = this.getDirectoryPath(dirName);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
        createdDirectories.push(dirPath);
      }
      fs.chmodSync(dirPath, 0o700);
    }

    return {
      initialized: true,
      createdDirectories,
    };
  }

  /**
   * Computes storage usage and file counts across all subdirectories
   */
  public getStorageStats(): EvaStorageSummary {
    let grandTotalBytes = 0;
    const dirStats: StorageDirectoryStats[] = [];

    for (const dirName of EVA_HOME_DIRECTORIES) {
      const dirPath = this.getDirectoryPath(dirName);
      if (!fs.existsSync(dirPath)) {
        dirStats.push({
          name: dirName,
          path: dirPath,
          exists: false,
          fileCount: 0,
          totalSizeBytes: 0,
        });
        continue;
      }

      let count = 0;
      let bytes = 0;

      const scan = (currentPath: string) => {
        try {
          const entries = fs.readdirSync(currentPath, { withFileTypes: true });
          for (const entry of entries) {
            const subPath = path.join(currentPath, entry.name);
            if (entry.isDirectory()) {
              scan(subPath);
            } else if (entry.isFile()) {
              count++;
              const stat = fs.statSync(subPath);
              bytes += stat.size;
            }
          }
        } catch {}
      };

      scan(dirPath);
      grandTotalBytes += bytes;

      dirStats.push({
        name: dirName,
        path: dirPath,
        exists: true,
        fileCount: count,
        totalSizeBytes: bytes,
      });
    }

    return {
      basePath: this.basePath,
      totalSizeBytes: grandTotalBytes,
      directories: dirStats,
    };
  }

  /**
   * Section 8 Data Retention: Clears short-lived cache directory
   */
  public clearCache(): { removedFiles: number; freedBytes: number } {
    const cacheDir = this.getDirectoryPath('cache');
    return this.deleteDirectoryContents(cacheDir);
  }

  /**
   * Section 8 Data Retention: Clears application logs
   */
  public clearLogs(): { removedFiles: number; freedBytes: number } {
    const logsDir = this.getDirectoryPath('logs');
    return this.deleteDirectoryContents(logsDir);
  }

  /**
   * Section 8 Data Retention: Prunes task directories older than retentionDays
   */
  public pruneOldTasks(retentionDays = 30): { prunedCount: number; freedBytes: number } {
    const tasksDir = this.getDirectoryPath('tasks');
    if (!fs.existsSync(tasksDir)) {
      return { prunedCount: 0, freedBytes: 0 };
    }

    const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    let prunedCount = 0;
    let freedBytes = 0;

    try {
      const entries = fs.readdirSync(tasksDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const taskPath = path.join(tasksDir, entry.name);
          const stat = fs.statSync(taskPath);
          if (stat.mtimeMs < cutoffMs) {
            const res = this.deleteDirectoryRecursive(taskPath);
            prunedCount++;
            freedBytes += res.freedBytes;
          }
        }
      }
    } catch {}

    return { prunedCount, freedBytes };
  }

  private deleteDirectoryContents(targetDir: string): { removedFiles: number; freedBytes: number } {
    if (!fs.existsSync(targetDir)) {
      return { removedFiles: 0, freedBytes: 0 };
    }

    let removedFiles = 0;
    let freedBytes = 0;

    try {
      const entries = fs.readdirSync(targetDir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(targetDir, entry.name);
        if (entry.isDirectory()) {
          const sub = this.deleteDirectoryRecursive(full);
          removedFiles += sub.removedFiles;
          freedBytes += sub.freedBytes;
        } else {
          const stat = fs.statSync(full);
          freedBytes += stat.size;
          fs.unlinkSync(full);
          removedFiles++;
        }
      }
    } catch {}

    return { removedFiles, freedBytes };
  }

  private deleteDirectoryRecursive(targetDir: string): { removedFiles: number; freedBytes: number } {
    let removedFiles = 0;
    let freedBytes = 0;

    try {
      const entries = fs.readdirSync(targetDir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(targetDir, entry.name);
        if (entry.isDirectory()) {
          const sub = this.deleteDirectoryRecursive(full);
          removedFiles += sub.removedFiles;
          freedBytes += sub.freedBytes;
        } else {
          const stat = fs.statSync(full);
          freedBytes += stat.size;
          fs.unlinkSync(full);
          removedFiles++;
        }
      }
      fs.rmdirSync(targetDir);
    } catch {}

    return { removedFiles, freedBytes };
  }
}
