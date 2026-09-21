# EVA Agent — Comprehensive Improvement Plan

> **Date:** 2026-09-12  
> **Status:** PLAN ONLY — No changes have been executed.  
> **Author:** Automated Audit & Review

---

## Executive Summary: Why Nothing Works Correctly

After a thorough code audit of every tool's actual execution path, the root cause is clear:

1. **All 119 tests pass using mock runners** — zero lines of real macOS execution code are ever tested.
2. **Hardcoded binary paths** (`/opt/homebrew/bin/code`, `/opt/homebrew/bin/claude`) fail on standard installations.
3. **Process verification is fundamentally broken** — `pgrep -i <first-word>` gives false positives and negatives for every multi-word app.
4. **Verification `catch` blocks silently return `verified: true`** — making failures invisible.
5. **PromptEnhancer destroys project names and task descriptions** before AgentBrain can parse them.
6. **WhatsApp call automation silently fails** — entire call trigger is wrapped in `try...end try`.
7. **Thermal status falsely reports "elevated temperature"** on every Apple Silicon Mac.
8. **Claude Code runs detached from VS Code** — user wants it in VS Code's integrated terminal.
9. **PolicyEngine blocks `claude.complete_task`** (SENSITIVE risk) without interactive approval callback.

---

## Tool-by-Tool Audit & Proposed Fixes

---

### 1. VSCodeTool (`tools/developer/VSCodeTool.ts`)

#### Current Behavior
```
Line 102: await execFileAsync('/opt/homebrew/bin/code', [target])
Line 105: await execFileAsync('open', ['-a', 'Visual Studio Code', target])  // fallback
```

#### Bugs Found

| # | Bug | Severity |
|---|-----|----------|
| 1 | **Hardcoded path `/opt/homebrew/bin/code`** — VS Code CLI installed via DMG puts `code` at `/usr/local/bin/code`. On Intel Macs, Homebrew is at `/usr/local/bin`. If the user hasn't added it to PATH via Shell Command, it doesn't exist at all. First attempt always throws `ENOENT`. | 🔴 CRITICAL |
| 2 | **Verification `catch` returns `verified: true`** (line 153-158) — When `pgrep -i Code` exits with code 1 (not found), `execFileAsync` rejects. The catch block catches it and returns `verified: true, status: 'CONFIRMED'`. Verification can NEVER fail. | 🔴 CRITICAL |
| 3 | **`resolveDesktopProjectPath` only searches `~/Desktop` and `workspaceRoot`** — Projects in `~/Documents`, `~/Projects`, `~/Developer` are never found. Falls back to creating a non-existent path inside workspaceRoot. | 🟡 MEDIUM |
| 4 | **User reported: "open D2S in VS Code" adds a file to the directory"** — This happens because: (a) `/opt/homebrew/bin/code` throws ENOENT, (b) fallback `open -a "Visual Studio Code" <path>` is called, but if the path resolve creates a non-existent relative path, VS Code may interpret it as a new file creation request. | 🔴 CRITICAL |

#### Proposed Fix
```typescript
// Replace hardcoded path with dynamic PATH-based resolution
private async findCodeCli(): Promise<string> {
  // Try common locations in order
  const candidates = [
    '/usr/local/bin/code',                    // DMG + "Install code in PATH"
    '/opt/homebrew/bin/code',                 // Homebrew Apple Silicon
    '/usr/local/Homebrew/bin/code',           // Homebrew Intel
    path.join(os.homedir(), '.vscode/cli/code'), // VS Code CLI
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  // Final attempt: use `which code` to find it on PATH
  try {
    const { stdout } = await execFileAsync('which', ['code']);
    const found = stdout.trim();
    if (found && fs.existsSync(found)) return found;
  } catch { /* not in PATH */ }
  return ''; // Signal to use `open -a` fallback
}

// Fix execution
const codeCli = await this.findCodeCli();
if (codeCli) {
  await execFileAsync(codeCli, [target], { signal: ctx.abortSignal });
} else {
  await execFileAsync('open', ['-a', 'Visual Studio Code', target], { signal: ctx.abortSignal });
}

// Fix verification — don't catch and return true
public async verify(...): Promise<VerificationResult> {
  if (!result.success) {
    return { verified: false, status: 'FAILED', evidence: `...` };
  }
  try {
    const { stdout } = await execFileAsync('pgrep', ['-x', 'Code']);
    const running = stdout.trim().length > 0;
    return {
      verified: running,
      status: running ? 'CONFIRMED' : 'FAILED',
      evidence: running ? '...' : 'VS Code process not found.',
    };
  } catch {
    // pgrep exits 1 = no match. This is a FAILURE, not success.
    return { verified: false, status: 'FAILED', evidence: 'VS Code not found in process table.' };
  }
}
```

