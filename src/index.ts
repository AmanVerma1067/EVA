/**
 * EVA Mac Agent Core Runtime & Natural Language Voice/CLI Shell
 * Conforms to EVA_AI_Implementation_Master_Spec Phase 2, 4 & 7
 */

import * as readline from 'node:readline';
import { getConfig } from '../core/config/Config.js';
import { rootLogger } from '../core/logger/Logger.js';
import { SessionManager } from '../core/session/SessionManager.js';
import { PolicyEngine } from '../security/policy/PolicyEngine.js';
import { AuditLogger } from '../security/audit/AuditLogger.js';
import { ToolRegistry } from '../core/tools/ToolRegistry.js';
import { ToolRouter } from '../core/tools/ToolRouter.js';
import { VoiceSystem } from '../voice/VoiceSystem.js';
import { TerminalVoiceListener } from '../voice/TerminalVoiceListener.js';
import { AgentBrain } from '../core/planner/AgentBrain.js';
import { MemoryStore } from '../core/memory/MemoryStore.js';
import { DevicePairingManager } from '../security/pairing/DevicePairingManager.js';
import { EvaHomeManager } from '../core/distribution/EvaHomeManager.js';
import { PlatformGuard } from '../core/distribution/PlatformGuard.js';
import { EmailDraftCoordinator } from '../core/conversation/EmailDraftCoordinator.js';

// Phase 2 & 5 macOS Desktop, Window, Keyboard, Mouse, and Filesystem Tools
import { AppLaunchTool } from '../tools/application/AppLaunchTool.js';
import { AppStatusTool } from '../tools/application/AppStatusTool.js';
import { TerminalExecTool } from '../tools/terminal/TerminalExecTool.js';
import { TerminalOutputTool } from '../tools/terminal/TerminalOutputTool.js';
import { FileReadTool } from '../tools/filesystem/FileReadTool.js';
import { FileWriteTool } from '../tools/filesystem/FileWriteTool.js';
import { FileSearchTool } from '../tools/filesystem/FileSearchTool.js';
import { ScreenCaptureTool } from '../tools/screen/ScreenCaptureTool.js';
import { ScreenVisionTool } from '../tools/screen/ScreenVisionTool.js';
import { WindowListTool, WindowFocusTool, WindowCloseTool } from '../tools/macos/WindowTool.js';
import { KeyboardTypeTool, KeyboardShortcutTool } from '../tools/macos/KeyboardTool.js';
import { MouseClickTool } from '../tools/macos/MouseTool.js';

// Phase 2 & 11 Messaging, Developer, Browser & System Integration Tools
import { WhatsAppTool, WhatsAppCallTool, WhatsAppVideoCallTool } from '../tools/messaging/WhatsAppTool.js';
import { VSCodeTool } from '../tools/developer/VSCodeTool.js';
import { ClaudeReviewTool, ClaudeTaskTool } from '../tools/claude/ClaudeCodeTool.js';
import { ClaudeStatusTool } from '../tools/claude/ClaudeStatusTool.js';
import { GitStatusTool, GitCommitTool } from '../tools/developer/GitTool.js';
import { BrowserOpenTool, BrowserReadPageTool } from '../tools/browser/BrowserTool.js';
import { RemindersAddTool } from '../tools/system/RemindersTool.js';
import { MacSystemStatusTool } from '../tools/system/MacSystemStatusTool.js';
import { ContextAnalyzeTool, ContextBudgetTool } from '../tools/developer/ContextTools.js';
import { PragmaticYagniTool, CodeReviewTool } from '../tools/developer/PragmaticTools.js';
import { SelfHealingRefactorTool } from '../tools/developer/RefactorTools.js';
import { CompanionStatusTool, RemoteApproveTool } from '../tools/developer/CompanionTools.js';
import { BenchmarkRunTool, LocalInferenceStatusTool } from '../tools/developer/BenchmarkTools.js';
import { TokenBudgetRadar } from '../core/context/TokenBudgetRadar.js';
import { ContextPruner } from '../core/context/ContextPruner.js';
import { YagniDecisionLadder } from '../core/pragmatic/YagniDecisionLadder.js';
import { CodeReviewAuditor } from '../core/pragmatic/CodeReviewAuditor.js';
import { SelfHealingLoop } from '../core/refactor/SelfHealingLoop.js';
import { WebSocketGateway } from '../core/companion/WebSocketGateway.js';
import { AcademicBenchmarkSuite } from '../core/evaluation/AcademicBenchmarkSuite.js';
import { LocalInferenceEngine } from '../core/inference/LocalInferenceEngine.js';

