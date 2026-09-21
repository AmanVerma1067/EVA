/**
 * EVA Voice & Companion Gateway Server
 * Serves the mobile/desktop Web Voice Interface and API endpoints
 * Conforms to EVA_AI_Implementation_Master_Spec Phase 3, 4 & 15
 */

import * as http from 'node:http';
import { createEvaRuntime, EvaRuntime } from './index.js';
import { rootLogger } from '../core/logger/Logger.js';

export function createVoiceServer(runtime: EvaRuntime, port = 8765): http.Server {
  const logger = rootLogger.child('server');

  // Pair a web client device
  const device = runtime.sessionManager.registerDevice({
    deviceId: 'web-voice-companion',
    deviceName: 'EVA Voice Companion',
    publicKey: 'ed25519_web_companion_key',
  });
  const session = runtime.sessionManager.createSession(device.deviceId);

  const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    // Serve Web UI
    if (url.pathname === '/' || url.pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(getVoiceUIHtml());
      return;
    }

    // API: Submit Natural Language Voice/Text Goal
    if (url.pathname === '/api/goal' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', async () => {
        try {
          const parsed = JSON.parse(body || '{}');
          const goal = parsed.goal;
          if (!goal || typeof goal !== 'string') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing "goal" in request body' }));
            return;
          }

          logger.info(`Received voice goal: "${goal}"`);
          const response = await runtime.brain.executeGoal({
            goal,
            sessionId: session.sessionId,
            deviceId: device.deviceId,
            speakResponse: true, // Speaks aloud through Mac speakers
          });

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(response));
        } catch (err) {
          logger.error('Error processing goal', {}, err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
      return;
    }

    // API: Status
    if (url.pathname === '/api/status' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ONLINE',
          session: session.sessionId,
          device: device.deviceName,
          tools: runtime.registry.getManifests(),
          memoryRssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        })
      );
      return;
    }

    // API: Audit Records
    if (url.pathname === '/api/audit' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          records: runtime.auditLogger.getRecords(),
          chainIntegrity: runtime.auditLogger.verifyChainIntegrity(),
        })
      );
      return;
    }

    // API: Create Device Pairing Request
    if (url.pathname === '/api/pair' && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        try {
          const { deviceId, deviceName, publicKey } = JSON.parse(body || '{}');
          if (!deviceId) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing deviceId' }));
            return;
          }
          const code = runtime.pairingManager.createPairingRequest(deviceId, deviceName || 'Mobile Phone', publicKey);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ pairingCode: code, expiresSeconds: 300 }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
      return;
    }

    // API: Approve Pairing Request
    if (url.pathname === '/api/approve-pairing' && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        try {
          const { pairingCode } = JSON.parse(body || '{}');
          const trusted = runtime.pairingManager.approvePairing(pairingCode);
          if (!trusted) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid or expired pairing code' }));
            return;
          }
          const token = runtime.pairingManager.generateAuthToken(trusted.deviceId);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, device: trusted, authToken: token }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
      return;
    }

    // API: List Devices
    if (url.pathname === '/api/devices' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ devices: runtime.pairingManager.getDevices() }));
      return;
    }

    // API: Revoke Device
    if (url.pathname === '/api/revoke-device' && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        try {
          const { deviceId } = JSON.parse(body || '{}');
          const ok = runtime.pairingManager.revokeDevice(deviceId);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ revoked: ok }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
      return;
    }

    // API: Memory Context & Projects
    if (url.pathname === '/api/memory' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          projects: runtime.memory.listProjects(),
          context: runtime.memory.getContext(),
        })
      );
      return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  });

  return server;
}

function getVoiceUIHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>EVA — Voice Operating Companion</title>
  <style>
    :root {
      --bg: #0b0f19;
      --card: #151d30;
      --border: #232f4e;
      --accent: #38bdf8;
      --accent-glow: rgba(56, 189, 248, 0.4);
      --text: #f1f5f9;
      --text-muted: #94a3b8;
      --success: #34d399;
      --danger: #f87171;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      padding: 1.5rem;
    }
    header {
      width: 100%;
      max-width: 600px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 1rem;
      border-bottom: 1px solid var(--border);
    }
    .brand { font-size: 1.25rem; font-weight: 700; letter-spacing: 0.1em; color: var(--accent); }
    .badge {
      font-size: 0.75rem;
      padding: 0.25rem 0.6rem;
      background: rgba(52, 211, 153, 0.15);
      color: var(--success);
      border: 1px solid rgba(52, 211, 153, 0.3);
      border-radius: 9999px;
      font-weight: 600;
    }
    main {
      width: 100%;
      max-width: 600px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2rem;
      margin: auto 0;
    }
    .orb-container {
      position: relative;
      width: 160px;
      height: 160px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .mic-button {
      width: 120px;
      height: 120px;
      border-radius: 50%;
      background: radial-gradient(circle, #1e293b 0%, #0f172a 100%);
      border: 2px solid var(--accent);
      color: var(--accent);
      cursor: pointer;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.4rem;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: 0 0 25px var(--accent-glow);
      user-select: none;
      -webkit-tap-highlight-color: transparent;
    }
    .mic-button:hover {
      transform: scale(1.05);
      box-shadow: 0 0 35px var(--accent-glow);
    }
    .mic-button.listening {
      border-color: var(--danger);
      color: var(--danger);
      box-shadow: 0 0 45px rgba(248, 113, 113, 0.6);
      animation: pulse 1.5s infinite;
    }
    @keyframes pulse {
      0% { transform: scale(1); box-shadow: 0 0 20px rgba(248, 113, 113, 0.5); }
      50% { transform: scale(1.08); box-shadow: 0 0 50px rgba(248, 113, 113, 0.8); }
      100% { transform: scale(1); box-shadow: 0 0 20px rgba(248, 113, 113, 0.5); }
    }
    .mic-icon { font-size: 2.2rem; }
    .mic-label { font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
    .status-text {
      font-size: 1rem;
      color: var(--text-muted);
      text-align: center;
      min-height: 1.5rem;
    }
    .transcript-box {
      width: 100%;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.25rem;
      min-height: 120px;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .box-title { font-size: 0.75rem; font-weight: 700; color: var(--accent); text-transform: uppercase; letter-spacing: 0.05em; }
    .transcript-content { font-size: 1.05rem; line-height: 1.5; color: var(--text); }
    .response-content { font-size: 1rem; line-height: 1.5; color: var(--success); font-weight: 500; }
    .input-row {
      width: 100%;
      display: flex;
      gap: 0.5rem;
    }
    .input-box {
      flex: 1;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 0.75rem 1rem;
      color: var(--text);
      font-size: 0.95rem;
      outline: none;
      transition: border-color 0.2s;
    }
    .input-box:focus { border-color: var(--accent); }
    .send-btn {
      padding: 0.75rem 1.25rem;
      background: var(--accent);
      color: #0f172a;
      border: none;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.2s;
    }
    .send-btn:hover { opacity: 0.9; }
    .examples {
      width: 100%;
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      justify-content: center;
    }
    .example-pill {
      font-size: 0.8rem;
      background: rgba(35, 47, 78, 0.6);
      border: 1px solid var(--border);
      padding: 0.35rem 0.75rem;
      border-radius: 9999px;
      color: var(--text-muted);
      cursor: pointer;
      transition: all 0.2s;
    }
    .example-pill:hover {
      border-color: var(--accent);
      color: var(--text);
      background: rgba(56, 189, 248, 0.1);
    }
    footer { font-size: 0.75rem; color: var(--text-muted); text-align: center; }
  </style>
</head>
<body>
  <header>
    <div class="brand">EVA // VOICE</div>
    <div class="badge" id="agentBadge">Mac Core Online</div>
  </header>

  <main>
    <div class="orb-container">
      <button class="mic-button" id="micBtn">
        <span class="mic-icon">🎙️</span>
        <span class="mic-label" id="micLabel">Tap to Speak</span>
      </button>
    </div>

    <div class="status-text" id="statusText">Tap the microphone or press Spacebar to speak</div>

    <div class="transcript-box">
      <div class="box-title">Live Conversation</div>
      <div class="transcript-content" id="userTranscript">Ready for voice input...</div>
      <div class="response-content" id="agentResponse"></div>
    </div>

    <form class="input-row" id="textForm">
      <input type="text" class="input-box" id="textInput" placeholder="Or type a command naturally..." autocomplete="off">
      <button type="submit" class="send-btn">Send</button>
    </form>

    <div class="examples">
      <span class="example-pill" onclick="sendGoal('send hi to shivam in whatsapp')">"send hi to shivam"</span>
      <span class="example-pill" onclick="sendGoal('call shivam on whatsapp')">"call shivam on whatsapp"</span>
      <span class="example-pill" onclick="sendGoal('video call shivam on whatsapp')">"video call shivam"</span>
      <span class="example-pill" onclick="sendGoal('open vs code')">"open vs code"</span>
      <span class="example-pill" onclick="sendGoal('review project with claude')">"review project with claude"</span>
      <span class="example-pill" onclick="sendGoal('is Finder running?')">"is Finder running?"</span>
      <span class="example-pill" onclick="sendGoal('read package.json')">"read package.json"</span>
    </div>
  </main>

  <footer>
    EVA Private AI Operating Layer • Press [Space] to talk • Real-time Policy & Verification
  </footer>

  <script>
    const micBtn = document.getElementById('micBtn');
    const micLabel = document.getElementById('micLabel');
    const statusText = document.getElementById('statusText');
    const userTranscript = document.getElementById('userTranscript');
    const agentResponse = document.getElementById('agentResponse');
    const textForm = document.getElementById('textForm');
    const textInput = document.getElementById('textInput');

    let recognition = null;
    let isListening = false;

    // Initialize Web Speech API
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        isListening = true;
        micBtn.classList.add('listening');
        micLabel.textContent = 'Listening...';
        statusText.textContent = 'Listening to your microphone... speak now!';
        userTranscript.textContent = '...';
        agentResponse.textContent = '';
      };

      recognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        userTranscript.textContent = '"' + transcript + '"';
        if (event.results[0].isFinal) {
          sendGoal(transcript);
        }
      };

      recognition.onerror = (event) => {
        statusText.textContent = 'Speech error: ' + event.error;
        stopListening();
      };

      recognition.onend = () => {
        stopListening();
      };
    } else {
      statusText.textContent = 'Speech recognition not supported in this browser. Use Chrome/Safari or type below.';
    }

    function toggleListening() {
      if (!recognition) return;
      if (isListening) {
        recognition.stop();
      } else {
        try {
          recognition.start();
        } catch (e) {
          console.error(e);
        }
      }
    }

    function stopListening() {
      isListening = false;
      micBtn.classList.remove('listening');
      micLabel.textContent = 'Tap to Speak';
      statusText.textContent = 'Tap the microphone or press Spacebar to speak';
    }

    micBtn.addEventListener('click', toggleListening);

    // Spacebar to talk
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && document.activeElement !== textInput && !isListening) {
        e.preventDefault();
        toggleListening();
      }
    });

    async function sendGoal(goalText) {
      if (!goalText || !goalText.trim()) return;
      userTranscript.textContent = '"' + goalText + '"';
      statusText.textContent = 'EVA Brain planning & executing...';
      agentResponse.textContent = 'Analyzing and verifying...';

      try {
        const res = await fetch('/api/goal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ goal: goalText })
        });
        const data = await res.json();
        statusText.textContent = 'Completed';
        if (data.enhanced && data.enhanced.enhancedPrompt !== goalText) {
          userTranscript.innerHTML = '<strong>Heard:</strong> "' + goalText + '"<br>' +
            '<span style="color:var(--accent);font-size:0.9rem;">✨ <strong>Enhanced:</strong> "' + data.enhanced.enhancedPrompt + '"</span>';
        } else {
          userTranscript.textContent = '"' + goalText + '"';
        }
        agentResponse.textContent = data.responseText || 'Done.';
      } catch (err) {
        statusText.textContent = 'Failed to connect to EVA agent';
        agentResponse.textContent = 'Error: ' + err.message;
      }
    }

    textForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = textInput.value.trim();
      if (val) {
        sendGoal(val);
        textInput.value = '';
      }
    });
  </script>
</body>
</html>`;
}

// Standalone runner
if (process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js')) {
  const runtime = createEvaRuntime();
  const port = process.env.EVA_PORT ? parseInt(process.env.EVA_PORT, 10) : 8765;
  const server = createVoiceServer(runtime, port);

  server.listen(port, '0.0.0.0', () => {
    console.log('\n================================================================');
    console.log(`  🎙️  EVA VOICE SERVER ONLINE: http://localhost:${port}`);
    console.log('================================================================');
    console.log(`• Open in Safari or Chrome: http://localhost:${port}`);
    console.log('• Tap the microphone button or press Spacebar to speak!');
    console.log('• EVA will listen, plan, verify on macOS, and speak back.\n');
  });
}

