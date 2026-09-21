/** Secure release artifact verification for installers and update staging. */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';

export interface ReleaseArtifact {
  name: string;
  platform: 'darwin' | 'linux';
  arch: 'arm64' | 'x64';
  sha256: string;
  signature: string;
}

export interface ReleaseManifest {
  version: string;
  channel: 'stable' | 'beta' | 'nightly';
  artifacts: ReleaseArtifact[];
  publishedAt: string;
}

export class ReleaseVerificationError extends Error {
  public readonly code = 'RELEASE_VERIFICATION_FAILED';
  constructor(message: string) {
    super(message);
    this.name = 'ReleaseVerificationError';
  }
}

export class ReleaseVerifier {
  public verifyArtifact(artifactPath: string, artifact: ReleaseArtifact, publicKeyPem: string): void {
    if (!fs.existsSync(artifactPath)) throw new ReleaseVerificationError(`Artifact does not exist: ${artifactPath}`);
    if (!/^[a-f0-9]{64}$/i.test(artifact.sha256)) throw new ReleaseVerificationError('Release manifest has an invalid SHA-256 checksum.');
    if (!artifact.signature) throw new ReleaseVerificationError('Release manifest is missing the required artifact signature.');

    const content = fs.readFileSync(artifactPath);
    const checksum = crypto.createHash('sha256').update(content).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(checksum), Buffer.from(artifact.sha256.toLowerCase()))) {
      throw new ReleaseVerificationError('Artifact SHA-256 checksum does not match the signed release manifest.');
    }

    let signature: Buffer;
    try {
      signature = Buffer.from(artifact.signature, 'base64');
    } catch {
      throw new ReleaseVerificationError('Release artifact signature is not valid base64.');
    }
    const valid = crypto.verify(null, content, publicKeyPem, signature);
    if (!valid) throw new ReleaseVerificationError('Artifact signature verification failed. Installation was not performed.');
  }

  public readManifest(manifestPath: string): ReleaseManifest {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as ReleaseManifest;
      if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest.version)) throw new Error('invalid version');
      if (!['stable', 'beta', 'nightly'].includes(manifest.channel)) throw new Error('invalid channel');
      if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length === 0) throw new Error('no artifacts');
      return manifest;
    } catch (error) {
      if (error instanceof ReleaseVerificationError) throw error;
      throw new ReleaseVerificationError(`Invalid release manifest: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
