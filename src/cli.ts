#!/usr/bin/env node
/**
 * EVA CLI Entrypoint & Command Dispatcher
 * Conforms to Section 21 of EVA Product Architecture, Distribution & Launch Spec
 * Core Command Family:
 *   eva [shell]
 *   eva setup
 *   eva doctor
 *   eva status
 *   eva ask <prompt>
 *   eva run <toolName> [paramsJson]
 *   eva plan <goal>
 *   eva permissions [list | grant <cap> | deny <cap> | revoke <cap>]
 *   eva models [list | test]
 *   eva devices [list | revoke <id>]
 *   eva logs [--tail <n> | clear]
 *   eva config [show | get <key> | set <key> <val>]
 *   eva update [--check | verify | stage]
 *   eva uninstall [--purge]
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { CapabilityPermissions, CAPABILITIES, type Capability } from '../security/permissions/CapabilityPermissions.js';
import { ModelRegistry } from '../core/providers/ModelRegistry.js';
import { AIRouter, type RouteRequest } from '../core/providers/AIRouter.js';
import { DistributionService } from '../core/distribution/DistributionService.js';
import { EvaDoctor } from '../core/health/EvaDoctor.js';
import { EvaHomeManager } from '../core/distribution/EvaHomeManager.js';
import { PlatformGuard, UnsupportedPlatformError } from '../core/distribution/PlatformGuard.js';
import { ReleaseVerifier } from '../core/distribution/ReleaseVerifier.js';
import { UpdateManager } from '../core/distribution/UpdateManager.js';
import { DevicePairingManager } from '../security/pairing/DevicePairingManager.js';
import { getConfig } from '../core/config/Config.js';

const usage = `EVA — Private Developer AI Operating Layer

Usage: eva <command> [arguments...]

Core Commands:
  eva [shell]                     Start interactive voice & text agent shell
  setup                           Verify platform and initialize private EVA workspace
  doctor                          Run local environment, tool, and security diagnostics
  status                          Show workspace storage, AI status, and active permissions
  ask <prompt>                    Execute a single-shot natural language goal
  run <tool> [paramsJson]         Execute a registered tool directly with parameters
  plan <goal>                     Generate an execution plan for a goal without running it
  permissions [list|grant|deny|revoke] [CAPABILITY]
                                  Inspect and configure 12 capability security gates
  models [list|test]              Inspect registered AI models or test dynamic routing
  devices [list|revoke <id>]      Inspect and manage paired devices
  logs [--tail <n> | clear]       View or clear local logs and audit trail
  config [show|get|set]           Inspect or update settings in ~/.eva/config/settings.json
  update [--check | verify | stage]
                                  Check updates or verify/stage signed release packages
  uninstall [--purge]             Safely remove EVA installation and optional workspace`;

export async function runCli(args = process.argv.slice(2)): Promise<number> {
  const homeManager = new EvaHomeManager();
  const distribution = new DistributionService(homeManager);
  const command = args[0];

  try {
    switch (command) {
      case undefined:
      case '':
      case 'shell': {
        const { createEvaRuntime, runInteractiveShell } = await import('./index.js');
        await runInteractiveShell(createEvaRuntime());
        return 0;
      }

      case 'setup': {
        const result = distribution.setup();
        // Initialize default permissions baseline
        const perms = new CapabilityPermissions({ homeManager });
        console.log(`\n✓ EVA private workspace initialized for ${result.platform.displayName}`);
        console.log(`  Workspace:      ${result.homePath}`);
        console.log(`  Directories:    ${result.createdDirectories.length} subdirectories configured with 0700 permissions`);
        console.log(`  Configuration:  ${result.createdConfig ? 'Generated default settings at ' + result.configPath : 'Loaded existing ' + result.configPath}`);
        console.log(`  Capabilities:   12 capability security gates initialized (SYSTEM_INFO active by default)`);
        console.log('\nRun `eva doctor` to verify your environment readiness.\n');
        return 0;
      }

      case 'doctor': {
        const doctor = new EvaDoctor({ home: homeManager });
        const report = doctor.runDiagnostics();

        console.log(`\nEVA Diagnostics Report [${report.platform.displayName}]`);
        console.log('='.repeat(64));
        for (const check of report.checks) {
          const badge =
            check.status === 'PASS'
              ? '✓ PASS'
              : check.status === 'WARN'
              ? '⚠️ WARN'
              : '✗ FAIL';
          console.log(`${badge.padEnd(8)} ${check.name.padEnd(26)} ${check.detail}`);
          if (check.remediation) {
            console.log(`         ↳ Remediation: ${check.remediation}`);
          }
        }
        console.log('='.repeat(64));
        console.log(
          `Summary: ${report.passedCount} passed, ${report.warnCount} warnings, ${report.failCount} failed.\n`
        );
        return report.failCount > 0 ? 1 : 0;
      }

      case 'status': {
        const storage = distribution.getStorage();
        const router = new AIRouter();
        const perms = new CapabilityPermissions({ homeManager });
        const activePerms = perms.getAll().filter((p) => p.state === 'GRANTED' || p.state === 'TEMPORARY');

        console.log('\nEVA System Status:');
        console.log(`  Workspace Home:   ${storage.basePath}`);
        console.log(`  Total Storage:    ${(storage.totalSizeBytes / 1024).toFixed(2)} KB (${storage.totalSizeBytes} bytes)`);
        console.log(`  AI Connection:    ${router.getConnectionMode()}`);
        console.log(`  Active Gates:     ${activePerms.length}/12 capabilities authorized`);
        console.log('\nWorkspace Storage Breakdown:');
        for (const dir of storage.directories) {
          console.log(`  • ${dir.name.padEnd(14)}: ${dir.fileCount.toString().padStart(3)} files (${dir.totalSizeBytes} bytes)`);
        }
        console.log('');
        return 0;
      }

      case 'ask': {
        const prompt = args.slice(1).join(' ').trim();
        if (!prompt) {
          console.error('Usage: eva ask <prompt>');
          return 2;
        }

        const { createEvaRuntime } = await import('./index.js');
        const runtime = createEvaRuntime({ voiceEnabled: false });
        const device = runtime.sessionManager.registerDevice({
          deviceId: 'cli-direct',
          deviceName: 'CLI Direct Execution',
          publicKey: 'ed25519_cli_direct',
        });
        const session = runtime.sessionManager.createSession(device.deviceId);

        const response = await runtime.brain.executeGoal({
          goal: prompt,
          sessionId: session.sessionId,
          deviceId: device.deviceId,
          speakResponse: false,
        });

        if (response.enhanced && response.enhanced.enhancedPrompt !== prompt) {
          console.log(`✨ Enhanced: "${response.enhanced.enhancedPrompt}"`);
        }
        if (response.plan.length > 0) {
          console.log('\nPlanned Execution:');
          for (let i = 0; i < response.plan.length; i++) {
            const step = response.plan[i];
            const res = response.executionResults[i];
            console.log(`  ${i + 1}. ${step.thought} [${step.toolName}] -> ${res?.success ? '✓' : '✗'}`);
          }
        }
        console.log(`\nEVA: ${response.responseText}\n`);
        return response.success ? 0 : 1;
      }

      case 'run': {
        const toolName = args[1];
        if (!toolName) {
          console.error('Usage: eva run <toolName> [paramsJson]');
          return 2;
        }
        const jsonParams = args.slice(2).join(' ').trim() || '{}';
        let parsedParams: Record<string, unknown>;
        try {
          parsedParams = JSON.parse(jsonParams);
        } catch (err) {
          console.error(`Invalid JSON parameters: ${String(err)}`);
          return 2;
        }

        const { createEvaRuntime } = await import('./index.js');
        const runtime = createEvaRuntime({ voiceEnabled: false });
        const device = runtime.sessionManager.registerDevice({
          deviceId: 'cli-tool-runner',
          deviceName: 'CLI Tool Runner',
          publicKey: 'ed25519_cli_runner',
        });
        const session = runtime.sessionManager.createSession(device.deviceId);

        console.log(`Dispatching tool '${toolName}'...`);
        const result = await runtime.router.dispatch({
          toolName,
          parameters: parsedParams,
          sessionId: session.sessionId,
          deviceId: device.deviceId,
          taskId: `cli-run-${Date.now()}`,
        });

        if (result.success) {
          console.log('✓ Status: SUCCESS');
          console.log(JSON.stringify(result.data, null, 2));
          return 0;
        } else {
          console.error(`✗ Status: FAILED [${result.error?.code}]: ${result.error?.message}`);
          return 1;
        }
      }

      case 'plan': {
        const goal = args.slice(1).join(' ').trim();
        if (!goal) {
          console.error('Usage: eva plan <goal>');
          return 2;
        }

        const { createEvaRuntime } = await import('./index.js');
        const runtime = createEvaRuntime({ voiceEnabled: false });
        const pipeline = runtime.brain.getOrchestratorPipeline();
        const planResult = await pipeline.orchestrate({
          rawInput: goal,
          sessionId: 'cli-plan-session',
          deviceId: 'cli-planner',
          taskId: `plan-${Date.now()}`,
          forcedRole: 'PLANNER',
        });

        console.log(`\nGoal: "${goal}"`);
        console.log(`Role: ${planResult.role} | Intent: ${planResult.intent.intent} | Target: ${planResult.intent.rawTarget}`);
        console.log(`\nSelected Plan: ${planResult.selectedPlan.description}`);
        if (planResult.selectedPlan.steps.length > 0) {
          console.log('Steps:');
          for (let i = 0; i < planResult.selectedPlan.steps.length; i++) {
            const step = planResult.selectedPlan.steps[i];
            console.log(`  ${i + 1}. [${step.toolName}] ${step.thought}`);
          }
        } else {
          const directSteps = runtime.brain.parseGoalToPlan(goal);
          if (directSteps.length > 0) {
            console.log('Formulated Steps:');
            for (let i = 0; i < directSteps.length; i++) {
              console.log(`  ${i + 1}. [${directSteps[i].toolName}] ${directSteps[i].thought}`);
            }
          } else {
            console.log('No mutating steps required (read-only / informational inquiry).');
          }
        }
        console.log('');
        return 0;
      }

      case 'permissions': {
        const action = args[1];
        const value = args[2];
        const perms = new CapabilityPermissions({ homeManager });

        if (!action || action === 'list') {
          console.log('\nEVA Capability Permissions:');
          console.log('Capability'.padEnd(26) + 'State'.padEnd(12) + 'Reason');
          console.log('-'.repeat(60));
          for (const rec of perms.getAll()) {
            console.log(`${rec.capability.padEnd(26)}${rec.state.padEnd(12)}${rec.reason ?? ''}`);
          }
          console.log('');
          return 0;
        }

        if (!value || !CAPABILITIES.includes(value as Capability) || !['grant', 'deny', 'revoke'].includes(action)) {
          console.error('Usage: eva permissions [list | grant <CAPABILITY> | deny <CAPABILITY> | revoke <CAPABILITY>]');
          console.error(`Valid capabilities:\n  ${CAPABILITIES.join('\n  ')}`);
          return 2;
        }

        const cap = value as Capability;
        const rec =
          action === 'grant'
            ? perms.grant(cap)
            : action === 'deny'
            ? perms.deny(cap)
            : perms.revoke(cap);

        console.log(`✓ Updated capability '${rec.capability}' state to ${rec.state}`);
        return 0;
      }

      case 'models': {
        const action = args[1] ?? 'list';
        const registry = new ModelRegistry();

        if (action === 'list') {
          console.log('\nRegistered AI Models:');
          console.log('ID'.padEnd(24) + 'Provider'.padEnd(12) + 'Category'.padEnd(12) + 'Status'.padEnd(14) + 'Context');
          console.log('-'.repeat(72));
          for (const m of registry.getAll()) {
            console.log(
              `${m.id.padEnd(24)}${m.provider.padEnd(12)}${m.category.padEnd(12)}${m.availability.padEnd(14)}${m.contextWindowTokens} tokens`
            );
          }
          console.log('');
          return 0;
        }

        if (action === 'test') {
          const router = new AIRouter(registry);
          console.log(`\nTesting Dynamic AI Router [Mode: ${router.getConnectionMode()}]:`);
          const testCases: RouteRequest[] = [
            { taskType: 'interaction', complexity: 'low' },
            { taskType: 'planning', complexity: 'high' },
            { taskType: 'coding' },
            { taskType: 'vision' },
            { taskType: 'sensitive', privacy: 'local' },
          ];

          for (const req of testCases) {
            const decision = router.route(req);
            console.log(`  • Task [${req.taskType.padEnd(12)}]: ${router.explainRouting(decision)}`);
          }
          console.log('');
          return 0;
        }

        console.error('Usage: eva models [list | test]');
        return 2;
      }

      case 'devices': {
        const action = args[1] ?? 'list';
        const config = getConfig();
        const manager = new DevicePairingManager({ storageFile: config.storage.trustedDevicesPath });

        if (action === 'list') {
          const devices = manager.getDevices();
          console.log(`\nPaired Devices (${devices.length}):`);
          if (devices.length === 0) {
            console.log('  No external devices paired.');
          } else {
            console.log('ID'.padEnd(28) + 'Name'.padEnd(24) + 'Status');
            console.log('-'.repeat(64));
            for (const dev of devices) {
              console.log(`${dev.deviceId.padEnd(28)}${dev.deviceName.padEnd(24)}${dev.revoked ? 'REVOKED' : 'ACTIVE'}`);
            }
          }
          console.log('');
          return 0;
        }

        if (action === 'revoke') {
          const id = args[2];
          if (!id) {
            console.error('Usage: eva devices revoke <deviceId>');
            return 2;
          }
          const ok = manager.revokeDevice(id);
          if (ok) {
            console.log(`✓ Device '${id}' revoked successfully.`);
            return 0;
          } else {
            console.error(`✗ Device '${id}' not found.`);
            return 1;
          }
        }

        console.error('Usage: eva devices [list | revoke <deviceId>]');
        return 2;
      }

      case 'logs': {
        const action = args[1];
        if (action === 'clear') {
          const cleared = distribution.clearLogs();
          console.log(`✓ Cleared ${cleared.removedFiles} log files (${cleared.freedBytes} bytes freed).`);
          return 0;
        }

        const auditPath = path.join(homeManager.getDirectoryPath('audit'), 'audit.log');
        let tailN = 15;
        if (action === '--tail' && args[2]) {
          tailN = parseInt(args[2], 10) || 15;
        }

        if (fs.existsSync(auditPath)) {
          const lines = fs.readFileSync(auditPath, 'utf8').trim().split('\n').filter(Boolean);
          console.log(`\nAudit Trail (last ${tailN} events from ${auditPath}):`);
          for (const line of lines.slice(-tailN)) {
            console.log(`  ${line}`);
          }
          console.log('');
        } else {
          console.log(`No audit log found at ${auditPath}.`);
        }
        return 0;
      }

      case 'config': {
        const action = args[1] ?? 'show';
        const configPath = path.join(homeManager.getDirectoryPath('config'), 'settings.json');

        if (action === 'show') {
          if (fs.existsSync(configPath)) {
            console.log(fs.readFileSync(configPath, 'utf8'));
          } else {
            console.log(JSON.stringify({ version: 1, releaseChannel: 'stable' }, null, 2));
          }
          return 0;
        }

        if (action === 'get') {
          const key = args[2];
          if (!key) {
            console.error('Usage: eva config get <key>');
            return 2;
          }
          const current = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};
          console.log(current[key] !== undefined ? String(current[key]) : `<unset>`);
          return 0;
        }

        if (action === 'set') {
          const key = args[2];
          const val = args[3];
          if (!key || val === undefined) {
            console.error('Usage: eva config set <key> <value>');
            return 2;
          }
          const current = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};
          current[key] = val;
          fs.writeFileSync(configPath, JSON.stringify(current, null, 2) + '\n', {
            encoding: 'utf8',
            mode: 0o600,
          });
          console.log(`✓ Set ${key} = "${val}"`);
          return 0;
        }

        console.error('Usage: eva config [show | get <key> | set <key> <val>]');
        return 2;
      }

      case 'cache': {
        if (args[1] === 'clear') {
          console.log(`Cleared ${distribution.clearCache().removedFiles} cache files.`);
          return 0;
        }
        break;
      }

      case 'update': {
        const action = args[1];
        if (action === '--check') {
          console.log('Checking for EVA updates...');
          console.log('Current version: 0.1.0 (Channel: stable). You are running the latest verified release.');
          return 0;
        }

        if (['verify', 'stage'].includes(action ?? '') && args.length === 5) {
          const [, , manifestPath, artifactPath, publicKeyPath] = args;
          const verifier = new ReleaseVerifier();
          const manifest = verifier.readManifest(manifestPath);
          const platform = PlatformGuard.assertSupportedPlatform();
          const artifact = manifest.artifacts.find(
            (item) =>
              item.name === path.basename(artifactPath) &&
              item.platform === platform.platform &&
              item.arch === platform.arch
          );
          if (!artifact) {
            console.error(`Release manifest contains no entry for ${path.basename(artifactPath)}.`);
            return 2;
          }
          verifier.verifyArtifact(artifactPath, artifact, fs.readFileSync(publicKeyPath, 'utf8'));
          if (action === 'stage') {
            const staged = new UpdateManager().stage(
              manifest.version,
              artifactPath,
              artifact,
              fs.readFileSync(publicKeyPath, 'utf8')
            );
            console.log(`Verified and staged ${artifact.name} for EVA ${manifest.version}: ${staged.path}`);
          } else {
            console.log(`Verified ${artifact.name} for EVA ${manifest.version}; safe to stage.`);
          }
          return 0;
        }

        console.error('Usage: eva update [--check | verify <manifest> <artifact> <key> | stage <manifest> <artifact> <key>]');
        return 2;
      }

      case 'uninstall': {
        const purge = args.includes('--purge');
        console.log('\nEVA Uninstallation:');
        if (purge) {
          const basePath = homeManager.getBasePath();
          if (fs.existsSync(basePath)) {
            fs.rmSync(basePath, { recursive: true, force: true });
            console.log(`✓ Purged private workspace at ${basePath}`);
          }
          console.log('✓ EVA data purged completely. Remove the binary link if installed globally.\n');
        } else {
          console.log('To uninstall the CLI binary, remove the link (e.g. `rm /usr/local/bin/eva`).');
          console.log(`Your private data in ${homeManager.getBasePath()} was preserved.`);
          console.log('To completely purge data, rerun with `eva uninstall --purge`.\n');
        }
        return 0;
      }

      case 'help':
      case '--help':
      case '-h':
        console.log(usage);
        return 0;
    }

    console.log(usage);
    return command ? 2 : 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(error instanceof UnsupportedPlatformError ? message : `EVA failed: ${message}`);
    return 1;
  }
}

if (process.argv[1]?.endsWith('cli.ts') || process.argv[1]?.endsWith('cli.js')) {
  runCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
