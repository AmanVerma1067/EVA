import { afterEach, describe, expect, it } from 'vitest';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { EvaHomeManager } from '../../../core/distribution/EvaHomeManager.js';
import { ReleaseArtifact, ReleaseVerificationError, ReleaseVerifier } from '../../../core/distribution/ReleaseVerifier.js';
import { UpdateManager } from '../../../core/distribution/UpdateManager.js';

describe('release verification and update staging', () => {
  const directories: string[] = [];
  afterEach(() => directories.splice(0).forEach((directory) => fs.rmSync(directory, { recursive: true, force: true })));

  function signedArtifact(content = 'verified EVA release') {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'eva-release-'));
    directories.push(directory);
    const artifactPath = path.join(directory, 'eva.tar.gz');
    const body = Buffer.from(content);
    fs.writeFileSync(artifactPath, body);
    const keys = crypto.generateKeyPairSync('ed25519');
    const artifact: ReleaseArtifact = {
      name: 'eva.tar.gz', platform: 'darwin', arch: 'arm64',
      sha256: crypto.createHash('sha256').update(body).digest('hex'),
      signature: crypto.sign(null, body, keys.privateKey).toString('base64'),
    };
    return { directory, artifactPath, artifact, publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString() };
  }

  it('accepts an artifact only when both checksum and signature are valid', () => {
    const { artifactPath, artifact, publicKey } = signedArtifact();
    expect(() => new ReleaseVerifier().verifyArtifact(artifactPath, artifact, publicKey)).not.toThrow();
  });

  it('rejects tampered artifacts before installation', () => {
    const { artifactPath, artifact, publicKey } = signedArtifact();
    fs.appendFileSync(artifactPath, 'tampered');
    expect(() => new ReleaseVerifier().verifyArtifact(artifactPath, artifact, publicKey)).toThrow(ReleaseVerificationError);
  });

  it('stages a verified update and can roll it back', () => {
    const { directory, artifactPath, artifact, publicKey } = signedArtifact('new binary');
    const homePath = path.join(directory, 'home');
    const installTarget = path.join(directory, 'eva');
    fs.writeFileSync(installTarget, 'old binary');
    const updates = new UpdateManager(new EvaHomeManager(homePath));
    const staged = updates.stage('1.2.3', artifactPath, artifact, publicKey);
    const { backupPath } = updates.apply(staged, installTarget);
    expect(fs.readFileSync(installTarget, 'utf8')).toBe('new binary');
    updates.rollback(backupPath, installTarget);
    expect(fs.readFileSync(installTarget, 'utf8')).toBe('old binary');
  });
});