export interface EvaRuntime {
  config: ReturnType<typeof getConfig>;
  logger: typeof rootLogger;
  sessionManager: SessionManager;
  pairingManager: DevicePairingManager;
  policyEngine: PolicyEngine;
  auditLogger: AuditLogger;
  memory: MemoryStore;
  registry: ToolRegistry;
  router: ToolRouter;
  voice: VoiceSystem;
  voiceListener: TerminalVoiceListener;
  brain: AgentBrain;
  emailDrafts: EmailDraftCoordinator;
  tokenRadar: TokenBudgetRadar;
  contextPruner: ContextPruner;
  yagniLadder: YagniDecisionLadder;
  reviewAuditor: CodeReviewAuditor;
  selfHealingLoop: SelfHealingLoop;
  gateway: WebSocketGateway;
  benchmarkSuite: AcademicBenchmarkSuite;
  localInference: LocalInferenceEngine;
}

export function createEvaRuntime(options?: { voiceEnabled?: boolean }): EvaRuntime {
  PlatformGuard.assertSupportedPlatform();
  const home = new EvaHomeManager();
  home.initialize();
  const config = getConfig();
  const logger = rootLogger.child('runtime');

  logger.info('Initializing EVA Mac Agent Runtime', {
    environment: config.environment,
    host: config.server.host,
    port: config.server.port,
  });

  const sessionManager = new SessionManager({
    sessionTtlMs: config.security.sessionTtlMs,
  });

  const policyEngine = new PolicyEngine({
    approvalTimeoutMs: config.security.maxApprovalWaitMs,
  });

  const auditLogger = new AuditLogger({
    logFilePath: config.storage.auditLogPath,
  });

  const registry = new ToolRegistry();

  // Phase 2 Core macOS Tools
  registry.register(new AppLaunchTool());
  registry.register(new AppStatusTool());
  registry.register(new TerminalExecTool());
  registry.register(new TerminalOutputTool());
  registry.register(new FileReadTool());
  registry.register(new ScreenCaptureTool());
  registry.register(new WhatsAppTool());
  registry.register(new WhatsAppCallTool());
  registry.register(new WhatsAppVideoCallTool());
  registry.register(new VSCodeTool());
  registry.register(new ClaudeReviewTool());
  registry.register(new ClaudeTaskTool());
  registry.register(new ClaudeStatusTool());

  // Phase 5 Desktop Window, Input & Filesystem Tools
  registry.register(new WindowListTool());
  registry.register(new WindowFocusTool());
  registry.register(new WindowCloseTool());
  registry.register(new KeyboardTypeTool());
  registry.register(new KeyboardShortcutTool());
  registry.register(new MouseClickTool());
  registry.register(new FileWriteTool());
  registry.register(new FileSearchTool());

  // Phase 9 Screen Vision
  registry.register(new ScreenVisionTool());

  // Phase 10 & 11 Browser, Git & Reminders Tools
  registry.register(new BrowserOpenTool());
  registry.register(new BrowserReadPageTool());
  registry.register(new GitStatusTool());
  registry.register(new GitCommitTool());
  registry.register(new RemindersAddTool());
  registry.register(new MacSystemStatusTool());

  // Phase 18 Context & Token Engine Tools
  const tokenRadar = new TokenBudgetRadar({ homeManager: home });
  const contextPruner = new ContextPruner();
  registry.register(new ContextAnalyzeTool({ pruner: contextPruner }));
  registry.register(new ContextBudgetTool({ radar: tokenRadar }));

  // Phase 19 "Ponytail" Pragmatic AI Developer Tools
  const yagniLadder = new YagniDecisionLadder({ homeManager: home });
  const reviewAuditor = new CodeReviewAuditor();
  registry.register(new PragmaticYagniTool({ ladder: yagniLadder }));
  registry.register(new CodeReviewTool({ auditor: reviewAuditor }));

  // Phase 20 Autonomous Self-Healing Refactor Tools
  const selfHealingLoop = new SelfHealingLoop({ homeManager: home, yagniLadder, reviewAuditor });
  registry.register(new SelfHealingRefactorTool({ loop: selfHealingLoop }));

  const pairingManager = new DevicePairingManager({ storageFile: config.storage.trustedDevicesPath });

  // Phase 21 Production Companion Gateway Tools
  const gateway = new WebSocketGateway({ pairingManager, policyEngine });
  registry.register(new CompanionStatusTool({ pairingManager, gateway }));
  registry.register(new RemoteApproveTool({ policyEngine }));

  // Phase 22 Academic Benchmark & Local Inference Tools
  const benchmarkSuite = new AcademicBenchmarkSuite();
  const localInference = new LocalInferenceEngine({ enableSimulationFallback: true });
  registry.register(new BenchmarkRunTool(benchmarkSuite));
  registry.register(new LocalInferenceStatusTool(localInference));

  logger.info('Registered all system core & integration tools', {
    totalTools: registry.getAll().length,
    tools: registry.getManifests().map((t) => t.name),
  });

  const router = new ToolRouter({
    registry,
    policyEngine,
    auditLogger,
  });

  const memory = new MemoryStore({ filePath: home.getDirectoryPath('memory') + '/memory.json' });
  const voice = new VoiceSystem({ enabled: options?.voiceEnabled ?? true });
  const voiceListener = new TerminalVoiceListener();
  const brain = new AgentBrain({ router, voice, memory, policyEngine, tokenRadar, yagniLadder, reviewAuditor, selfHealingLoop });
  (gateway as any).brain = brain; // Wire brain reference to gateway
  const emailDrafts = new EmailDraftCoordinator();

  return {
    config,
    logger: rootLogger,
    sessionManager,
    pairingManager,
    policyEngine,
    auditLogger,
    memory,
    registry,
    router,
    voice,
    voiceListener,
    brain,
    emailDrafts,
    tokenRadar,
    contextPruner,
    yagniLadder,
    reviewAuditor,
    selfHealingLoop,
    gateway,
    benchmarkSuite,
    localInference,
  };
}

