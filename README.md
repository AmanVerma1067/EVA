# EVA — Private AI Operating Layer & Autonomous Developer Copilot

> **EVA** (Executive Voice Assistant) is an autonomous, privacy-first, permission-driven AI operating layer engineered for macOS and Linux (Windows intentionally unsupported). It bridges local system control, native hardware capabilities, terminal execution, and state-of-the-art coding agents (Claude Code, local Ollama, multi-model AI routing) into a unified, secure executive assistant.

---

## Table of Contents

- [1. Executive Summary](#1-executive-summary)
- [2. What EVA Can Do Right Now (Current Capabilities)](#2-what-eva-can-do-right-now-current-capabilities)
  - [2.1 Core Agent Brain & Intent Engine](#21-core-agent-brain--intent-engine)
  - [2.2 28 Registered System & Developer Tools](#22-28-registered-system--developer-tools)
  - [2.3 Real-Time Push-to-Talk Voice System](#23-real-time-push-to-talk-voice-system)
  - [2.4 Screen Vision & OCR Inspection](#24-screen-vision--ocr-inspection)
  - [2.5 Developer & Claude Code Orchestration](#25-developer--claude-code-orchestration)
  - [2.6 macOS Desktop Computer Control & TCC Resilience](#26-macos-desktop-computer-control--tcc-resilience)
  - [2.7 Multi-Model AI Routing & Offline Modes](#27-multi-model-ai-routing--offline-modes)
  - [2.8 4-Tier Security Policy & Tamper-Evident Audit](#28-4-tier-security-policy--tamper-evident-audit)
  - [2.9 Executable CLI Command Family](#29-executable-cli-command-family)
- [3. Current Progress & Verification Matrix](#3-current-progress--verification-matrix)
  - [3.1 What Is Done](#31-what-is-done)
  - [3.2 Audited Runtime Bug Fixes](#32-audited-runtime-bug-fixes)
  - [3.3 Diagnostics & Test Pass Rate](#33-diagnostics--test-pass-rate)
- [4. Future Architecture: "Aware" Context & Token Optimization Engine](#4-future-architecture-aware-context--token-optimization-engine)
  - [4.1 The Context Tax & Token Bloat Problem](#41-the-context-tax--token-bloat-problem)
  - [4.2 Token Budgeting, Limit Tracking & Usage Gauges](#42-token-budgeting-limit-tracking--usage-gauges)
  - [4.3 AST-Aware & Semantic Graph Chunking](#43-ast-aware--semantic-graph-chunking)
  - [4.4 Smart Context Router & Pruning](#44-smart-context-router--pruning)
- [5. Pragmatic AI Rules: "Ponytail" Decision Ladder & Coding Standards](#5-pragmatic-ai-rules-ponytail-decision-ladder--coding-standards)
  - [5.1 The YAGNI Decision Ladder](#51-the-yagni-decision-ladder)
  - [5.2 Anti-Over-Engineering Modes (Lite / Full / Ultra)](#52-anti-over-engineering-modes-lite--full--ultra)
  - [5.3 Coding & Automated Code Review Regulations](#53-coding--automated-code-review-regulations)
- [6. Development Roadmap: Next Phases of EVA](#6-development-roadmap-next-phases-of-eva)
- [7. Quickstart & Installation](#7-quickstart--installation)

---

## 1. Executive Summary

Modern AI coding and operating assistants frequently suffer from two critical failures:
1. **Unchecked Token Bloat & Context Tax**: Raw file dumps consume context windows, drive up API costs, dilute reasoning, and trigger weekly usage limits without warning.
2. **AI Over-Engineering & Literal Interpretation**: Models generate unnecessary files, invent redundant abstractions, add unneeded dependencies, or interpret natural commands literally without environmental awareness.

EVA solves this by operating as a **disciplined, senior AI operator**:
- **Environmental Awareness**: Before running any action, EVA inspects system health, processes, files, and installed tools.
- **Strict YAGNI Ladder**: Prefers reusing existing code, standard libraries, and native macOS CLI utilities before generating new code.
- **Deterministic Security**: Zero actions bypass policy. SENSITIVE and CRITICAL operations require explicit authorization.
- **Multi-Modal Native Loop**: Combines push-to-talk Apple Speech STT, human TTS voice output, native Apple Vision OCR, and Claude Code terminal integration.

---

## 2. What EVA Can Do Right Now (Current Capabilities)

### 2.1 Core Agent Brain & Intent Engine
- **Non-Literal Intent Resolution**: Accurately disambiguates conversational phrasing (e.g. *"open antigravity over here"* launches `Antigravity`, not `"Antigravity over here"`).
- **Compound Pipeline Decomposition**: Automatically splits multi-step natural voice requests into structured multi-tool execution plans (e.g. *"open D2S in VS Code and review with Claude Code"*).
- **Zero-Hardcoding App & Browser Normalization**: Handles application aliases, web search vs. direct URL dispatching, and developer project directory discovery.
- **Dialogue Continuity Across Restarts**: Preserves session state and execution memory in persistent storage (`~/.eva/memory/`), allowing contextual follow-up questions without re-running actions.

### 2.2 28 Registered System & Developer Tools

| Tool Name | Risk Level | Description |
|-----------|------------|-------------|
| `app.launch` | NORMAL | Launches macOS applications with bundle resolution and aliases |
| `app.status` | READ | Checks if an application process is active and running |
| `terminal.exec` | SENSITIVE | Executes sandboxed shell commands with timeout and cancellation |
| `terminal.output` | READ | Retrieves execution logs and stdout/stderr from active processes |
| `fs.read` | READ | Reads workspace files with path traversal security boundaries |
| `fs.write` | SENSITIVE | Writes or modifies files with rollback protection |
| `fs.search` | READ | Searches directories and workspace files via ripgrep/fd patterns |
| `screen.capture` | READ | Captures desktop displays using native `screencapture` |
| `screen.inspect` | READ | Apple Vision Framework OCR extracting UI text and coordinates |
| `vscode.open` | NORMAL | Opens projects in VS Code and starts Claude in integrated terminal |
| `claude.review_project` | SENSITIVE | Automated codebase architecture and security reviews via Claude Code |
| `claude.complete_task` | SENSITIVE | Autonomous task implementation and refactoring via Claude Code |
| `claude.status` | READ | Inspects Claude Code CLI availability, auth, and rate limits |
| `whatsapp.send_message` | NORMAL | Sends WhatsApp messages via UI automation or native URL scheme |
| `whatsapp.call` | NORMAL | Initiates WhatsApp desktop voice calls |
| `whatsapp.video_call` | NORMAL | Initiates WhatsApp desktop video calls |
| `window.list` | READ | Lists active macOS windows, positions, and owning processes |
| `window.focus` | NORMAL | Brings specified application windows to the foreground |
| `window.close` | SENSITIVE | Gracefully closes application windows |
| `keyboard.type` | SENSITIVE | Injects keystroke events via macOS System Events |
| `keyboard.shortcut` | SENSITIVE | Triggers system keyboard shortcuts (Cmd+Tab, Cmd+N, etc.) |
| `mouse.click` | SENSITIVE | Emulates native mouse clicks and UI coordinate interactions |
| `browser.open` | NORMAL | Opens URLs in Google Chrome, Safari, Brave, Edge, or Arc |
| `browser.read_page` | READ | Extracts web content with `UNTRUSTED_CONTENT` injection tags |
| `git.status` | READ | Inspects git working trees and active branches cleanly |
| `git.commit` | SENSITIVE | Stages modified files and commits with verified hashes |
| `reminders.add` | NORMAL | Creates macOS Reminders items via EventKit/AppleScript |
| `system.mac_status` | READ | Real-time Apple Silicon battery, thermals, power, and app health |

### 2.3 Real-Time Push-to-Talk Voice System
- **Push-to-Talk (PTT)**: Spacebar hold-to-speak in the macOS terminal, eliminating background audio leakage and unnecessary API streaming.
- **Native Apple Speech Recognition**: Uses compiled native Objective-C binary (`bin/eva-voice-capture`) binding Apple Speech and AVFoundation for high-speed, local STT.
- **Natural Human Voice TTS**: Speaks via natural human voice **Tara** with instant speech interruption on user input, replacing robotic Samantha voices.

### 2.4 Screen Vision & OCR Inspection
- **Native Apple Vision OCR**: Uses compiled native binary (`bin/eva-vision`) binding Apple's `VNRecognizeTextRequest` framework.
- **Zero Cloud Leakage**: Extracts on-screen text, buttons, and coordinates entirely on-device with zero cloud API dependencies.
- **Secure File Isolation**: Captures temporary vision frames into isolated OS temp directories (`os.tmpdir()`), automatically cleaning up artifacts after analysis.

### 2.5 Developer & Claude Code Orchestration
- **VS Code Integrated Terminal**: Launches projects in Visual Studio Code and can trigger Claude Code directly in the built-in terminal.
- **Automated Architectural Code Review**: Invokes Claude Code in headless non-interactive mode with stdin closed (`</dev/null`), capturing review findings cleanly.
- **Weekly & Daily Limit Detection**: Parses Claude Code usage limits (e.g., *"You've hit your weekly limit · resets Sep 13 at 9:30pm"*) and reports exact reset times via voice and text, preventing unhandled agent freezes.
- **Dialogue Query Isolation**: Prevents dialogue leakage; asking *"what did Claude Code say?"* strictly checks Claude execution history and never reports unrelated tool outputs.

### 2.6 macOS Desktop Computer Control & TCC Resilience
- **macOS Accessibility (TCC) Awareness**: Proactively catches macOS Accessibility error 1002 (`osascript is not allowed to send keystrokes`).
- **URL Scheme Fallback**: When keystroke automation is blocked by permissions, `whatsapp.send_message` falls back to native `whatsapp://send?text=...` URL scheme, ensuring messages open cleanly rather than crashing.
- **Actionable Remediation Guidance**: Translates cryptic AppleScript errors into clear, natural voice feedback instructing the user to grant permissions in *System Settings -> Privacy & Security -> Accessibility*.

### 2.7 Multi-Model AI Routing & Offline Modes
- **Provider-Agnostic Model Registry**: Supports OpenAI, Anthropic, Google Gemini, Ollama, and local models across six functional profiles (`fast`, `reasoning`, `coding`, `vision`, `local`, `agent`).
- **Dynamic Context Routing**: Evaluates task complexity, privacy tier, latency requirements, and active provider health to select the optimal model.
- **Connection Modes**:
  - `ONLINE`: Cloud providers active with automatic fallback.
  - `DEGRADED`: Graceful fallbacks when quotas or rate limits are reached.
  - `OFFLINE`: Strict local routing (Ollama/local) with zero remote calls and zero fabricated hallucinations.

### 2.8 4-Tier Security Policy & Tamper-Evident Audit
- **4 Deterministic Risk Tiers**:
  - `READ`: Non-mutating read operations allowed automatically.
  - `NORMAL`: Low-risk mutations (launching apps, creating reminder).
  - `SENSITIVE`: Modifying files, git commits, terminal execution, keystrokes.
  - `CRITICAL`: Security configuration, credential access, external distribution.
- **12 Capability Gates**: Enforces fine-grained permissions (`SYSTEM_INFO`, `APPLICATION_CONTROL`, `TERMINAL_EXECUTION`, `FILESYSTEM_READ`, `FILESYSTEM_WRITE`, `SCREEN_CAPTURE`, `INPUT_CONTROL`, `BROWSER_CONTROL`, `NETWORK_ACCESS`, `AI_PROVIDER_ACCESS`, `CREDENTIAL_ACCESS`, `EXTERNAL_COMMUNICATION`).
- **Tamper-Evident Hash Chain**: Every executed tool step and security decision is logged in `~/.eva/audit/audit.jsonl` using a continuous SHA-256 hash chain (`prevHash` -> `hash`) to mathematically guarantee log integrity.
- **Secure Device Pairing**: Uses 6-digit one-time pairing codes and HMAC-SHA256 authenticated device tokens for secure companion communication.

### 2.9 Executable CLI Command Family

```bash
eva [shell]                                # Launch interactive voice & text agent shell
eva ask "<goal>"                           # Single-shot goal execution
eva plan "<goal>"                          # Generate non-mutating autonomous execution plan
eva run <toolName> [paramsJson]            # Direct tool invocation
eva doctor                                 # Run 11-point system diagnostics
eva status                                 # Show storage usage, AI provider mode, active capability gates
eva permissions [list|grant|deny|revoke]   # Manage fine-grained capability security gates
eva models [list|test]                     # Inspect registered models and test dynamic routing
eva devices [list|revoke <id>]             # Manage paired companion devices
eva logs [--tail <n> | clear]              # Inspect or manage tamper-evident audit logs
eva config [show|get|set]                  # Inspect or update runtime configuration
eva update [--check|verify|stage]          # Verify and stage cryptographically signed updates
eva uninstall [--purge]                    # Safe uninstallation with optional workspace purge
```

---

## 3. Current Progress & Verification Matrix

### 3.1 What Is Done

```
Phase 0  [✓] Product Definition & Threat Model
Phase 1  [✓] Development Environment & Foundations (Zod, Scrubbed Logger, Typed Errors)
Phase 2  [✓] Mac Agent Core & Policy Router (28 Tools, 4 Risk Levels)
Phase 3  [✓] Secure Phone ↔ Mac Pairing (6-digit code, HMAC tokens, anti-replay)
Phase 4  [✓] Voice System (Apple Speech STT + natural human Tara TTS + interruption)
Phase 5  [✓] Desktop Control (Window management, keyboard typing/shortcuts, mouse click)
Phase 6  [✓] Claude Code Integration (Automated review, headless runner, limit detection)
Phase 7  [✓] Autonomous Agent Brain (Goal enhancement, multi-step planning, verification)
Phase 8  [✓] Structured Memory Engine (Persistent project context, dialogue state)
Phase 9  [✓] Screen Vision Inspection (Native Apple Vision VNRecognizeTextRequest OCR)
Phase 10 [✓] Browser & Web Automation (Chrome/Safari control, UNTRUSTED_CONTENT tags)
Phase 11 [✓] Developer Integrations (Git status/commit, Reminders, Mac system status)
Phase 12 [✓] Security Hardening (8 adversarial attack vectors mitigated)
Phase 13 [✓] Capability Permissions (12 gates, TTL expiry, 0700 file modes)
Phase 14 [✓] Multi-Model AI Router (Dynamic selection, ONLINE/DEGRADED/OFFLINE)
Phase 15 [✓] Health Diagnostics & EvaDoctor (11-point automated diagnostic engine)
Phase 16 [✓] CLI Command Family & Binary Launcher (14 standalone CLI commands)
Phase 17 [✓] Packaging & Distribution (Package tarball, SHA256 checksums, SBOM)
```

### 3.2 Audited Runtime Bug Fixes

All 6 critical runtime bugs identified during system verification have been root-caused and fixed:
1. **Claude Dialogue Query Leakage**: Fixed in `AgentBrain.ts`; Claude queries no longer fall back to unrelated tool outputs.
2. **VS Code Terminal Keystrokes**: Fixed in `VSCodeTool.ts`; catches error 1002 and warns the user about Accessibility permissions.
3. **WhatsApp Keystroke Error 1002**: Added `isAccessibilityError()` and automatic URL scheme fallback (`whatsapp://send?text=...`).
4. **Actionable Failure Explanations**: Switched from opaque *"Action failed."* to descriptive explanations while filtering raw stack traces to prevent droning voice output.
5. **Package-Root Native Binary Resolution**: `TerminalVoiceListener`, `ScreenVisionTool`, and `EvaDoctor` resolve `bin/` via `import.meta.url`, making `eva` executable from any working directory.
6. **Session Context Hydration**: Constructor of `AgentBrain` hydrates `lastExecution` from `MemoryStore`, preserving state across restarts.
7. **Git Repository Boundary Handling**: Returns structured `NOT_A_GIT_REPOSITORY` errors when executed outside git trees.

### 3.3 Diagnostics & Test Pass Rate

```text
================================================================
Test Files  38 passed (38)
     Tests  206 passed (206)
  Duration  5.29s (100% Pass Rate)
================================================================
TypeScript  0 compilation errors (npm run build)
EvaDoctor   11/11 checks PASS (0 warnings, 0 failed)
```

---

## 4. Future Architecture: "Aware" Context & Token Optimization Engine

*(Inspired by GitHub context-engineering principles and AST-aware token pruning)*

```mermaid
flowchart TD
    RawReq[User Coding Goal] --> AST[Tree-Sitter AST & Symbol Parser]
    AST --> DepGraph[Dependency & Symbol Graph]
    DepGraph --> Budget[Token Budget & Limit Tracker]
    Budget --> Prune[Context Pruning & Compactor]
    Prune --> HighSignal[High-Signal Context Slice]
    HighSignal --> Model[AI Coding Model (Claude/Local)]
    Model --> Gauge[Live Token & Cost Gauge]
    Gauge --> Mem[Persistent Context Memory]
```

### 4.1 The Context Tax & Token Bloat Problem
AI agents frequently fail because they re-read entire repositories for every minor task. This creates a severe **"context tax"**:
- Excessive prompt tokens consume API quotas in minutes.
- Irrelevant files dilute model attention, leading to hallucinations and subtle regressions.
- Providers enforce weekly or daily rate limits that disrupt autonomous workflows.

### 4.2 Token Budgeting, Limit Tracking & Usage Gauges
The next phase introduces proactive, real-time context and budget management:
- **Real-Time Token Counter**: Tracks input tokens, output tokens, cached tokens, and financial cost per operation.
- **Provider Limit Radar**: Proactively calculates remaining budget against known provider quotas (Claude Code weekly limits, OpenAI TPM/RPM) and warns the user *before* a limit is triggered.
- **Progress & Budget Gauges**: Emits real-time visual progress bars showing tokens used, tokens saved via caching, and estimated remaining task capacity.

### 4.3 AST-Aware & Semantic Graph Chunking
Rather than treating files as raw text lines, EVA will leverage incremental AST parsing (via Tree-sitter):
- **Symbol & Reference Indexing**: Breaks code into semantic nodes (functions, interfaces, classes, module exports).
- **Dependency Graph Navigation**: Retrieves only the targeted function and its direct type dependencies rather than the entire file.
- **Token Reduction Target**: Achieves up to **80%–90% reduction in tokens per prompt** while improving generation accuracy.

### 4.4 Smart Context Router & Pruning
- **Prompt Compaction**: Automatically strips unnecessary whitespace, comments from vendor dependencies, and duplicated types.
- **Diff-Only Context Slices**: When iterating on tests or bug fixes, feeds only the git diff and immediate test failure context to the model rather than re-reading unchanged files.
- **Persistent Context Cache**: Frequently referenced architectural constraints and schemas are cached and reused across agent steps without re-tokenizing.

---

## 5. Pragmatic AI Rules: "Ponytail" Decision Ladder & Coding Standards

*(Inspired by the Ponytail minimalist AI coding framework and senior engineering pragmatism)*

```mermaid
flowchart TD
    Task[Coding Requirement] --> Q1{1. Is this feature strictly necessary?}
    Q1 -- No --> Skip[Skip / Reject (YAGNI)]
    Q1 -- Yes --> Q2{2. Does it already exist in the codebase?}
    Q2 -- Yes --> Reuse[Reuse existing code / helper]
    Q2 -- No --> Q3{3. Can Node / standard library solve it?}
    Q3 -- Yes --> StdLib[Use Standard Library (node:fs, node:crypto, etc.)]
    Q3 -- No --> Q4{4. Can native OS / platform utility do it?}
    Q4 -- Yes --> Platform[Use Native Platform Capability (osascript, pmset, clang)]
    Q4 -- No --> Q5{5. Can an installed dependency handle it?}
    Q5 -- Yes --> Dep[Use existing dependency (zero new npm installs)]
    Q5 -- No --> Q6{6. Can it be written in a clean one-liner?}
    Q6 -- Yes --> Simple[Implement simple one-liner / pure function]
    Q6 -- No --> Write[Write minimal, focused, strongly typed code]
```

### 5.1 The YAGNI Decision Ladder
AI coding assistants naturally default to over-engineering: creating new abstraction layers, inventing factory patterns, and installing third-party npm packages for simple tasks.

EVA enforces the **Ponytail 7-Step Decision Ladder** before any code modification:
1. **Necessity**: Is this code explicitly requested or strictly necessary? If not, do not write it.
2. **Codebase Reuse**: Search the codebase for an existing helper or utility before creating a new one.
3. **Standard Library**: Check if `node:fs`, `node:path`, `node:crypto`, `node:os`, or ES2024 features solve the problem natively.
4. **Native Platform**: Check if a native macOS/Linux CLI command (`screencapture`, `osascript`, `pmset`) handles it directly.
5. **Installed Dependencies**: Check `package.json` to reuse existing packages; forbid installing new npm packages without user authorization.
6. **Minimal Complexity**: Can the solution be expressed in a single clean function or one-liner?
7. **Minimal Code Implementation**: Only if steps 1–6 are exhausted, write the minimum amount of code required to satisfy the contract.

### 5.2 Anti-Over-Engineering Modes (Lite / Full / Ultra)

| Mode | Behavior | Use Case |
|------|----------|----------|
| `lite` | Standard engineering guardrails; warns on duplicate abstractions | General development & scripting |
| `full` *(Default)* | Strictly enforces the 7-step YAGNI ladder; forbids new abstractions without approval | Production features & bug fixes |
| `ultra` | Aggressive code deletion; actively simplifies, inlines trivial functions, and removes dead code | Refactoring & codebase compression |
| `off` | Unrestricted generation | Exploratory prototyping |

### 5.3 Coding & Automated Code Review Regulations
- **Inviolable Quality Gates**:
  - Never sacrifice TypeScript strictness (`noImplicitAny`, exact schemas).
  - Never compromise error handling, input validation (Zod), or security sanitization.
  - Never touch files outside the targeted workspace boundaries.
- **Automated Code Review Guardrails**:
  - Pre-flight linting and typecheck validation before presenting solutions.
  - Verification that new tests exercise real code rather than returning constant mock values.
  - Automated check for dead code, unused imports, and leaked secrets.

---

## 6. Development Roadmap: Next Phases of EVA

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             CURRENT STATE (DONE)                            │
│  Phase 0–17: Core Runtime, 28 Tools, Voice STT/TTS, Vision, Claude Code,    │
│              Security Policy, CLI Family, 206/206 Tests Passing             │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                 PHASE 18: "AWARE" CONTEXT & TOKEN ENGINE                    │
│  • AST & Symbol Graph Indexing (Tree-sitter semantic chunking)              │
│  • Token Budget Radar & Real-Time Usage Gauges                              │
│  • Claude & Cloud Provider Limit Tracking & Reset Alerts                    │
│  • Semantic Context Pruning (80%+ token reduction)                          │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                 PHASE 19: "PONYTAIL" PRAGMATIC CODING SYSTEM                │
│  • Automated 7-Step YAGNI Decision Ladder enforcement in AgentBrain         │
│  • Anti-Over-Engineering Modes (lite / full / ultra)                        │
│  • Pre-review Lint, AST, and Dependency Enforcement Engine                  │
│  • Automated Code Reviewer with strict architectural rulesets               │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                 PHASE 20: AUTONOMOUS SELF-HEALING REFACTOR LOOP             │
│  • Autonomous Test-Driven Refactor: Plan -> YAGNI Check -> Patch -> Test    │
│  • Automatic Rollback on test regression or policy violation                │
│  • Multi-file atomic diff application with preview gates                    │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                 PHASE 21: PRODUCTION COMPANION MOBILE APP                   │
│  • Native iOS companion app (SwiftUI) pairing via WebSocket/HMAC-SHA256     │
│  • Remote push-to-talk voice relay to desktop EVA                           │
│  • Mobile approval interface for SENSITIVE and CRITICAL capability gates    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Quickstart & Installation

### Prerequisites
- macOS (Apple Silicon or Intel) or Linux (Ubuntu/Debian, Fedora, Arch)
- Node.js >= 20.0.0
- Clang / Xcode Command Line Tools (on macOS for native STT and Vision binaries)

### 1. Installation
```bash
# Clone the repository
git clone https://github.com/aman/EVA.git
cd EVA

# Install dependencies
npm ci

# Compile native binaries and build TypeScript artifacts
npm run build
```

### 2. Diagnostics & System Setup
```bash
# Run first-run workspace initialization (~/.eva/)
npm run cli -- setup

# Run 11-point system diagnostics
npm run doctor
```

### 3. Running Tests
```bash
# Run full automated test suite (38 suites, 206 tests)
npm test

# Run security and adversarial test suite
npm run test:security
```

### 4. Interactive Voice & Terminal Shell
```bash
# Launch EVA voice & text agent
npm run voice

# Or invoke directly via binary
./bin/eva
```

Speak or type naturally:
- `[Hold Spacebar / Type]`: *"how is my mac doing?"*
- `[Hold Spacebar / Type]`: *"open D2S in VS Code and start Claude"*
- `[Hold Spacebar / Type]`: *"send meeting at 5pm to Priya on WhatsApp"*
- `[Hold Spacebar / Type]`: *"what was the response of Claude Code?"*