---

### 2. AppLaunchTool (`tools/application/AppLaunchTool.ts`)

#### Current Behavior
```
Line 100: await execFileAsync('open', ['-a', appToLaunch])
Line 161: const query = appToVerify.split(' ')[0] || appToVerify;  // Verification
Line 162: const { stdout } = await execFileAsync('pgrep', ['-i', query]);
```

#### Bugs Found

| # | Bug | Severity |
|---|-----|----------|
| 1 | **`pgrep` query takes first word of app name** — For `"Visual Studio Code"`, searches `pgrep -i Visual`. VS Code's process is named `Code`. Always returns 0 PIDs → "not running" even when it IS running. | 🔴 CRITICAL |
| 2 | **For `"System Settings"`, searches `pgrep -i System`** — Matches system daemons (`systemstats`, `systemsoundserverd`). Always returns PIDs → "running" even when it's NOT open. | 🔴 CRITICAL |
| 3 | **Verification `catch` returns `verified: result.success (true)`** (line 174-179) — Same pattern as VSCodeTool. Even if process not found, reports success. | 🔴 CRITICAL |
| 4 | **`normalizeMacAppName` still uses hardcoded `APP_NAME_MAP`** despite user saying "don't hardcode" — However, this map IS needed for common aliases. The issue is it's limited. Should be extensible or use `mdfind` for dynamic discovery. | 🟡 MEDIUM |
| 5 | **`open -a Finder` doesn't open a Finder window** — It only activates Finder. If no window was open, nothing visible happens. | 🟡 MEDIUM |

#### Proposed Fix
```typescript
// Replace split(' ')[0] with proper process name mapping
const PROCESS_NAME_MAP: Record<string, string> = {
  'Visual Studio Code': 'Code',
  'Google Chrome': 'Chrome',
  'System Settings': 'System Settings',
  'Activity Monitor': 'Activity Monitor',
};

// Use osascript to check if app is running (reliable on macOS)
private async isAppRunning(appName: string): Promise<boolean> {
  try {
    const script = `tell application "System Events" to (name of processes) contains "${appName}"`;
    const { stdout } = await execFileAsync('osascript', ['-e', script]);
    return stdout.trim() === 'true';
  } catch {
    return false;
  }
}

// Fix verification catch block — pgrep exit 1 means NOT FOUND
catch {
  return {
    verified: false,
    status: 'FAILED',
    evidence: `Process '${appToVerify}' was not found after launch.`,
  };
}
```

---

### 3. AppStatusTool (`tools/application/AppStatusTool.ts`)

#### Bugs Found

| # | Bug | Severity |
|---|-----|----------|
| 1 | **Same `split(' ')[0]` pgrep bug** as AppLaunchTool — `"Visual Studio Code"` → `pgrep -i Visual` → always "not running". `"System Settings"` → `pgrep -i System` → always "running". | 🔴 CRITICAL |
| 2 | **No `-x` flag on pgrep** — `-i` does case-insensitive substring match on process name, matching system daemons. Should use `-x` for exact match or use AppleScript/`lsappinfo`. | 🔴 CRITICAL |

#### Proposed Fix
Same as AppLaunchTool — use AppleScript `System Events` to reliably check process existence by application name rather than `pgrep`.

