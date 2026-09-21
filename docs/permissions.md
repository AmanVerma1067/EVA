# EVA — Permission Model & Risk Classification

## 1. Permission Philosophy

EVA operates on the principle of **Least Privilege**. No tool or subsystem has unlimited access to the operating system.

Execution authority is determined by the **Deterministic Policy Engine**, not the AI model.

## 2. Risk Classification Tiers

| Tier | Name | Description | Execution Gate | Audit Level |
| :--- | :--- | :--- | :--- | :--- |
| **0** | `READ` | Safe inspection operations that observe system or file state without changing anything. | Autonomous allowed | Standard Audit |
| **1** | `NORMAL` | Operations that create low-impact UI changes or execute benign commands. | Autonomous allowed | Detailed Audit |
| **2** | `SENSITIVE` | Operations that modify files, create git branches, execute test builds, or manipulate user application windows. | Allowed if inside approved workspace, otherwise requires user consent | Full Audit + Parameter Hash |
| **3** | `CRITICAL` | Operations that delete files, access credentials, execute arbitrary shell code, install software, or make external network calls. | Mandatory explicit human confirmation via Phone or Mac UI | Full Tamper-Evident Audit with cryptographic approval token |

## 3. Tool Permission Matrix

| Tool Category | Tool Identifier | Risk Tier | Scope Restrictions | Human Approval Required? |
| :--- | :--- | :--- | :--- | :--- |
| **Application** | `app.launch` | `NORMAL` | Standard `/Applications` and `/System/Applications` | No |
| **Application** | `app.status` | `READ` | Process inspection only | No |
| **Application** | `app.quit` | `NORMAL` | Graceful quit | No |
| **Terminal** | `terminal.exec_safe` | `NORMAL` | Read-only commands (`git status`, `ls`, `grep`, `pwd`) | No |
| **Terminal** | `terminal.exec_build` | `SENSITIVE` | Permitted project directories only (`npm test`, `cargo build`) | Policy-gated |
| **Terminal** | `terminal.exec_arbitrary`| `CRITICAL` | Any shell command outside standard build tools | **YES (Always)** |
| **Terminal** | `terminal.output` | `READ` | Bounded buffer retrieval | No |
| **Filesystem** | `fs.read` | `READ` | Permitted workspace paths only | No |
| **Filesystem** | `fs.write` | `SENSITIVE` | Permitted workspace paths only | Policy-gated |
| **Filesystem** | `fs.delete` | `CRITICAL` | Any file deletion (`unlink`, `rm`) | **YES (Always)** |
| **Screen** | `screen.capture` | `READ` | Main display screenshot; sensitive windows blacked out | No |
| **Screen** | `screen.inspect_ui` | `READ` | Accessibility hierarchy dump | No |
| **Window** | `window.focus` | `NORMAL` | Focus target application | No |
| **Window** | `window.resize` | `NORMAL` | Screen-bounded window repositioning | No |
| **Keyboard/Mouse**| `input.key_press` | `NORMAL` | Active window only | No |
| **Keyboard/Mouse**| `input.type_text` | `NORMAL` | Active window only | No |
| **Keyboard/Mouse**| `input.click` | `NORMAL` | Target coordinate verification | No |
| **Claude Code** | `claude.session_start` | `NORMAL` | Designated project directory | No |
| **Claude Code** | `claude.send_prompt` | `SENSITIVE` | Monitored stdin stream | Policy-gated |
| **Browser** | `browser.navigate` | `NORMAL` | Allowed URL scheme (`https://`) | No |
| **Browser** | `browser.click` | `NORMAL` | Sandboxed page session | No |
| **Browser** | `browser.fill` | `SENSITIVE` | Form input; credential fields prohibited | Policy-gated |
| **Security** | `security.manage_keys`| `CRITICAL` | macOS Keychain access | **YES (Always)** |

## 4. Human Approval Flow Specification

```
[Agent generates tool call]
           │
           ▼
[Policy Engine checks risk tier]
           │
     ┌─────┴─────────────────────────┐
     ▼                               ▼
[READ / NORMAL]               [CRITICAL / SENSITIVE]
Autonomous Execution                 │
                                     ▼
                     [Create ApprovalRequest Object]
                     - Request ID (UUIDv4)
                     - Tool name & parameters
                     - Exact file paths / command string
                     - Expiry timestamp (30s)
                                     │
                                     ▼
                     [Push to Phone via WebSocket]
                                     │
                     ┌───────────────┴───────────────┐
                     ▼                               ▼
               [User Approves]                 [User Rejects / Timeout]
                     │                               │
                     ▼                               ▼
         [Return signed token]             [Emit SecurityViolationError]
                     │                               │
                     ▼                               ▼
           [Execute Tool]                   [Safe Stop Agent Task]
```

