import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { EvaDoctor } from '../../../core/health/EvaDoctor.js';
import { EvaHomeManager } from '../../../core/distribution/EvaHomeManager.js';

describe('EvaDoctor Health Diagnostic Subsystem', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const d of tempDirs.splice(0)) {
      try {
        fs.rmSync(d, { recursive: true, force: true });
      } catch {}
    }
  });

  it('runs diagnostics and outputs structured report', () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'eva-doctor-test-'));
    tempDirs.push(tempHome);
    const home = new EvaHomeManager(tempHome);
    home.initialize();

    const doctor = new EvaDoctor({ home });
    const report = doctor.runDiagnostics();

    expect(report.platform).toBeDefined();
    expect(report.checks.length).toBeGreaterThanOrEqual(10);
    expect(report.passedCount).toBeGreaterThan(0);
    expect(['PASS', 'WARN', 'FAIL']).toContain(report.overallStatus);

    const checkNames = report.checks.map((c) => c.name);
    expect(checkNames).toContain('Platform');
    expect(checkNames).toContain('EVA home');
    expect(checkNames).toContain('Node.js runtime');
    expect(checkNames).toContain('Capability Permissions');
    expect(checkNames).toContain('AI Providers & Routing');
    expect(checkNames).toContain('Storage');
  });

  it('warns when EVA home directory is not initialized', () => {
    const uninitializedPath = path.join(os.tmpdir(), `eva-uninit-${Date.now()}`);
    const home = new EvaHomeManager(uninitializedPath);
    const doctor = new EvaDoctor({ home });
    const report = doctor.runDiagnostics();

    const homeCheck = report.checks.find((c) => c.name === 'EVA home');
    expect(homeCheck).toBeDefined();
    expect(homeCheck?.status).toBe('WARN');
    expect(homeCheck?.remediation).toContain('eva setup');
  });
});