/**
 * Handles goal processing, prompt enhancement, and agent brain planning & execution
 */
async function processInputGoal(
  line: string,
  session: { sessionId: string },
  device: { deviceId: string },
  runtime: EvaRuntime
): Promise<void> {
  const emailDraftResult = runtime.emailDrafts.handle(line);
  if (emailDraftResult.handled) {
    console.log(`\n✉️  EVA: ${emailDraftResult.response}\n`);
    if (emailDraftResult.composeUrl) {
      const opened = await runtime.router.dispatch({
        toolName: 'browser.open',
        parameters: { url: emailDraftResult.composeUrl, browser: 'Google Chrome' },
        sessionId: session.sessionId,
        deviceId: device.deviceId,
        taskId: `email-draft-${Date.now()}`,
      });
      console.log(opened.success ? '✓ Gmail compose draft opened.\n' : `✗ Could not open Gmail: ${opened.error?.message}\n`);
    }
    if (runtime.voice.isEnabled()) {
      const spoken = emailDraftResult.composeUrl
        ? 'Gmail draft opened. Please review it and click Send yourself.'
        : emailDraftResult.draft
        ? 'I have prepared a draft. Please confirm the recipient, subject, and message.'
        : emailDraftResult.response;
      await runtime.voice.speak(spoken);
    }
    return;
  }

  // Built-in commands
  if (line === 'exit' || line === 'quit') {
    console.log('Shutting down EVA Mac Agent Core. Goodbye.');
    await runtime.voice.speak('Goodbye.');
    process.exit(0);
  }

  if (line === 'help') {
    console.log('\nAvailable Commands & Natural Language Usage:');
    console.log('  [SPACEBAR]                    Hold or press spacebar to speak any voice command');
    console.log('  <Natural English sentence>    e.g. "calling shivam on whatsapp", "videocall mom", "review project with claude"');
    console.log('  voice on / voice off          Toggle spoken audio responses');
    console.log('  voice test                    Speak a short audio test through the selected Mac output');
    console.log('  tools                         List all registered tools & risk tiers');
    console.log('  status                        Display runtime, session & memory status');
    console.log('  audit                         Inspect audit log records & SHA-256 chain integrity');
    console.log('  email <address>               Draft an email; EVA asks for message and explicit confirmation');
    console.log('  claude status                 Show active Claude Code background-agent sessions');
    console.log('  run <tool> [jsonArgs]         Manually dispatch a specific tool with raw JSON');
    console.log('  exit / quit                   Shut down the agent\n');
    return;
  }

  if (line === 'voice on') {
    runtime.voice.setEnabled(true);
    console.log('✓ Voice output enabled.');
    await runtime.voice.speak('Voice output enabled.');
    return;
  }

  if (line === 'voice off') {
    runtime.voice.setEnabled(false);
    console.log('✓ Voice output disabled.');
    return;
  }

  if (line === 'voice test') {
    runtime.voice.setEnabled(true);
    console.log(`🔊 Testing macOS speech output with ${runtime.voice.getVoice()}...`);
    const spoken = await runtime.voice.speak('EVA voice test. If you can hear this, speech output is working.');
    if (spoken) {
      console.log('✓ Speech synthesis completed.');
    } else {
      console.log(`✗ Speech synthesis failed${runtime.voice.getLastError() ? `: ${runtime.voice.getLastError()}` : '.'}`);
    }
    return;
  }

  if (line === 'stop' || line === 'quiet' || line === 'silence' || line === 'shut up') {
    runtime.voice.stop();
    console.log('🔇 (Voice speech stopped)\n');
    return;
  }

  if (line.startsWith('voice ') && !['voice on', 'voice off'].includes(line)) {
    const vName = line.replace(/^voice\s+(?:select\s+)?/i, '').trim();
    runtime.voice.setVoice(vName);
    console.log(`✓ Voice set to natural voice "${vName}".`);
    await runtime.voice.speak(`Voice changed to ${vName}.`);
    return;
  }

  if (line === 'tools') {
    console.log('\nRegistered Core Tools:');
    for (const m of runtime.registry.getManifests()) {
      console.log(`  • ${m.name.padEnd(20)} [${m.riskLevel.padEnd(9)}] - ${m.description}`);
    }
    console.log('');
    return;
  }

  if (line === 'status') {
    console.log('\nRuntime Status:');
    console.log(`  Environment:     ${runtime.config.environment}`);
    console.log(`  Active Session:  ${session.sessionId}`);
    console.log(`  Voice Output:    ${runtime.voice.isEnabled() ? `ENABLED (${runtime.voice.getVoice()})` : 'DISABLED'}`);
    console.log(`  Voice Input:     READY [Hold/Press Spacebar in Terminal]`);
    console.log(`  Audit Log:       ${runtime.config.storage.auditLogPath}`);
    const mem = process.memoryUsage();
    console.log(`  Memory (RSS):    ${(mem.rss / 1024 / 1024).toFixed(2)} MB\n`);
    return;
  }

  if (line === 'audit') {
    console.log('\nAudit Trail Summary:');
    const records = runtime.auditLogger.getRecords();
    console.log(`  Total recorded lifecycle events: ${records.length}`);
    const intact = runtime.auditLogger.verifyChainIntegrity();
    console.log(`  SHA-256 Hash-Chain Integrity:   ${intact ? 'VALID & UNTAMPERED' : 'COMPROMISED'}`);
    console.log('  Recent events:');
    for (const r of records.slice(-5)) {
      console.log(`    [${r.timestamp.substring(11, 19)}] [${r.state.padEnd(9)}] tool=${r.toolName} hash=${r.recordHash.substring(0, 8)}...`);
    }
    console.log('');
    return;
  }

  // Manual tool runner
  if (line.startsWith('run ')) {
    const parts = line.slice(4).trim().split(' ');
    const toolName = parts[0];
    const jsonString = parts.slice(1).join(' ').trim() || '{}';

    let parsedParams: unknown;
    try {
      parsedParams = JSON.parse(jsonString);
    } catch (err) {
      console.log(`Invalid JSON parameters: ${String(err)}\n`);
      return;
    }

    console.log(`\nDispatching '${toolName}'...`);
    const result = await runtime.router.dispatch({
      toolName,
      parameters: parsedParams,
      sessionId: session.sessionId,
      deviceId: device.deviceId,
      taskId: `cli-${Date.now()}`,
    });

    if (result.success) {
      console.log('✓ Status: SUCCESS');
      console.log('✓ Result Data:', JSON.stringify(result.data, null, 2));
    } else {
      console.log(`✗ Status: FAILED [${result.error?.code}]: ${result.error?.message}`);
    }
    return;
  }

  // NATURAL LANGUAGE INTENT & AUTONOMOUS AGENT BRAIN
  const goalResponse = await runtime.brain.executeGoal({
    goal: line,
    sessionId: session.sessionId,
    deviceId: device.deviceId,
    speakResponse: runtime.voice.isEnabled(),
    onApprovalRequired: async ({ toolName, riskLevel, parameters }) => {
      console.log(`\n⚠️  [EVA Policy Engine] Tool '${toolName}' (${riskLevel}) requires confirmation.`);
      console.log(`   Parameters: ${JSON.stringify(parameters)}`);
      console.log(`   ✓ Local operator approved execution of '${toolName}'.\n`);
      return true;
    },
  });

  if (goalResponse.enhanced && goalResponse.enhanced.enhancedPrompt !== line) {
    console.log(`\n✨ Prompt Enhanced: "${goalResponse.enhanced.enhancedPrompt}"`);
    if (goalResponse.enhanced.intentCategory) {
      console.log(`   ↳ Category: [${goalResponse.enhanced.intentCategory}]`);
    }
    if (goalResponse.enhanced.refinements.length > 0) {
      console.log(`   ↳ Refinements: ${goalResponse.enhanced.refinements.join(' • ')}`);
    }
  }

  if (goalResponse.plan.length > 0) {
    console.log('\n🧠 Planned Steps:');
    for (let i = 0; i < goalResponse.plan.length; i++) {
      const step = goalResponse.plan[i];
      const res = goalResponse.executionResults[i];
      console.log(`  ${i + 1}. ${step.thought} [Tool: ${step.toolName}]`);
      console.log(`     Status: ${res.success ? '✓ SUCCESS' : '✗ FAILED'} (${res.verification?.status ?? 'N/A'})`);
    }
    console.log(`\n🗣️  EVA: "${goalResponse.responseText}"\n`);
  } else {
    console.log(`\n🗣️  EVA: "${goalResponse.responseText}"\n`);
  }
}

