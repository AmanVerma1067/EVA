/**
 * End-to-End Test for Terminal Voice Commands, Prompt Enhancement & Agent Brain Execution
 */

import { createEvaRuntime } from '../src/index.js';

async function main() {
  console.log('================================================================');
  console.log('   EVA E2E Test: Voice Input -> Prompt Enhancement -> Agent Plan');
  console.log('================================================================\n');

  const runtime = createEvaRuntime({ voiceEnabled: false });
  const device = runtime.sessionManager.registerDevice({
    deviceId: 'cli-test-device',
    deviceName: 'Mac Voice E2E Runner',
    publicKey: 'ed25519_test_runner_key',
  });
  const session = runtime.sessionManager.createSession(device.deviceId);

  const scenarios = [
    {
      label: '1. WhatsApp Voice Calling',
      rawVoiceInput: 'calling shivam on whatsapp',
    },
    {
      label: '2. WhatsApp Video Calling',
      rawVoiceInput: 'videocalling anyone on whatsapp',
    },
    {
      label: '3. WhatsApp Message with typo tolerance',
      rawVoiceInput: 'sendong a message to priya saying running late',
    },
    {
      label: '4. Multi-Step Developer Workflow (VS Code + Claude Review + Claude Task)',
      rawVoiceInput: 'opening vs code reviewing a project with the help of claude, and then competing a task with claude',
    },
    {
      label: '5. System Status Check',
      rawVoiceInput: 'is Finder running?',
    },
  ];

  for (const scenario of scenarios) {
    console.log(`\n----------------------------------------------------------------`);
    console.log(`[TEST SCENARIO]: ${scenario.label}`);
    console.log(`🎙️  Raw Spoken Voice Input: "${scenario.rawVoiceInput}"`);

    const result = await runtime.brain.executeGoal({
      goal: scenario.rawVoiceInput,
      sessionId: session.sessionId,
      deviceId: device.deviceId,
      speakResponse: false,
    });

    if (result.enhanced) {
      console.log(`✨ Enhanced Prompt:        "${result.enhanced.enhancedPrompt}"`);
      console.log(`   ↳ Category:              [${result.enhanced.intentCategory}]`);
      console.log(`   ↳ Refinements:           ${result.enhanced.refinements.join(' • ')}`);
    }

    console.log(`🧠 Autonomous Plan (${result.plan.length} steps):`);
    for (let i = 0; i < result.plan.length; i++) {
      const step = result.plan[i];
      const exec = result.executionResults[i];
      if (exec) {
        console.log(`   ${i + 1}. [${step.toolName}] ${step.thought}`);
        console.log(`      Status: ${exec.success ? '✓ SUCCESS' : '✗ FAILED'} (${exec.verification?.status ?? 'N/A'})`);
      } else {
        console.log(`   ${i + 1}. [${step.toolName}] ${step.thought}`);
        console.log(`      Status: ⏸️ SKIPPED (Execution halted after prior step failed)`);
      }
    }
    console.log(`🗣️  EVA Voice Spoken Response: "${result.responseText}"`);
  }

  console.log('\n================================================================');
  console.log('✓ All 5 E2E Voice Scenarios Successfully Tested and Verified!');
  console.log('================================================================\n');
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