---

### 4. ClaudeCodeTool (`tools/claude/ClaudeCodeTool.ts`)

#### Current Behavior
```
Line 64: execFile('/opt/homebrew/bin/claude', ['-p', reviewPrompt, '--no-session-persistence'], { cwd: targetDir })
Line 186: execFile('/opt/homebrew/bin/claude', ['-p', params.taskPrompt, '--permission-mode', 'auto'], { cwd: targetDir })
```

#### Bugs Found

| # | Bug | Severity |
|---|-----|----------|
| 1 | **Hardcoded `/opt/homebrew/bin/claude`** — Claude Code is normally installed via `npm install -g @anthropic-ai/claude-code`. Under `nvm`, binary is at `~/.nvm/versions/node/<ver>/bin/claude`. Under `fnm`, at `~/.fnm/node-versions/<ver>/installation/bin/claude`. ENOENT on most setups. | 🔴 CRITICAL |
| 2 | **Runs as detached child process, NOT in VS Code terminal** — User explicitly requested: "not opening claude in vs code terminal". Claude Code should launch inside VS Code's integrated terminal for interactive use. | 🔴 CRITICAL |
| 3 | **`ClaudeTaskTool` has `riskLevel: 'SENSITIVE'`** — PolicyEngine requires interactive approval. In many execution contexts (server, voice-only), no `onApprovalRequired` callback exists → instant `POLICY_DENIED`. | 🟡 MEDIUM |
| 4 | **`child.stdin?.end()` closes stdin** — If Claude Code needs interactive input (auth, confirmation), it fails immediately. | 🟡 MEDIUM |
| 5 | **60s/90s timeouts may be too short** for real code reviews on large projects. | 🟠 LOW |

#### Proposed Fix — Dynamic Binary Discovery
```typescript
private async findClaudeCli(): Promise<string> {
  const candidates = [
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
    path.join(os.homedir(), '.nvm/versions/node', '*/bin/claude'),  // glob
  ];
  // Use `which claude` as primary approach
  try {
    const { stdout } = await execFileAsync('which', ['claude']);
    const found = stdout.trim();
    if (found) return found;
  } catch {}
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error('Claude Code CLI not found. Install with: npm install -g @anthropic-ai/claude-code');
}
```

#### Proposed Fix — Launch Claude Code Inside VS Code Terminal
```typescript
// Option A: Use VS Code CLI to open terminal and run command
const codeCli = await this.findCodeCli();
if (codeCli) {
  // Open the project in VS Code first
  await execFileAsync(codeCli, [targetDir]);
  // Then use VS Code's integrated terminal to run claude
  await execFileAsync('osascript', ['-e', `
    tell application "Visual Studio Code"
      activate
    end tell
    delay 0.5
    tell application "System Events"
      tell process "Code"
        -- Open new terminal: Cmd+Shift+\`
        keystroke "\`" using {command down, shift down}
        delay 0.5
        -- Type claude command
        keystroke "claude -p \\"${reviewPrompt}\\""
        delay 0.2
        key code 36 -- Enter
      end tell
    end tell
  `]);
}

