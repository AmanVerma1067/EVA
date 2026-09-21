import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runCli } from '../../../src/cli.js';

describe('EVA CLI Subcommand Family', () => {
  let tempHome: string;
  const originalEnvHome = process.env.EVA_HOME;
  let logOutput: string[] = [];
  let errorOutput: string[] = [];

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'eva-cli-test-'));
    process.env.EVA_HOME = tempHome;
    logOutput = [];
    errorOutput = [];
    vi.spyOn(console, 'log').mockImplementation((...msgs) => {
      logOutput.push(msgs.join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...msgs) => {
      errorOutput.push(msgs.join(' '));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalEnvHome) {
      process.env.EVA_HOME = originalEnvHome;
    } else {
      delete process.env.EVA_HOME;
    }
    try {
      fs.rmSync(tempHome, { recursive: true, force: true });
    } catch {}
  });

  it('runs setup successfully', async () => {
    const code = await runCli(['setup']);
    expect(code).toBe(0);
    const combined = logOutput.join('\n');
    expect(combined).toContain('EVA private workspace initialized');
    expect(fs.existsSync(path.join(tempHome, 'config', 'settings.json'))).toBe(true);
  });

  it('runs doctor and outputs report', async () => {
    // Setup first
    await runCli(['setup']);
    logOutput = [];

    const code = await runCli(['doctor']);
    expect([0, 1]).toContain(code);
    const combined = logOutput.join('\n');
    expect(combined).toContain('EVA Diagnostics Report');
    expect(combined).toContain('Platform');
    expect(combined).toContain('EVA home');
  });

  it('runs status and reports storage and AI connection', async () => {
    await runCli(['setup']);
    logOutput = [];

    const code = await runCli(['status']);
    expect(code).toBe(0);
    const combined = logOutput.join('\n');
    expect(combined).toContain('EVA System Status:');
    expect(combined).toContain('Workspace Home:');
    expect(combined).toContain('AI Connection:');
  });

  it('manages permissions via CLI: list, grant, deny, revoke', async () => {
    await runCli(['setup']);
    logOutput = [];

    // List
    let code = await runCli(['permissions', 'list']);
    expect(code).toBe(0);
    expect(logOutput.join('\n')).toContain('SYSTEM_INFO');

    // Grant
    logOutput = [];
    code = await runCli(['permissions', 'grant', 'APPLICATION_CONTROL']);
    expect(code).toBe(0);
    expect(logOutput.join('\n')).toContain("Updated capability 'APPLICATION_CONTROL' state to GRANTED");

    // Deny
    logOutput = [];
    code = await runCli(['permissions', 'deny', 'APPLICATION_CONTROL']);
    expect(code).toBe(0);
    expect(logOutput.join('\n')).toContain("Updated capability 'APPLICATION_CONTROL' state to DENIED");

    // Revoke
    logOutput = [];
    code = await runCli(['permissions', 'revoke', 'APPLICATION_CONTROL']);
    expect(code).toBe(0);
    expect(logOutput.join('\n')).toContain("Updated capability 'APPLICATION_CONTROL' state to REVOKED");
  });

  it('lists models and tests dynamic routing via CLI', async () => {
    // Models list
    let code = await runCli(['models', 'list']);
    expect(code).toBe(0);
    expect(logOutput.join('\n')).toContain('Registered AI Models:');

    // Models test
    logOutput = [];
    code = await runCli(['models', 'test']);
    expect(code).toBe(0);
    expect(logOutput.join('\n')).toContain('Testing Dynamic AI Router');
    expect(logOutput.join('\n')).toContain('claude-3-5-haiku');
  });

  it('displays and updates config via CLI', async () => {
    await runCli(['setup']);
    logOutput = [];

    // Show
    let code = await runCli(['config', 'show']);
    expect(code).toBe(0);
    expect(logOutput.join('\n')).toContain('releaseChannel');

    // Set
    logOutput = [];
    code = await runCli(['config', 'set', 'customKey', 'testValue']);
    expect(code).toBe(0);

    // Get
    logOutput = [];
    code = await runCli(['config', 'get', 'customKey']);
    expect(code).toBe(0);
    expect(logOutput.join('\n')).toContain('testValue');
  });

  it('checks updates via CLI', async () => {
    const code = await runCli(['update', '--check']);
    expect(code).toBe(0);
    expect(logOutput.join('\n')).toContain('Checking for EVA updates');
  });

  it('displays help when requested or without command', async () => {
    const code = await runCli(['--help']);
    expect(code).toBe(0);
    expect(logOutput.join('\n')).toContain('EVA — Private Developer AI Operating Layer');
  });
});
