import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { EvaHomeManager } from '../../../core/distribution/EvaHomeManager.js';
import { DistributionService } from '../../../core/distribution/DistributionService.js';
import { PlatformGuard, UnsupportedPlatformError } from '../../../core/distribution/PlatformGuard.js';

describe('distribution foundation', () => {
  const paths: string[] = [];

  afterEach(() => {
    for (const testPath of paths.splice(0)) fs.rmSync(testPath, { recursive: true, force: true });
  });

  it('rejects Windows before installation work begins', () => {
    expect(() => PlatformGuard.assertSupportedPlatform('win32', 'x64')).toThrow(UnsupportedPlatformError);
  });

  it('initializes the complete private EVA home layout', () => {
    const basePath = fs.mkdtempSync(path.join(os.tmpdir(), 'eva-home-'));
    paths.push(basePath);
    const home = new EvaHomeManager(basePath);
    const result = home.initialize();

    expect(result.initialized).toBe(true);
    expect(home.getStorageStats().directories).toHaveLength(13);
    expect(fs.statSync(home.getDirectoryPath('audit')).mode & 0o777).toBe(0o700);
  });

  it('creates a restricted first-run configuration without contacting a release service', () => {
    const basePath = fs.mkdtempSync(path.join(os.tmpdir(), 'eva-setup-'));
    paths.push(basePath);
    const service = new DistributionService(new EvaHomeManager(basePath));
    const result = service.setup();

    expect(fs.existsSync(result.configPath)).toBe(true);
    expect(fs.statSync(result.configPath).mode & 0o777).toBe(0o600);
    expect(JSON.parse(fs.readFileSync(result.configPath, 'utf8')).releaseChannel).toBe('stable');
  });

  it('reports an uninitialized home as actionable doctor output', () => {
    const basePath = path.join(os.tmpdir(), `eva-doctor-${Date.now()}-${Math.random()}`);
    paths.push(basePath);
    const checks = new DistributionService(new EvaHomeManager(basePath)).doctor();
    expect(checks.find((check) => check.name === 'EVA home')).toMatchObject({ status: 'WARN' });
  });
});