// Option B: Use VS Code URI handler (more reliable)
// code --goto <file> && code --command 'workbench.action.terminal.sendSequence' --args '{"text":"claude\\n"}'
```

---

### 5. WhatsAppTool (`tools/messaging/WhatsAppTool.ts`)

#### Current Behavior
Uses AppleScript `System Events` to:
1. Activate WhatsApp
2. Press Escape × 2, then Cmd+N to open search
3. Type recipient name, arrow down, Enter to open chat
4. Set clipboard to message, Cmd+V, Enter to send
5. For calls: scan menu bar items for "Voice Call" / "Video Call" menu items

#### Bugs Found

| # | Bug | Severity |
|---|-----|----------|
| 1 | **Requires macOS Accessibility permissions (TCC)** — Without granting Terminal/iTerm Accessibility access in System Settings → Privacy & Security, AppleScript `System Events` throws error `-1743` or `-600` immediately. No pre-check or helpful error message. | 🔴 CRITICAL |
| 2 | **Message tool overwrites system clipboard** (`set the clipboard to "${cleanMessage}"`) — Destroys whatever the user had copied. Never restores original clipboard contents. | 🟡 MEDIUM |
| 3 | **Voice/Video Call trigger is entirely wrapped in `try...end try`** (lines 222-241, 351-370) — If the menu bar search fails to find "Voice Call" or "Video Call" (which it will on modern WhatsApp Catalyst with different UI hierarchy), the error is silently swallowed. The tool reports `callInitiated: true` and speaks "Voice call initiated to X on WhatsApp" even though NOTHING happened. | 🔴 CRITICAL |
| 4 | **Timing delays are hardcoded** (0.3s, 0.6s, 0.8s, 1.0s) — On slower Macs or when WhatsApp is cold-starting, these may be insufficient, causing keystrokes to be sent before UI is ready. | 🟡 MEDIUM |
| 5 | **No verification for message delivery** — `verify()` just returns `verified: true` if execute succeeded. No actual check that the message was sent. | 🟡 MEDIUM |
| 6 | **AppleScript injection vulnerability** — `sanitizeRecipient` only escapes double quotes, but backslashes, newlines, and other AppleScript metacharacters could break or inject code. | 🟠 LOW |

#### Proposed Fix
```typescript
// 1. Pre-check Accessibility permissions
private async checkAccessibility(): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('osascript', ['-e',
      'tell application "System Events" to get name of first process whose frontmost is true'
    ]);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

// 2. Save and restore clipboard
const script = `
  set savedClip to the clipboard
  ...
  set the clipboard to savedClip
`;

// 3. Remove try...end try around call trigger — let errors propagate
// Or: Add explicit error reporting
if not callTriggered then
  error "Could not find Voice Call button or menu item in WhatsApp"
end if

// 4. Use dynamic waits with UI element existence checks instead of fixed delays
repeat while not (exists text field 1 of window 1)
  delay 0.1
end repeat
```

---

### 6. BrowserTool (`tools/browser/BrowserTool.ts`)

#### Current Behavior
```
Line 60-61: const args = params.browser ? ['-a', params.browser, params.url] : [params.url];
            await execFileAsync('open', args);
```

#### Bugs Found

| # | Bug | Severity |
|---|-----|----------|
| 1 | **Input schema requires valid URL** (`z.string().url()`) — When PromptEnhancer sends `"firebase"` as a target, it must be converted to a full URL first. If a non-URL string arrives, Zod validation fails with `VALIDATION_FAILED`. | 🟡 MEDIUM |
| 2 | **`browser.read_page` doesn't follow redirects** — `http.get` doesn't handle 301/302 redirects. Many sites redirect HTTP→HTTPS or www→non-www. | 🟡 MEDIUM |
| 3 | **No User-Agent header** — Some sites block requests without a User-Agent, returning 403. | 🟠 LOW |

#### Proposed Fix
```typescript
// Handle redirects
const res = await follow302(params.url, { maxRedirects: 5, timeout: 10000 });

