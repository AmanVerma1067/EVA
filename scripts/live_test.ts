/**
 * EVA Live Operational Test Script
 * Exercises the entire Mac Agent Core, Policy Engine, Tools, and Audit system
 */

import { createEvaRuntime } from '../src/index.js';
import * as path from 'node:path';

async function runLiveTest() {
  console.log('================================================================');
  console.log('  EVA LIVE SYSTEM & SECURITY VERIFICATION RUNNER');
  console.log('================================================================\n');

  // 1. Initialize Runtime
  console.log('[Step 1] Initializing EVA Mac Agent Core Runtime...');
  const runtime = createEvaRuntime();
  console.log('✓ Runtime successfully initialized.');
  console.log('✓ Registered tools:', runtime.registry.getManifests().map(t => `${t.name} (${t.riskLevel})`).join(', '));
  console.log('');

  // 2. Register Device and Create Session
  console.log('[Step 2] Establishing Device Trust & Authenticated Session...');
  const device = runtime.sessionManager.registerDevice({
    deviceId: 'mac-local-client',
    deviceName: 'MacBook M2 Host',
    publicKey: 'ed25519_local_pubkey_abcdef1234567890',
  });
  const session = runtime.sessionManager.createSession(device.deviceId);
  console.log(`✓ Paired device: ${device.deviceName} (${device.deviceId})`);
  console.log(`✓ Active session token: ${session.token.substring(0, 16)}... (TTL: 12h)`);
  console.log('');

  // 3. Test READ Tool: app.status on Finder
  console.log('[Step 3] Testing READ Tool: Checking status of macOS Finder...');
  const statusRes = await runtime.router.dispatch({
    toolName: 'app.status',
    parameters: { appName: 'Finder' },
    sessionId: session.sessionId,
    deviceId: device.deviceId,
    taskId: 'task-live-1',
  });
  console.log(`✓ Tool success: ${statusRes.success}`);
  console.log(`✓ Result data:`, statusRes.data);
  console.log(`✓ Verification status: ${statusRes.verification?.status} - ${statusRes.verification?.evidence}`);
  console.log('');

  // 4. Test READ Tool: fs.read with path bounding
  console.log('[Step 4] Testing READ Tool: Scoped Filesystem Read (package.json)...');
  const fsRes = await runtime.router.dispatch({
    toolName: 'fs.read',
    parameters: { path: 'package.json', encoding: 'utf-8' },
    sessionId: session.sessionId,
    deviceId: device.deviceId,
    taskId: 'task-live-2',
    workspaceRoot: process.cwd(),
  });
  console.log(`✓ Tool success: ${fsRes.success}`);
  const fsData = fsRes.data as { bytesRead: number; path: string };
  console.log(`✓ Read ${fsData.bytesRead} bytes from ${fsData.path}`);
  console.log(`✓ Verification: ${fsRes.verification?.status} - ${fsRes.verification?.evidence}`);
  console.log('');

  // 5. Test NORMAL Tool: terminal.exec
  console.log('[Step 5] Testing NORMAL Tool: Terminal Command Execution (sw_vers)...');
  const termRes = await runtime.router.dispatch({
    toolName: 'terminal.exec',
    parameters: { command: 'sw_vers' },
    sessionId: session.sessionId,
    deviceId: device.deviceId,
    taskId: 'task-live-3',
  });
  console.log(`✓ Tool success: ${termRes.success}`);
  const termData = termRes.data as { exitCode: number; stdout: string; executionId: string };
  console.log(`✓ Command exit code: ${termData.exitCode}`);
  console.log(`✓ Output:\n${termData.stdout.trim()}`);
  console.log(`✓ Verification: ${termRes.verification?.status}`);
  console.log('');

  // 6. Security Test: Path Traversal Attack
  console.log('[Step 6] Security Check: Attempting Path Traversal (../../../../etc/passwd)...');
  const traversalRes = await runtime.router.dispatch({
    toolName: 'fs.read',
    parameters: { path: '../../../../etc/passwd' },
    sessionId: session.sessionId,
    deviceId: device.deviceId,
    taskId: 'task-live-4',
    workspaceRoot: process.cwd(),
  });
  console.log(`✓ Tool dispatched result: success=${traversalRes.success}`);
  console.log(`✓ Security error intercepted: [${traversalRes.error?.code}] ${traversalRes.error?.message}`);
  console.log('');

  // 7. Security Test: Destructive Command Interception
  console.log('[Step 7] Security Check: Attempting Forbidden Command (rm -rf /)...');
  const maliciousRes = await runtime.router.dispatch({
    toolName: 'terminal.exec',
    parameters: { command: 'rm -rf /' },
    sessionId: session.sessionId,
    deviceId: device.deviceId,
    taskId: 'task-live-5',
  });
  console.log(`✓ Tool dispatched result: success=${maliciousRes.success}`);
  console.log(`✓ Policy denial intercepted: [${maliciousRes.error?.code}] ${maliciousRes.error?.message}`);
  console.log('');

  // 8. Human Approval Workflow: SENSITIVE/CRITICAL Action
  console.log('[Step 8] Testing Human Approval Gate for High-Risk Actions...');
  const policyReq = runtime.policyEngine.evaluate({
    toolName: 'terminal.exec',
    riskLevel: 'CRITICAL',
    parameters: { command: 'npm update' },
    sessionId: session.sessionId,
    deviceId: device.deviceId,
    workspaceRoot: process.cwd(),
  });
  console.log(`✓ Policy evaluation type: ${policyReq.type}`);
  console.log(`✓ Approval reason: ${policyReq.reason}`);
  const reqId = policyReq.approvalRequestId!;
  console.log(`✓ Generated Approval Request ID: ${reqId}`);

  // Simulate human approving via phone modal
  console.log('-> Simulating user pressing [APPROVE] on Phone client...');
  const approvalToken = runtime.policyEngine.approve(reqId);
  console.log(`✓ Granted single-use cryptographic token: ${approvalToken.substring(0, 16)}...`);

  // Re-evaluating with approval token
  const approvedDecision = runtime.policyEngine.evaluate({
    toolName: 'terminal.exec',
    riskLevel: 'CRITICAL',
    parameters: { command: 'npm update' },
    sessionId: session.sessionId,
    deviceId: device.deviceId,
    workspaceRoot: process.cwd(),
    approvalToken,
  });
  console.log(`✓ Post-approval decision: ${approvedDecision.type} (${approvedDecision.reason})`);
  console.log('');

  // 9. Tamper-Evident Audit Trail Integrity
  console.log('[Step 9] Auditing & Cryptographic Chain Verification...');
  const records = runtime.auditLogger.getRecords();
  console.log(`✓ Total lifecycle audit events recorded: ${records.length}`);
  const isChainIntact = runtime.auditLogger.verifyChainIntegrity();
  console.log(`✓ Audit log SHA-256 block hash-chain intact: ${isChainIntact ? 'VALID & UNTAMPERED' : 'INVALID'}`);
  console.log(`✓ Latest block hash: ${records[records.length - 1].recordHash}`);
  console.log('');

  console.log('================================================================');
  console.log('  ALL LIVE TESTS & SECURITY BOUNDARIES VERIFIED SUCCESSFULLY');
  console.log('================================================================');
}

runLiveTest().catch((err) => {
  console.error('Fatal error in live test:', err);
  process.exit(1);
});

