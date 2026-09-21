/**
 * Stages only verified update artifacts and provides a bounded file-level rollback.
 * Downloading and release resolution deliberately live outside this component.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { EvaHomeManager } from './EvaHomeManager.js';
import { ReleaseArtifact, ReleaseVerifier } from './ReleaseVerifier.js';

export interface StagedUpdate {
  version: string;
  path: string;
  sha256: string;
}

export class UpdateManager {
  public constructor(private readonly home = new EvaHomeManager(), private readonly verifier = new ReleaseVerifier()) {}

  public stage(version: string, artifactPath: string, artifact: ReleaseArtifact, publicKeyPem: string): StagedUpdate {
    this.home.initialize();
    this.verifier.verifyArtifact(artifactPath, artifact, publicKeyPem);
    const stageDir = path.join(this.home.getDirectoryPath('cache'), 'updates', version);
    fs.mkdirSync(stageDir, { recursive: true, mode: 0o700 });
    const stagedPath = path.join(stageDir, artifact.name);
    fs.copyFileSync(artifactPath, stagedPath, fs.constants.COPYFILE_FICLONE);
    fs.chmodSync(stagedPath, 0o600);
    return { version, path: stagedPath, sha256: artifact.sha256 };
  }

  /** Applies an already staged update to one explicit regular file only. */
  public apply(staged: StagedUpdate, installTarget: string): { backupPath: string } {
    if (!fs.existsSync(staged.path) || !fs.statSync(staged.path).isFile()) throw new Error('Staged update is missing or invalid.');
    if (!fs.existsSync(installTarget) || !fs.statSync(installTarget).isFile()) throw new Error('Update target must be an existing regular file.');

    const actualChecksum = crypto.createHash('sha256').update(fs.readFileSync(staged.path)).digest('hex');
    if (actualChecksum !== staged.sha256.toLowerCase()) throw new Error('Staged update changed after verification.');

    const backupDir = path.join(this.home.getDirectoryPath('backups'), 'updates');
    fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
    const backupPath = path.join(backupDir, `${path.basename(installTarget)}.${Date.now()}.bak`);
    fs.copyFileSync(installTarget, backupPath, fs.constants.COPYFILE_FICLONE);
    try {
      fs.copyFileSync(staged.path, installTarget, fs.constants.COPYFILE_FICLONE);
    } catch (error) {
      fs.copyFileSync(backupPath, installTarget, fs.constants.COPYFILE_FICLONE);
      throw error;
    }
    return { backupPath };
  }

  public rollback(backupPath: string, installTarget: string): void {
    if (!fs.existsSync(backupPath) || !fs.statSync(backupPath).isFile()) throw new Error('Backup is missing or invalid.');
    if (!fs.existsSync(installTarget) || !fs.statSync(installTarget).isFile()) throw new Error('Update target must be an existing regular file.');
    fs.copyFileSync(backupPath, installTarget, fs.constants.COPYFILE_FICLONE);
  }
}