// Add User-Agent
const req = client.get(params.url, {
  headers: { 'User-Agent': 'EVA-Agent/1.0' },
}, ...);
```

---

### 7. TerminalExecTool (`tools/terminal/TerminalExecTool.ts`)

#### Current Behavior
```
Line 65-82: exec(params.command, { cwd: effectiveCwd, timeout, maxBuffer: 1MB })
```

#### Bugs Found

| # | Bug | Severity |
|---|-----|----------|
| 1 | **Uses `exec()` (shell mode), not `execFile()`** — Enables shell injection. If `params.command` contains `;rm -rf /` or similar, it executes. The planner constructs commands from user input (e.g., `open -a "${normalizedApp}" "${target}"`). | 🟡 MEDIUM |
| 2 | **No PATH inheritance guarantee** — `exec()` inherits process environment, but if EVA was launched from a context with limited PATH (e.g., launchd), tools like `npm`, `node`, `git` may not be found. | 🟡 MEDIUM |
| 3 | **`error.code` is checked as number** (line 73-77) — Node's `exec` callback error has `error.code` as `string` (signal name like `'SIGTERM'`) or `number` (exit code). The check `typeof error.code !== 'number'` incorrectly rejects signal-killed processes. | 🟠 LOW |

#### Proposed Fix
```typescript
// Use explicit PATH
const envWithPath = {
  ...process.env,
  PATH: `/usr/local/bin:/opt/homebrew/bin:${process.env.PATH}`,
};
exec(params.command, { cwd: effectiveCwd, timeout, maxBuffer, env: envWithPath });
```

---

### 8. MacSystemStatusTool (`tools/system/MacSystemStatusTool.ts`)

#### Current Behavior
```
Line 99-100: const hasActiveWarning = (lowerTherm.includes('thermal warning') && !lowerTherm.includes('no thermal warning')) ||
                                      (lowerTherm.includes('pressure') && !lowerTherm.includes('no thermal pressure'));
```

#### Bugs Found

| # | Bug | Severity |
|---|-----|----------|
| 1 | **False positive thermal warning on Apple Silicon** — Normal `pmset -g therm` output includes `CPU_Scheduler_Limit = 100` and `Thermal_Pressure = Nominal`. The word `"pressure"` is present, and `"no thermal pressure"` is NOT present. So `hasActiveWarning = true` even when thermals are perfectly normal. EVA speaks: "Your Mac thermals are experiencing elevated temperature" on every single query. | 🔴 CRITICAL |
| 2 | **Battery "charging" detection** (line 86) — `battRaw.includes('charging') && !battRaw.includes('not charging')` could match `"finishing charge"` or `"charged"` incorrectly. | 🟠 LOW |

#### Proposed Fix
```typescript
// Fix thermal detection — check for specific values, not substring matches
const hasActiveWarning =
  (lowerTherm.includes('thermal warning level') && !lowerTherm.includes('thermal warning level = 0')) ||
  (lowerTherm.includes('thermal_pressure') && !lowerTherm.includes('thermal_pressure = nominal'));
// Or parse the actual value:
const pressureMatch = lowerTherm.match(/thermal_pressure\s*=\s*(\w+)/i);
const isElevated = pressureMatch && pressureMatch[1].toLowerCase() !== 'nominal';
```

---

## Planner / Brain Bugs

---

### 9. PromptEnhancer (`core/planner/PromptEnhancer.ts`)

#### Bugs Found

| # | Bug | Severity |
|---|-----|----------|
| 1 | **Compound developer intents (7a-7c) destroy project names and task descriptions** — When user says "Open D2S in VS Code and review with Claude", PromptEnhancer rewrites it to generic `"Open project D2S in Visual Studio Code and review with Claude Code."` The project name survives here, BUT the task prompt in 7a is lost entirely: `"Open project in Visual Studio Code, perform an automated codebase review with Claude Code, and use Claude Code to execute the task."` — no task description preserved. | 🟡 MEDIUM |
| 2 | **Intent 5 (`inAppMatch` regex) matches `"on"` as app preposition** — `"open vs code on myproject"` parses `target = "vs code"` and `app = "myproject"`, producing `open -a "Myproject" "vs code"`. | 🟡 MEDIUM |
| 3 | **"Open firebase in chrome"** — PromptEnhancer's `inAppMatch` regex: `^(?:open|launch|start)\s+(.+?)\s+(?:in|with|using|on)\s+([a-zA-Z0-9 ._-]+?)[.?]?$` captures `target = "fire base"` (from speech transcript) and `app = "chrome"`. Browser case A converts non-domain targets to Google search: `https://www.google.com/search?q=fire%20base`. This is reasonable but not ideal — should recognize "firebase" as `firebase.google.com`. | 🟡 MEDIUM |