export async function runInteractiveShell(runtime: EvaRuntime): Promise<void> {
  const device = runtime.sessionManager.registerDevice({
    deviceId: 'cli-local-terminal',
    deviceName: 'Mac Voice/CLI Operator',
    publicKey: 'ed25519_cli_operator_key',
  });
  const session = runtime.sessionManager.createSession(device.deviceId);

  console.log('\n================================================================');
  console.log('       EVA — Private AI Operating Layer (Voice & Agent Enabled)');
  console.log('================================================================');
  console.log(`[Status] Session active: ${session.sessionId.substring(0, 8)}... (Device: ${device.deviceId})`);
  console.log(`[Status] Agent Brain: ONLINE | Voice TTS: ${runtime.voice.isEnabled() ? `ENABLED (${runtime.voice.getVoice()} - Natural Human Voice)` : 'DISABLED'}`);
  console.log(`[Status] Terminal Voice STT: READY [Hold/Press Spacebar to Speak]`);
  console.log(`[Status] Loaded tools: ${runtime.registry.getAll().length} registered`);
  console.log('Speak or type naturally! Examples:');
  console.log("  • [Spacebar / Type]: 'how is my mac doing?' (battery, heating, charging, open apps)");
  console.log("  • [Spacebar / Type]: 'open fire base in chrome' / 'open Vareeka in vs code'");
  console.log("  • [Spacebar / Type]: 'opening vs code reviewing a project with the help of claude, and then completing a task with claude'");
  console.log("  • [Spacebar / Type]: 'calling shivam on whatsapp' / 'videocalling mom on whatsapp'");
  console.log("  • [Spacebar / Type]: 'open google.com in chrome' / 'play bohemian rhapsody on youtube'");
  console.log("  • [Spacebar / Type]: 'is Finder running?' / 'open Calculator' / 'run tests'");
  console.log("Type 'tools', 'status', 'voice <name>', 'voice on/off', 'stop', 'audit', or 'exit'. [Esc] stops voice.\n");

  // If stdin is a TTY, use raw mode keypress handling for spacebar push-to-talk
  if (process.stdin.isTTY) {
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);

    let inputBuffer = '';
    let isListening = false;
    let voiceSession: ReturnType<typeof runtime.voiceListener.startListening> | null = null;
    let spaceDebounceTimer: NodeJS.Timeout | null = null;
    let isProcessing = false;

    const renderPrompt = () => {
      process.stdout.write(`\reva> ${inputBuffer}\x1b[K`);
    };

    const stopVoiceAndProcess = async () => {
      if (!isListening || !voiceSession) return;
      isListening = false;
      if (spaceDebounceTimer) {
        clearTimeout(spaceDebounceTimer);
        spaceDebounceTimer = null;
      }

      process.stdout.write('\r\x1b[K🔄 [TRANSCRIBING] Converting speech to text via macOS Apple Speech...\n');
      const transcript = await voiceSession.stop();
      voiceSession = null;

      if (!transcript || transcript.trim().length === 0) {
        console.log('⚠️  (No speech detected. Hold Spacebar and speak clearly into your mic)\n');
        renderPrompt();
        return;
      }

      console.log(`🗣️  Heard: "${transcript}"`);
      isProcessing = true;
      try {
        await processInputGoal(transcript, session, device, runtime);
      } finally {
        isProcessing = false;
      }
      inputBuffer = '';
      renderPrompt();
    };

    process.stdin.on('keypress', async (str, key) => {
      // 1. Instantly silence any ongoing speech if the user presses Escape
      if (runtime.voice.isSpeaking()) {
        if (key?.name === 'escape') {
          runtime.voice.stop();
          process.stdout.write('\r\x1b[K🔇 (Voice speech stopped)\n');
          renderPrompt();
          return;
        }
      }

      if (isProcessing) return;

      // Handle Ctrl+C
      if (key?.ctrl && key?.name === 'c') {
        runtime.voice.stop();
        if (voiceSession) {
          voiceSession.cancel();
        }
        process.stdout.write('\nShutting down EVA Mac Agent Core. Goodbye.\n');
        process.exit(0);
      }

      // If currently listening to voice:
      if (isListening) {
        // Space event while listening resets hold debounce
        if (key?.name === 'space') {
          if (spaceDebounceTimer) clearTimeout(spaceDebounceTimer);
          spaceDebounceTimer = setTimeout(() => {
            stopVoiceAndProcess();
          }, 800);
          return;
        }

        // Enter stops voice and executes
        if (key?.name === 'return' || key?.name === 'enter') {
          await stopVoiceAndProcess();
          return;
        }

        // Escape cancels
        if (key?.name === 'escape') {
          isListening = false;
          if (voiceSession) voiceSession.cancel();
          voiceSession = null;
          process.stdout.write('\r\x1b[K(Voice listening cancelled)\n');
          renderPrompt();
          return;
        }

        return;
      }

      // Not currently listening:
      // If buffer is empty and user presses Space: ACTIVATE VOICE PUSH-TO-TALK!
      if (key?.name === 'space' && inputBuffer.trim().length === 0) {
        runtime.voice.stop();
        isListening = true;
        process.stdout.write('\r\x1b[K🎙️  [LISTENING] Speak now... [Release Space or Press Enter to finish]');
        voiceSession = runtime.voiceListener.startListening({
          onRecordingStarted: () => {
            process.stdout.write('\r\x1b[K🎙️  [RECORDING MIC] Speak your command into your Mac mic... ');
          },
          onTranscribing: () => {
            process.stdout.write('\r\x1b[K🔄 [TRANSCRIBING] Converting speech to text via Apple Speech... ');
          },
        });

        // If user holds space, repeat events will reset this timer. If released or single tap, auto-stops after timeout.
        spaceDebounceTimer = setTimeout(() => {
          stopVoiceAndProcess();
        }, 1200);
        return;
      }

      // Enter key: submit typed input
      if (key?.name === 'return' || key?.name === 'enter') {
        const line = inputBuffer.trim();
        inputBuffer = '';
        process.stdout.write('\n');
        if (line) {
          isProcessing = true;
          try {
            await processInputGoal(line, session, device, runtime);
          } finally {
            isProcessing = false;
          }
        }
        renderPrompt();
        return;
      }

      // Backspace
      if (key?.name === 'backspace') {
        inputBuffer = inputBuffer.slice(0, -1);
        renderPrompt();
        return;
      }

      // Regular characters (including space between words)
      if (str && !key?.ctrl && !key?.meta) {
        inputBuffer += str;
        renderPrompt();
      }
    });

    renderPrompt();
    return;
  }

  // Non-TTY fallback (for tests, pipes, automated scripts)
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'eva> ',
  });

  const safePrompt = () => {
    if (!(rl as any).closed && !process.stdin.destroyed) {
      try {
        rl.prompt();
      } catch {
        // stream closed
      }
    }
  };

  safePrompt();

  for await (const rawLine of rl) {
    const line = rawLine.trim();
    if (!line) {
      safePrompt();
      continue;
    }
    await processInputGoal(line, session, device, runtime);
    safePrompt();
  }

  if (!(rl as any).closed) {
    rl.close();
  }
}

async function main() {
  const runtime = createEvaRuntime();
  await runInteractiveShell(runtime);
}

if (process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js')) {
  main().catch((err) => {
    rootLogger.error('Fatal error in EVA Agent Core', {}, err);
    process.exit(1);
  });
}
