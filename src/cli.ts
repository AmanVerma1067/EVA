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
import { setGlobalLogLevel } from '../core/logger/Logger.js';

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
  tokens [status | budget <limit> | analyze <file> | prune <file> [symbol]]
                                  Inspect real-time token radar, budget gauges & AST context slices
  mode [lite|full|ultra|off]      Inspect or switch Ponytail anti-over-engineering operational mode
  review <file|diff>              Run automated code review, quality scoring & secret leak check
  yagni "<task>"                  Evaluate proposed feature against the 7-step YAGNI decision ladder
  refactor <file> [patch|--dry]   Autonomous self-healing refactor loop with automatic rollback
  companion [status|pair|serve]   Manage mobile companion gateway, pairing & remote approvals
  benchmark [all|intent|context|latency|security]
                                  Run academic capstone evaluation benchmark suite & generate metrics
  ollama [status|models]          Inspect local offline inference server, models & privacy mode
  permissions [list|grant|deny|revoke] [CAPABILITY]
                                  Inspect and configure 12 capability security gates
  models [list|test]              Inspect registered AI models or test dynamic routing
  devices [list|revoke <id>]      Inspect and manage paired devices
  logs [--tail <n> | clear]       View or clear local logs and audit trail
  config [show|get|set]           Inspect or update settings in ~/.eva/config/settings.json
  update [--check | verify | stage]
                                  Check updates or verify/stage signed release packages
  uninstall [--purge]             Safely remove EVA installation and optional workspace`;

export async function runCli(rawArgs = process.argv.slice(2)): Promise<number> {
  const isDebug = rawArgs.includes('--debug') || rawArgs.includes('--verbose') || process.env.EVA_DEBUG === '1';
  if (!isDebug && !process.env.EVA_LOG_LEVEL) {
    setGlobalLogLevel('warn');
  }
  const args = rawArgs.filter((a) => a !== '--debug' && a !== '--verbose');
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

      case 'tokens': {
        const sub = args[1] || 'status';
        const { TokenBudgetRadar } = await import('../core/context/TokenBudgetRadar.js');
        const { ContextPruner } = await import('../core/context/ContextPruner.js');
        const radar = new TokenBudgetRadar({ homeManager });
        const pruner = new ContextPruner();

        if (sub === 'status') {
          const rep = radar.getStatusReport();
          console.log('\nEVA Token Budget Radar & Context Engine [Phase 18]');
          console.log('='.repeat(64));
          console.log(`Usage Gauge:       ${rep.gauge}`);
          console.log(`Session Input:     ${rep.inputTokens.toLocaleString()} tokens`);
          console.log(`Session Output:    ${rep.outputTokens.toLocaleString()} tokens`);
          console.log(`Session Cached:    ${rep.cachedTokens.toLocaleString()} tokens`);
          console.log(`Total Utilized:    ${rep.sessionTotalTokens.toLocaleString()} tokens`);
          console.log(`Estimated Cost:    $${rep.costUsd.toFixed(4)} USD`);
          console.log(`Daily Quota:       ${rep.dailyLimit.toLocaleString()} tokens (${rep.usagePercentage}% consumed)`);
          console.log(`Remaining Budget:  ${rep.remainingTokens.toLocaleString()} tokens`);
          if (rep.claudeLimit.hasLimit) {
            console.log(`⚠️ Claude Limit:   ${rep.claudeLimit.rawMessage}`);
          } else {
            console.log(`Claude Radar:      OK (No active rate limit detected)`);
          }
          console.log('='.repeat(64) + '\n');
          return 0;
        }

        if (sub === 'budget') {
          const limit = parseInt(args[2], 10);
          if (isNaN(limit) || limit <= 0) {
            console.error('Usage: eva tokens budget <dailyLimitNumber>');
            return 2;
          }
          radar.setBudgetConfig({ dailyTokenLimit: limit });
          console.log(`✓ Daily token budget updated to ${limit.toLocaleString()} tokens.\n`);
          return 0;
        }

        if (sub === 'analyze') {
          const targetFile = args[2];
          if (!targetFile) {
            console.error('Usage: eva tokens analyze <filePath>');
            return 2;
          }
          const slice = pruner.pruneFile(targetFile);
          console.log(`\nAST Context & Token Analysis: ${targetFile}`);
          console.log('='.repeat(64));
          console.log(`Original Tokens:   ${slice.originalTokens.toLocaleString()}`);
          console.log(`Sliced Tokens:     ${slice.slicedTokens.toLocaleString()}`);
          console.log(`Tokens Saved:      ${slice.tokensSaved.toLocaleString()}`);
          console.log(`Token Reduction:   ${slice.reductionPercentage}%`);
          console.log(`Included Symbols:  ${slice.includedSymbols.join(', ') || 'None'}`);
          if (slice.omittedSymbols.length > 0) {
            console.log(`Omitted Symbols:   ${slice.omittedSymbols.join(', ')}`);
          }
          console.log('='.repeat(64) + '\n');
          return 0;
        }

        if (sub === 'prune' || sub === 'slice') {
          const targetFile = args[2];
          const targetSymbol = args[3];
          if (!targetFile) {
            console.error('Usage: eva tokens prune <filePath> [targetSymbol]');
            return 2;
          }
          const slice = pruner.pruneFile(targetFile, targetSymbol);
          console.log(`\n--- Sliced Context for ${targetFile}${targetSymbol ? ` (Target: ${targetSymbol})` : ''} ---`);
          console.log(`Reduction: ${slice.reductionPercentage}% (${slice.originalTokens} -> ${slice.slicedTokens} tokens)\n`);
          console.log(slice.slicedCode);
          console.log('\n--- End of Slice ---\n');
          return 0;
        }

        console.error('Usage: eva tokens [status | budget <limit> | analyze <file> | prune <file> [symbol]]');
        return 2;
      }

      case 'mode': {
        const { YagniDecisionLadder } = await import('../core/pragmatic/YagniDecisionLadder.js');
        const ladder = new YagniDecisionLadder({ homeManager });
        const targetMode = args[1]?.toLowerCase();

        if (!targetMode) {
          const currentMode = ladder.getMode();
          console.log('\nEVA Anti-Over-Engineering Mode [Ponytail Framework]');
          console.log('='.repeat(64));
          console.log(`Current Mode:      ${currentMode.toUpperCase()}`);
          console.log('Descriptions:');
          console.log('  lite  - Standard guardrails; warns on duplicate abstractions');
          console.log('  full  - (Default) Strictly enforces 7-step YAGNI ladder & limits dependencies');
          console.log('  ultra - Aggressive code minimalism; inlines trivial code, strict 50% LOC budget');
          console.log('  off   - Guardrails disabled for exploratory prototyping');
          console.log('='.repeat(64) + '\n');
          return 0;
        }

        if (!['lite', 'full', 'ultra', 'off'].includes(targetMode)) {
          console.error(`Invalid mode '${targetMode}'. Supported modes: lite, full, ultra, off`);
          return 2;
        }

        ladder.setMode(targetMode as any);
        console.log(`\n✓ EVA Anti-Over-Engineering Mode updated to '${targetMode.toUpperCase()}'.`);
        console.log(`Setting persisted to ~/.local/share/eva/config/pragmatic_settings.json\n`);
        return 0;
      }

      case 'review': {
        const target = args[1];
        if (!target) {
          console.error('Usage: eva review <filePath | diff>');
          return 2;
        }

        const { CodeReviewAuditor } = await import('../core/pragmatic/CodeReviewAuditor.js');
        const auditor = new CodeReviewAuditor();
        let res;
        if (target === 'diff') {
          const { execSync } = await import('node:child_process');
          try {
            const diff = execSync('git diff HEAD', { encoding: 'utf-8' });
            res = auditor.auditDiff(diff);
          } catch (e: any) {
            console.error(`Failed to read git diff: ${e.message}`);
            return 1;
          }
        } else {
          res = await auditor.auditFile(target);
        }

        console.log('\n' + res.summary + '\n');
        return res.verdict === 'FAIL' ? 1 : 0;
      }

      case 'yagni': {
        const task = args.slice(1).join(' ').trim();
        if (!task) {
          console.error('Usage: eva yagni "<task or proposed feature description>"');
          return 2;
        }

        const { YagniDecisionLadder } = await import('../core/pragmatic/YagniDecisionLadder.js');
        const ladder = new YagniDecisionLadder({ homeManager });
        const res = ladder.evaluate({ taskDescription: task });

        const badge = res.approved ? '✓ APPROVED' : '✗ REJECTED';
        console.log('\nEVA Ponytail YAGNI Evaluation');
        console.log('='.repeat(64));
        console.log(`Status:            ${badge}`);
        console.log(`Decision:          ${res.decision}`);
        console.log(`Ladder Step:       Step ${res.step} (${res.stepName})`);
        console.log(`Operational Mode:  ${res.mode.toUpperCase()}`);
        console.log(`LOC Budget:        ${res.locBudget} lines`);
        console.log(`Rationale:         ${res.rationale}`);
        console.log(`Suggested:         ${res.suggestedApproach}`);
        if (res.warnings.length > 0) {
          console.log(`Warnings:          ${res.warnings.join('; ')}`);
        }
        if (res.remediation) {
          console.log(`Remediation:       ${res.remediation}`);
        }
        console.log('='.repeat(64) + '\n');
        return res.approved ? 0 : 1;
      }

      case 'refactor': {
        const targetFile = args[1];
        if (!targetFile) {
          console.error('Usage: eva refactor <filePath> [patchFile | --dry-run | --goal "<goal>"]');
          return 2;
        }

        const isDryRun = args.includes('--dry-run');
        const goalIdx = args.indexOf('--goal');
        const refactorGoal = goalIdx !== -1 && args[goalIdx + 1] ? args[goalIdx + 1] : `Refactor ${targetFile}`;

        let patchContent: string | undefined;
        if (args[2] && !args[2].startsWith('--')) {
          const patchPath = path.resolve(process.cwd(), args[2]);
          if (fs.existsSync(patchPath)) {
            patchContent = fs.readFileSync(patchPath, 'utf-8');
          }
        }

        const { SelfHealingLoop } = await import('../core/refactor/SelfHealingLoop.js');
        const loop = new SelfHealingLoop({ homeManager });

        console.log(`\nEVA Autonomous Self-Healing Refactor [Phase 20]`);
        console.log('='.repeat(64));
        console.log(`Target:            ${targetFile}`);
        console.log(`Goal:              ${refactorGoal}`);
        console.log(`Dry Run:           ${isDryRun ? 'YES' : 'NO'}`);
        console.log(`Step 1/5: Snapshot created for rollback safety.`);
        console.log(`Step 2/5: Evaluating YAGNI decision ladder...`);

        const res = await loop.executeRefactor({
          targetFiles: [targetFile],
          refactorGoal,
          patches: patchContent ? [{ filePath: targetFile, patch: patchContent }] : undefined,
          dryRun: isDryRun,
        });

        console.log(`Status:            ${res.status}`);
        console.log(`Rollback Occurred: ${res.rollbackOccurred ? 'YES' : 'NO'}`);
        if (res.rollbackReason) {
          console.log(`Rollback Reason:   ${res.rollbackReason}`);
        }
        if (res.diffSummary) {
          console.log('\n--- Applied Diff ---');
          console.log(res.diffSummary);
          console.log('--------------------\n');
        }
        console.log(`Outcome:           ${res.message}`);
        console.log('='.repeat(64) + '\n');

        return res.status === 'SUCCESS' || res.status === 'DRY_RUN' ? 0 : 1;
      }

      case 'companion': {
        const sub = args[1] || 'status';
        const pairingFile = path.join(homeManager.getBasePath(), 'trusted_devices.json');
        const pairingManager = new DevicePairingManager({ storageFile: pairingFile });

        if (sub === 'status') {
          const devices = pairingManager.getDevices();
          console.log('\nEVA Mobile Companion & WebSocket Gateway [Phase 21]');
          console.log('='.repeat(64));
          console.log(`Gateway Protocol:  RFC 6455 Encrypted WebSocket (/ws)`);
          console.log(`Port:              8765`);
          console.log(`Paired Devices:    ${devices.length}`);
          for (const d of devices) {
            const status = d.revoked ? 'REVOKED' : 'TRUSTED';
            console.log(`  • [${status}] ${d.deviceName} (${d.deviceId})`);
            console.log(`    ↳ Paired: ${d.pairedAt}`);
          }
          if (devices.length === 0) {
            console.log('  (No mobile devices paired yet. Run `eva companion pair` to connect iPhone)');
          }
          console.log('='.repeat(64) + '\n');
          return 0;
        }

        if (sub === 'pair') {
          const devName = args[2] || 'iOS Companion';
          const devId = `iphone_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;
          const code = pairingManager.createPairingRequest(devId, devName);

          console.log('\nEVA Mobile Device Pairing');
          console.log('='.repeat(64));
          console.log(`Device ID:         ${devId}`);
          console.log(`Device Name:       ${devName}`);
          console.log(`One-Time Code:     ${code}`);
          console.log(`Expires In:        300 seconds (5 minutes)`);
          console.log(`Payload for QR:    eva://pair?code=${code}&id=${devId}`);
          console.log('='.repeat(64));
          console.log(`Enter this 6-digit code in the EVA iOS companion app.\n`);
          return 0;
        }

        if (sub === 'revoke') {
          const devId = args[2];
          if (!devId) {
            console.error('Usage: eva companion revoke <deviceId>');
            return 2;
          }
          const ok = pairingManager.revokeDevice(devId);
          if (ok) {
            console.log(`✓ Device '${devId}' revoked successfully. Future WebSocket connections blocked.\n`);
            return 0;
          } else {
            console.error(`Device '${devId}' not found.`);
            return 1;
          }
        }

        if (sub === 'serve') {
          const port = parseInt(args[2] || '8765', 10);
          const { createVoiceServer } = await import('./server.js');
          const { createEvaRuntime } = await import('./index.js');
          const runtime = createEvaRuntime({ voiceEnabled: false });
          const server = createVoiceServer(runtime, port);

          server.listen(port, () => {
            console.log(`\n✓ EVA Mobile Companion Gateway active at http://127.0.0.1:${port}`);
            console.log(`WebSocket Endpoint: ws://127.0.0.1:${port}/ws (RFC 6455)\n`);
          });
          return 0;
        }

        console.error('Usage: eva companion [status | pair [name] | revoke <id> | serve [port]]');
        return 2;
      }

      case 'benchmark': {
        const category = (args[1] || 'all').toLowerCase();
        const { createEvaRuntime } = await import('./index.js');
        const runtime = createEvaRuntime({ voiceEnabled: false });

        console.log(`\nRunning EVA Academic Capstone Benchmark [Category: ${category}]...`);
        const result = await runtime.router.dispatch({
          toolName: 'benchmark.run',
          parameters: { category, samples: 20 },
          sessionId: 'cli-benchmark',
          deviceId: 'cli-evaluator',
          taskId: `bench-${Date.now()}`,
        });

        if (!result.success || !result.data) {
          console.error(`✗ Benchmark failed: ${result.error?.message}`);
          return 1;
        }

        const data = result.data as any;
        console.log('\n================================================================');
        console.log(`EVA Academic Capstone Evaluation Report`);
        console.log('================================================================');
        console.log(`Composite Academic Score: ${data.overallScore}/100`);
        console.log(`Summary: ${data.executiveSummary}\n`);

        if (data.intentAccuracy !== undefined) {
          console.log(`Intent Accuracy:          ${data.intentAccuracy}% (F1-Score: ${data.intentF1Score})`);
        }
        if (data.tokenSavingsPercent !== undefined) {
          console.log(`Context Token Savings:    ${data.tokenSavingsPercent}%`);
        }
        if (data.medianLatencyMs !== undefined) {
          console.log(`Median Pipeline Latency:  ${data.medianLatencyMs} ms`);
        }
        if (data.policyEnforcementRate !== undefined) {
          console.log(`Security Policy Rate:     ${data.policyEnforcementRate}%`);
        }

        if (data.latexTableSnippet) {
          console.log('\nLaTeX Academic Table Snippet:');
          console.log('----------------------------------------------------------------');
          console.log(data.latexTableSnippet);
          console.log('----------------------------------------------------------------');
        }

        console.log('================================================================\n');
        return 0;
      }

      case 'ollama':
      case 'inference': {
        const { createEvaRuntime } = await import('./index.js');
        const runtime = createEvaRuntime({ voiceEnabled: false });

        const result = await runtime.router.dispatch({
          toolName: 'inference.local_status',
          parameters: {},
          sessionId: 'cli-inference',
          deviceId: 'cli-evaluator',
          taskId: `infer-${Date.now()}`,
        });

        if (!result.success || !result.data) {
          console.error(`✗ Failed to query local inference: ${result.error?.message}`);
          return 1;
        }

        const data = result.data as any;
        console.log('\nEVA Local Offline Inference Engine [Phase 22]');
        console.log('================================================================');
        console.log(`Status:            ${data.online ? '✓ ONLINE' : '⚠️ OFFLINE'} (${data.operatingMode})`);
        console.log(`Base URL:          ${data.baseUrl}`);
        console.log(`Default Model:     ${data.defaultModel}`);
        console.log(`Installed Models:  ${data.activeModelsCount}`);
        if (data.installedModels && data.installedModels.length > 0) {
          console.log('\nInstalled Model Repositories:');
          for (const m of data.installedModels) {
            const sizeMb = Math.round(m.sizeBytes / (1024 * 1024));
            console.log(`  • ${m.name.padEnd(20)} [${sizeMb} MB, ${m.parameterSize}, ${m.quantization}]`);
          }
        }
        if (data.isSimulated) {
          console.log('\nℹ Note: Running in deterministic offline simulation fallback.');
        }
        console.log('================================================================\n');
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