#### Proposed Fix
```typescript
// 1. Preserve task descriptions through enhancement pipeline
// Pass entities.taskDescription through to AgentBrain

// 2. Fix "on" preposition matching — exclude "on" when target contains known app keywords
const inAppMatch = cleaned.match(/^(?:open|launch|start)\s+(.+?)\s+(?:in|with|using)\s+([a-zA-Z0-9 ._-]+?)[.?]?$/i);
// Note: removed "on" from the preposition list, OR add special handling for "on <project>"

// 3. Add well-known web service recognition (non-hardcoded, use domain guessing)
function guessUrl(target: string): string {
  // Common patterns: "firebase" → firebase.google.com, "github" → github.com
  const cleanTarget = target.toLowerCase().replace(/\s+/g, '');
  if (cleanTarget.includes('.')) return `https://${cleanTarget}`;
  return `https://www.google.com/search?q=${encodeURIComponent(target)}`;
}
```

---

### 10. AgentBrain (`core/planner/AgentBrain.ts`)

#### Bugs Found

| # | Bug | Severity |
|---|-----|----------|
| 1 | **`inAppMatch` (line 236) regex includes "on" preposition** — Same as PromptEnhancer issue. `"open D2S on desktop in vs code"` can mismatch if the enhanced prompt restructures the sentence. | 🟡 MEDIUM |
| 2 | **No feedback loop — spoke summary is the LAST step's summary only** — In multi-step plans (e.g., open VS Code + review with Claude), `spokenSummary` is overwritten at each step. If step 1 (vscode.open) succeeds and step 2 (claude.review) fails, the user only hears the step 2 failure. Step 1 success is lost. | 🟡 MEDIUM |
| 3 | **`workspaceRoot` defaults to `process.cwd()`** in ToolRouter (line 61) — This means `resolveDesktopProjectPath` always receives `/Users/aman/Desktop/EVA` as workspace, not the target project. When no `path` param is provided, vscode.open opens EVA itself. | 🟡 MEDIUM |
| 4 | **Verification failure is invisible to user** — ToolRouter returns `success: verification.verified` (line 288). But verification for most tools either silently returns `true` (catch blocks) or checks wrong process names. The user never knows when something actually fails. | 🔴 CRITICAL |

---

## Cross-Cutting Issues

---

### 11. Voice System (`voice/VoiceSystem.ts`)

| # | Issue | Severity |
|---|-------|----------|
| 1 | **Voice `Tara` may not be installed** — macOS doesn't include `Tara` by default. If missing, `/usr/bin/say -v Tara` fails silently (outputs nothing). Should check `say -v ?` for availability and fall back. | 🟡 MEDIUM |
| 2 | **Status display still shows `Samantha`** — `src/index.ts` line ~219 displays `Voice TTS: ENABLED (Samantha)` hardcoded, not reading from `voice.getVoice()`. | 🟠 LOW |
| 3 | **`killall say` in `stop()`** — Kills ALL `say` processes on the system, not just EVA's. Could interfere with other apps using TTS. | 🟠 LOW |

#### Proposed Fix
```typescript
// Auto-detect available voice
const available = await this.getAvailableVoices();
if (!available.includes(this.voice)) {
  // Fallback to a known-available voice
  this.voice = available.find(v => ['Samantha', 'Alex', 'Karen', 'Daniel'].includes(v)) || 'Samantha';
}
```

---

### 12. Missing Capabilities (User Requests Not Yet Implemented)

| # | Requested Feature | Status |
|---|------------------|--------|
| 1 | **Open Claude Code inside VS Code's integrated terminal** — User said: "not opening claude in vs code terminal" | ❌ NOT IMPLEMENTED |
| 2 | **Continuous feedback and status updates during long operations** — User said: "continuously provide feedback, status and everything about it" | ⚠️ PARTIAL — Claude Code streams stdout, but VS Code open and WhatsApp have no progress reporting |
| 3 | **Opening ANY project on Desktop in VS Code** — Works for `~/Desktop` but not other locations | ⚠️ PARTIAL |
| 4 | **Mac system monitoring: heating accuracy** — Currently false-positive on every Apple Silicon Mac | ❌ BROKEN |
| 5 | **Running commands in VS Code terminal** (e.g., `npm test` inside VS Code) — Currently runs in EVA's own Node process | ❌ NOT IMPLEMENTED |
| 6 | **Voice interruption mid-sentence** — Implemented but may still have edge cases | ✅ IMPLEMENTED |

---

## Priority Order for Fixes

### Phase 1: Critical Path — Make Core Commands Work (High Impact, Medium Effort)

1. **Fix `pgrep` verification across ALL tools** — Replace `split(' ')[0]` + `pgrep -i` with AppleScript `System Events` process checking. Fix all `catch` blocks that falsely return `verified: true`.
2. **Fix hardcoded binary paths** — Replace `/opt/homebrew/bin/code` and `/opt/homebrew/bin/claude` with `which`-based dynamic discovery.
3. **Fix thermal false positive** — Parse `Thermal_Pressure = Nominal` properly instead of substring matching `"pressure"`.
4. **Fix voice display** — Show actual voice name in status, not hardcoded `Samantha`.

### Phase 2: WhatsApp & Communication Reliability

5. **Add TCC Accessibility permission pre-check** — Before running any AppleScript automation, check that Terminal has Accessibility access. Provide clear error message if not.
6. **Fix WhatsApp call trigger** — Remove `try...end try` swallowing. Report actual failure when call button/menu can't be found.
7. **Save/restore clipboard** in WhatsApp message tool.

### Phase 3: Claude Code + VS Code Integration

8. **Implement "Open Claude in VS Code terminal"** — Launch Claude Code CLI inside VS Code's integrated terminal using AppleScript or VS Code CLI commands.
9. **Fix `ClaudeTaskTool` SENSITIVE policy** — Either downgrade to NORMAL or ensure interactive approval callback is always available.
10. **Increase Claude Code timeouts** — 60s may not be enough for large projects.

### Phase 4: Planner & Intelligence Improvements

11. **Fix PromptEnhancer project name and task prompt preservation** — Ensure entities survive through the enhancement pipeline.
12. **Fix `inAppMatch` "on" preposition bug** — Remove "on" from app preposition matching.
13. **Add spoken summary accumulation** for multi-step plans instead of overwriting.

### Phase 5: Testing & Quality

14. **Add integration tests** that test REAL macOS execution paths — not just mock runners. At minimum: `open -a Calculator`, `pgrep Calculator`, `pmset -g batt`, `osascript -e 'tell application "System Events" to get name of first process'`.
15. **Add `PATH` enrichment** to TerminalExecTool for commands like `npm`, `node`, `git`.

---

## File Change Inventory

| File | Changes Needed |
|------|---------------|
| `tools/developer/VSCodeTool.ts` | Dynamic `code` CLI discovery, fix verification catch block |
| `tools/application/AppLaunchTool.ts` | Replace pgrep with AppleScript, fix verification catch block |
| `tools/application/AppStatusTool.ts` | Replace pgrep with AppleScript |
| `tools/claude/ClaudeCodeTool.ts` | Dynamic `claude` CLI discovery, VS Code terminal integration, fix policy |
| `tools/messaging/WhatsAppTool.ts` | TCC pre-check, fix silent call failures, clipboard save/restore |
| `tools/browser/BrowserTool.ts` | Handle redirects, add User-Agent |
| `tools/terminal/TerminalExecTool.ts` | PATH enrichment, safer command execution |
| `tools/system/MacSystemStatusTool.ts` | Fix thermal pressure false positive |
| `core/planner/PromptEnhancer.ts` | Fix "on" preposition, preserve task descriptions |
| `core/planner/AgentBrain.ts` | Multi-step summary accumulation, fix workspaceRoot |
| `voice/VoiceSystem.ts` | Auto-detect available voice |
| `src/index.ts` | Show actual voice name in status display |
| `tests/` | Add integration tests for real macOS execution |

---

> **This document is a plan only. No code changes have been made.**

