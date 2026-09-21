# EVA — Phasewise Complete Development Plan

## 1. Product Vision

The goal is to build a polished, private, voice-controlled AI agent that acts as a personal computer operating layer across:

- **MacBook M2** — primary execution environment
- **Phone** — voice and remote-control interface
- **AI models** — reasoning, planning, vision, speech, and natural-language understanding
- **Claude Code** — integrated development agent
- **macOS** — applications, terminal, files, browser, windows, and system capabilities
- **Secure networking** — authenticated and encrypted phone-to-Mac communication

The final product should feel like a personal EVA rather than a collection of scripts.

The user should be able to communicate naturally, while EVA handles planning, tool selection, execution, observation, verification, recovery, and reporting.

### Core principle

> The AI proposes actions. A local security and permission layer decides whether those actions are allowed.

The LLM must never be the security boundary.

---

# 2. Final Product Architecture

```text
                         USER
                          │
                   Natural voice/text
                          │
                          ▼
                 ┌─────────────────┐
                 │   PHONE APP     │
                 │                 │
                 │ Voice / Status  │
                 │ Approvals      │
                 │ Device Security │
                 └────────┬────────┘
                          │
                   Authenticated,
                    encrypted link
                          │
                          ▼
                 ┌─────────────────┐
                 │   MAC EVA    │
                 │                 │
                 │ Agent Runtime   │
                 │ Planner         │
                 │ Memory         │
                 │ Policy Engine   │
                 │ Session Manager │
                 │ Audit System    │
                 └────────┬────────┘
                          │
                 ┌────────┼────────┐
                 ▼        ▼        ▼
              Terminal   macOS    Browser
                         Control
                 │        │        │
                 └────────┼────────┘
                          ▼
                  Claude Code /
                  Development Tools
```

---

# 3. Development Method

Every feature must follow the same lifecycle:

```text
DEFINE
  ↓
DESIGN
  ↓
IMPLEMENT
  ↓
UNIT TEST
  ↓
INTEGRATION TEST
  ↓
SECURITY TEST
  ↓
MANUAL TEST
  ↓
USER APPROVAL
  ↓
DOCUMENT
  ↓
LOCK / STABILIZE
  ↓
NEXT FEATURE
```

Do not build the entire product first and test it at the end.

Each phase must have a **completion gate**.

---

# PHASE 0 — Product Definition, Architecture & Threat Model

**Estimated time: 1–2 days**

## Objective

Define exactly what EVA is, what it can access, how components communicate, and what security boundaries exist before writing the main code.

## Deliverables

Create:

```text
docs/
├── product-requirements.md
├── architecture.md
├── threat-model.md
├── permissions.md
├── tool-specification.md
└── roadmap.md
```

## Define the major subsystems

### Phone

Responsibilities:

- microphone input
- speech-to-text
- text-to-speech
- task status
- approval requests
- device authentication
- session control
- activity display

### Mac Agent

Responsibilities:

- receive authenticated requests
- interpret requests
- run the agent loop
- invoke tools
- enforce permissions
- observe results
- maintain sessions
- communicate status
- maintain audit logs

### Tool Layer

Initial tools:

- application control
- terminal
- filesystem
- keyboard
- mouse
- window management
- browser
- screen capture
- screen understanding
- Claude Code

### Security Layer

Responsibilities:

- authentication
- authorization
- device trust
- permissions
- confirmation
- secret handling
- session expiry
- audit logging
- revocation

## Permission model

Use at least four levels:

### READ

Safe information gathering.

### NORMAL

Regular computer operations.

### SENSITIVE

Operations that modify data or development environments.

### CRITICAL

Destructive, credential-related, production, or system-level actions.

Critical actions require explicit confirmation.

## Phase 0 testing

Verify:

- requirements are complete
- every planned tool has a permission level
- security boundaries are documented
- no component requires unnecessary privileges
- phone-to-Mac trust model is defined
- failure behavior is defined

## Approval gate

Do not proceed until the architecture and threat model are approved.

---

# PHASE 1 — Development Environment & Foundations

**Estimated time: 2–3 days**

## Objective

Prepare the development environment and establish coding standards.

## Study

Learn enough of:

- TypeScript or Python
- Git
- HTTP
- WebSockets
- JSON
- async programming
- subprocesses
- API integration
- error handling
- testing

Also begin studying:

- macOS permissions
- Accessibility APIs
- Keychain
- application automation
- code signing
- sandboxing

## Recommended implementation direction

Use:

- **TypeScript** for the main application/backend where practical
- **Swift/macOS APIs** where native macOS functionality is needed
- **Python** only where it provides a clear advantage for specific automation/AI tasks

Do not over-engineer the technology stack.

## Create the repository

```text
jarvis/
├── apps/
│   ├── mac/
│   └── mobile/
├── core/
├── tools/
├── security/
├── networking/
├── voice/
├── memory/
├── tests/
└── docs/
```

## Phase 1 coding

Build:

- project configuration
- logging
- configuration management
- environment handling
- error system
- test framework
- development scripts
- local development server

## Testing

Confirm:

- clean installation
- application starts
- application stops
- configuration loads
- errors are handled
- logs work
- tests execute
- no secrets are committed

## Approval gate

The repository and development environment must be reproducible before continuing.

---

# PHASE 2 — Mac Agent Core

**Estimated time: 3–5 days**

## Objective

Create the first real EVA runtime on the Mac.

Do not add voice yet.

Do not add the phone yet.

First make the Mac agent reliable.

## Architecture

```text
EVA Runtime
│
├── Session Manager
├── Tool Router
├── Permission Engine
├── Executor
├── Result Processor
└── Audit Logger
```

## Build the tool interface

Every tool should have:

```text
name
description
input schema
permission level
validator
executor
timeout
result schema
error handling
```

Example conceptual flow:

```text
Agent
  ↓
Tool Request
  ↓
Schema Validation
  ↓
Permission Check
  ↓
Execution
  ↓
Result
  ↓
Audit
  ↓
Agent
```

## First tools

Implement:

1. application launcher
2. application status
3. terminal command execution
4. terminal output retrieval
5. filesystem read
6. screenshot capture

Keep filesystem access scoped.

## Security requirements

The Mac agent must not accept arbitrary unauthenticated commands.

The agent should reject:

- malformed tool calls
- unknown tools
- invalid parameters
- unauthorized operations
- expired sessions

## Testing

### Unit tests

Test every component individually.

### Security tests

Try:

- unknown tool
- malformed request
- invalid parameters
- unauthorized command
- invalid session
- expired session

### Failure tests

Simulate:

- application unavailable
- command timeout
- command failure
- tool crash

## Approval gate

The Mac agent must safely execute approved tools and reject unauthorized operations.

---

# PHASE 3 — Secure Phone ↔ Mac Communication

**Estimated time: 3–5 days**

## Objective

Connect the phone to the Mac without exposing an unrestricted control interface.

## Requirements

Implement:

- device pairing
- device identity
- encrypted communication
- session authentication
- session expiration
- device revocation
- reconnect handling

## Pairing flow

```text
Phone
  ↓
Request pairing
  ↓
Mac displays approval
  ↓
User authenticates
  ↓
Devices establish trust
  ↓
Encrypted connection
```

## Device management

EVA should know:

```text
Trusted devices
Active sessions
Revoked devices
Last connection
```

If the phone is lost:

```text
Revoke device
      ↓
Device can no longer control Mac
```

## Do not

Do not expose an unrestricted public port.

Do not store permanent secrets in plain text.

Do not trust a device merely because it is on the same Wi-Fi network.

## Testing

Test:

- first pairing
- wrong authentication
- unknown device
- revoked device
- expired session
- reconnect
- network change
- Wi-Fi loss
- Mac restart
- phone restart
- replayed requests
- multiple devices

## Approval gate

Only continue once an unauthorized device cannot establish control.

---

# PHASE 4 — Voice System

**Estimated time: 2–4 days**

## Objective

Turn the phone into a natural voice interface.

## Pipeline

```text
Microphone
   ↓
Speech-to-Text
   ↓
User Intent
   ↓
EVA
   ↓
Response
   ↓
Text-to-Speech
```

## Requirements

The system should handle:

- normal speech
- pauses
- long requests
- interruptions
- corrections
- failed recognition
- network failures

## Conversation state

EVA needs session context so the user does not have to repeat the full task after every response.

## Voice response design

Responses should normally be short.

Detailed information belongs in the phone or Mac UI.

## Testing

Test:

- background noise
- different speaking speeds
- incomplete sentences
- ambiguous commands
- accidental activation
- interruption
- long commands
- speech recognition failure

## Approval gate

The voice interaction should feel natural enough for regular use before continuing.

---

# PHASE 5 — macOS Computer Control

**Estimated time: 5–10 days**

## Objective

Give EVA controlled access to the Mac desktop.

## Tools

Build individually:

### Applications

- launch
- close
- focus
- inspect

### Windows

- list
- focus
- move
- resize
- close

### Keyboard

- type
- key press
- shortcuts

### Mouse

- move
- click

### Screen

- screenshot
- screen inspection

### Terminal

- execute
- monitor
- stop
- retrieve output

### Files

- search
- read
- create
- modify
- move

## Automation strategy

Prefer:

```text
Native API / deterministic automation
```

over:

```text
Vision → random coordinates → click
```

Use screen vision when deterministic control is unavailable or insufficient.

## Safety

Filesystem operations must be scoped.

Commands must be validated.

Dangerous operations must require additional authorization.

## Testing

Build an automated test suite around:

- application launching
- application switching
- terminal
- keyboard
- mouse
- windows
- filesystem
- screenshots
- timeouts
- application crashes
- unexpected UI states

## Approval gate

EVA must reliably control the Mac without unsafe actions or uncontrolled retries.

---

# PHASE 6 — Claude Code Integration

**Estimated time: 3–5 days**

## Objective

Make Claude Code a first-class EVA tool.

## Build

```text
ClaudeController
├── start
├── stop
├── send prompt
├── read output
├── get status
└── interrupt
```

## Required behavior

EVA must know:

- which project Claude is working in
- whether Claude is running
- what Claude is currently doing
- whether Claude needs input
- whether Claude failed
- whether Claude finished

## Integration architecture

```text
EVA
   ↓
Claude Tool
   ↓
Claude Code
   ↓
Project
   ↓
Output
   ↓
EVA
```

## Important

Do not let the LLM bypass EVA's permission system simply because Claude Code is running.

Claude Code is another execution component inside the overall security model.

## Testing

Test:

- starting Claude
- selecting project directory
- sending prompts
- reading output
- long-running tasks
- failures
- interruptions
- duplicate commands
- Claude asking for input
- Claude process termination

## Approval gate

Claude Code must work reliably as a EVA-controlled tool.

---

# PHASE 7 — Agent Brain

**Estimated time: 5–10 days**

## Objective

Transform EVA from a command executor into an autonomous agent.

## Agent loop

```text
USER GOAL
   ↓
UNDERSTAND
   ↓
PLAN
   ↓
SELECT TOOL
   ↓
CHECK PERMISSION
   ↓
EXECUTE
   ↓
OBSERVE
   ↓
VERIFY
   ↓
CONTINUE / RECOVER / ASK
   ↓
COMPLETE
```

## Core components

Build:

- intent parser
- planner
- tool selector
- context manager
- execution loop
- observation system
- verification system
- recovery system
- human approval mechanism

## Critical rule

The agent must distinguish between:

```text
"I think this worked."
```

and:

```text
"I verified that this worked."
```

Verification should be built into important workflows.

## Error recovery

If a tool fails:

```text
Tool failure
   ↓
Understand failure
   ↓
Retry safely?
 ┌─┴─────────────┐
YES              NO
 ↓                ↓
Retry          Ask user
```

Never allow infinite retries.

## Approval mechanism

For sensitive actions:

```text
Agent
 ↓
Action requires approval
 ↓
Phone notification
 ↓
User approves/rejects
 ↓
Agent continues
```

## Testing

Evaluate:

- planning quality
- tool selection
- incorrect assumptions
- retries
- loops
- failures
- permission handling
- task completion
- verification

## Approval gate

The agent must be able to complete multi-step tasks while remaining inside its security and permission boundaries.

---

# PHASE 8 — Memory & Context

**Estimated time: 3–5 days**

## Objective

Make EVA useful across sessions without blindly storing everything.

## Start with structured memory

Use a local database.

Store:

```text
projects
devices
preferences
permissions
sessions
workflows
```

## Project memory

EVA can remember:

- project locations
- project names
- development environment
- permitted tools
- relevant workflow metadata

## Conversation memory

Keep only useful context.

Do not automatically turn every conversation into permanent memory.

## Security

Sensitive information should have stricter storage rules.

Credentials should not be stored as ordinary AI memory.

## Testing

Test:

- memory creation
- memory retrieval
- incorrect memory
- stale memory
- memory deletion
- privacy boundaries
- permission boundaries

## Approval gate

EVA should remember useful information without becoming an uncontrolled repository of sensitive data.

---

# PHASE 9 — Screen Vision & Visual Understanding

**Estimated time: 4–7 days**

## Objective

Allow EVA to understand the visible state of the Mac.

## Pipeline

```text
Screen
  ↓
Capture
  ↓
Vision model
  ↓
Understand UI
  ↓
Determine target
  ↓
Action
  ↓
Verify
```

## Use vision for

- unfamiliar interfaces
- visual state recognition
- UI elements without reliable APIs
- checking visual results
- interpreting application states

## Do not use vision unnecessarily

If an application exposes a reliable API or accessibility structure, prefer that.

## Security

Screenshots may contain:

- passwords
- private messages
- financial information
- API keys
- personal data

Therefore screen capture should be controlled and minimized.

## Testing

Test:

- multiple application layouts
- different window sizes
- dark/light mode
- dynamic UI
- missing elements
- unexpected UI
- sensitive content handling

## Approval gate

Vision must improve capability without becoming a source of uncontrolled actions.

---

# PHASE 10 — Browser & Web Automation

**Estimated time: 4–7 days**

## Objective

Make websites and browser applications controllable tools.

## Components

- browser session manager
- page inspection
- navigation
- clicking
- typing
- form interaction
- screenshots
- page verification

## Security

Treat webpages as untrusted input.

A webpage must not be able to redefine EVA's system instructions.

The agent must distinguish:

```text
USER INSTRUCTION
```

from:

```text
UNTRUSTED WEBPAGE CONTENT
```

## Testing

Test:

- login pages
- dynamic pages
- redirects
- malicious content
- prompt injection
- unexpected popups
- session expiration
- failed navigation

## Approval gate

Web automation must not blindly trust instructions found on websites.

---

# PHASE 11 — Integrations

**Estimated time: 1–2 weeks**

Build integrations one at a time.

Potential integrations:

- GitHub
- email
- calendar
- cloud storage
- task management
- messaging
- development services

## Integration rule

Every integration gets its own:

```text
authentication
permissions
tools
rate limits
audit events
error handling
```

Do not create one giant permission allowing EVA to access everything.

## Testing

For every integration:

1. authentication
2. read operations
3. write operations
4. permission checks
5. expired credentials
6. revoked access
7. network failures
8. malicious/untrusted content

---

# PHASE 12 — Security Hardening

**Estimated time: 5–10 days**

This phase is mandatory before depending on EVA daily.

## macOS security

Use appropriate Apple security mechanisms such as:

- Keychain
- Secure authentication
- App Sandbox where compatible
- Hardened Runtime
- code signing
- notarization
- minimum required entitlements
- macOS permission controls

## Secrets

Never store:

```text
API_KEY="..."
```

inside source code.

Use secure credential storage.

## Network security

Require:

- authenticated devices
- encrypted connections
- session expiration
- request validation
- replay protection
- device revocation

## Agent security

Protect against:

- prompt injection
- command injection
- malicious files
- malicious websites
- unauthorized tool use
- privilege escalation
- path traversal
- arbitrary command execution
- data exfiltration
- unsafe autonomous loops

## Permission architecture

The final execution chain should be:

```text
LLM
 ↓
Tool proposal
 ↓
Schema validation
 ↓
Policy engine
 ↓
Risk evaluation
 ↓
User approval if required
 ↓
Tool execution
 ↓
Verification
 ↓
Audit
```

The LLM cannot bypass the policy engine.

---

# PHASE 13 — Complete Security & Failure Testing

**Estimated time: 5–7 days**

Do not only test successful scenarios.

Try to break EVA deliberately.

## Device attacks

Test:

- unknown device
- revoked device
- expired session
- stolen session token
- replayed request
- modified request

## Agent attacks

Test:

- malicious prompts
- prompt injection
- conflicting instructions
- malicious tool descriptions
- untrusted webpage instructions
- malicious file contents

## Terminal attacks

Test dangerous command classes.

The goal is not simply to blacklist a few commands.

The permission architecture must prevent unauthorized execution more broadly.

## Filesystem attacks

Test:

- path traversal
- unauthorized directories
- sensitive files
- symlinks
- permission errors
- destructive operations

## Network attacks

Test:

- disconnected network
- changed network
- unavailable server
- expired authentication
- malformed requests
- replayed requests

## Recovery

Every major failure should result in:

```text
SAFE STOP
```

rather than uncontrolled continuation.

---

# PHASE 14 — End-to-End Testing

**Estimated time: 5–7 days**

Now test the entire product as one system.

```text
Phone
 ↓
Voice
 ↓
Agent
 ↓
Security
 ↓
Mac Tool
 ↓
Application / Terminal / Browser
 ↓
Result
 ↓
Verification
 ↓
Phone Response
```

## Test categories

### Functional

Does every feature work?

### Integration

Do all components communicate correctly?

### Security

Can unauthorized actions happen?

### Reliability

What happens after failures?

### Performance

How quickly does the system respond?

### Recovery

Can it safely recover from expected failures?

### User experience

Does interaction feel natural?

---

# PHASE 15 — Production UI & UX

**Estimated time: 3–5 days**

## Phone interface

Keep it minimal.

Main screen:

```text
EVA

Listening...

Current task
────────────
Working...

Activity
────────────
...
```

Include:

- microphone
- task status
- approval requests
- history
- devices
- security
- settings

## Mac interface

A lightweight menu-bar application:

```text
EVA
────────────
Status
Current task
Activity
Devices
Permissions
Security
Settings
```

The UI should expose enough information to build trust without becoming a complicated control panel.

---

# PHASE 16 — Real-World Beta

**Estimated time: 5–7 days**

Do not immediately depend on EVA for critical operations.

Use it for increasingly important workflows.

Track:

```text
success rate
failure rate
false actions
permission requests
recovery success
voice recognition errors
latency
unexpected behavior
```

Create a bug log.

For every failure:

```text
What did I ask?
What did EVA understand?
What did it do?
What should it have done?
Why did it fail?
How should the architecture prevent recurrence?
```

Fix the root cause rather than adding random patches.

---

# PHASE 17 — Final Approval & Production Release

**Estimated time: 3–5 days**

Before calling the product production-ready:

## Security checklist

- [ ] Unknown devices rejected
- [ ] Revoked devices rejected
- [ ] Sensitive operations protected
- [ ] Critical operations require confirmation
- [ ] Secrets stored securely
- [ ] No secrets in source code
- [ ] Communication encrypted
- [ ] Sessions expire
- [ ] Dangerous operations audited
- [ ] Prompt injection defenses tested
- [ ] Filesystem access scoped
- [ ] Browser content treated as untrusted
- [ ] Safe failure behavior verified

## Reliability checklist

- [ ] Mac restart recovery
- [ ] Phone restart recovery
- [ ] Network recovery
- [ ] Claude recovery
- [ ] Terminal recovery
- [ ] Browser recovery
- [ ] Tool timeout handling
- [ ] Agent loop protection
- [ ] No uncontrolled retries
- [ ] Clear failure reporting

## Product checklist

- [ ] Voice feels natural
- [ ] Phone UI is simple
- [ ] Mac UI is unobtrusive
- [ ] Tasks are understandable
- [ ] Status is visible
- [ ] Approval requests are clear
- [ ] Logs are understandable
- [ ] Device management works

---

# 4. Complete Timeline

A realistic schedule for one developer learning while building:

| Phase | Duration |
|---|---:|
| Phase 0 — Architecture | 1–2 days |
| Phase 1 — Foundations | 2–3 days |
| Phase 2 — Mac Agent | 3–5 days |
| Phase 3 — Phone ↔ Mac Security | 3–5 days |
| Phase 4 — Voice | 2–4 days |
| Phase 5 — Mac Control | 5–10 days |
| Phase 6 — Claude Code | 3–5 days |
| Phase 7 — Agent Brain | 5–10 days |
| Phase 8 — Memory | 3–5 days |
| Phase 9 — Vision | 4–7 days |
| Phase 10 — Browser | 4–7 days |
| Phase 11 — Integrations | 7–14 days |
| Phase 12 — Security Hardening | 5–10 days |
| Phase 13 — Security Testing | 5–7 days |
| Phase 14 — E2E Testing | 5–7 days |
| Phase 15 — UI/UX | 3–5 days |
| Phase 16 — Beta | 5–7 days |
| Phase 17 — Release | 3–5 days |

## Overall target

**Approximately 8–12 weeks** for a strong, polished personal product if you are learning while building.

A very focused implementation can be faster, but the security and testing phases should not be removed just to reduce the calendar time.

---

# 5. What You Need to Study

Study these alongside the corresponding phases.

## Highest priority

### Programming

- TypeScript
- Python basics
- async programming
- APIs
- JSON
- WebSockets
- subprocesses
- error handling

### AI

- LLM APIs
- prompts
- context
- structured output
- tool/function calling
- agent loops
- planning
- memory
- multimodal models
- evaluations

### macOS

- Swift basics
- macOS application architecture
- Accessibility APIs
- AppleScript/Shortcuts
- process management
- Keychain
- sandboxing
- Hardened Runtime
- code signing
- notarization

### Security

- authentication
- authorization
- encryption
- TLS
- public/private key cryptography
- device identity
- secure secret storage
- OAuth
- least privilege
- threat modeling
- prompt injection
- command injection
- path traversal
- privilege escalation

### Networking

- HTTP
- WebSockets
- TLS
- DNS
- private networking
- secure device pairing

### Databases

- SQLite
- data modeling
- transactions
- indexes
- structured memory

### Testing

- unit testing
- integration testing
- end-to-end testing
- security testing
- adversarial testing
- agent evaluations
- failure testing

---

# 6. What Not to Study First

You do not need to become an AI researcher.

Do not spend the initial months learning:

- neural-network mathematics
- training your own LLM
- GPU programming
- reinforcement learning
- advanced ML research
- model pretraining

Your main challenge is **AI agent engineering + secure computer control + product engineering**.

---

# 7. Recommended Learning Strategy

Do not finish every course before starting development.

Use:

```text
Learn concept
    ↓
Build small component
    ↓
Test
    ↓
Use it in EVA
    ↓
Document
    ↓
Move to next concept
```

For example:

```text
Learn APIs
 ↓
Build Mac communication API
 ↓
Test
 ↓
Learn authentication
 ↓
Secure the API
 ↓
Test
 ↓
Continue
```

This will teach you faster than trying to learn the entire technology stack first.

---

# 8. Final Feature Set

The finished EVA should contain:

## Intelligence

- natural language understanding
- planning
- multi-step execution
- context
- memory
- reasoning
- verification
- recovery

## Voice

- speech recognition
- natural conversation
- text-to-speech
- interruption handling
- session context

## Mac

- application control
- window management
- keyboard
- mouse
- terminal
- filesystem
- browser
- screenshots
- visual understanding

## Development

- VS Code
- terminal
- Git
- GitHub
- Claude Code
- project awareness
- test execution
- development workflow automation

## Phone

- voice interface
- task status
- approvals
- notifications
- device management
- security controls

## Security

- trusted devices
- encrypted communication
- secure authentication
- permissions
- approval system
- least privilege
- Keychain-backed secrets
- audit logs
- device revocation
- safe failure
- prompt-injection defenses

---

# 9. The Final Operating Model

The final system should behave according to this model:

```text
                     USER
                       │
                       ▼
                 VOICE / TEXT
                       │
                       ▼
                 EVA BRAIN
                       │
              Understand the goal
                       │
                       ▼
                    PLAN
                       │
                       ▼
              SELECT TOOL / TOOLS
                       │
                       ▼
                POLICY ENGINE
                       │
            ┌──────────┴──────────┐
            │                     │
          ALLOW                CONFIRM
            │                     │
            │                 USER APPROVAL
            │                     │
            └──────────┬──────────┘
                       ▼
                    EXECUTE
                       │
                       ▼
                    OBSERVE
                       │
                       ▼
                   VERIFY
                       │
              ┌────────┴────────┐
              │                 │
           SUCCESS            FAILURE
              │                 │
              │              RECOVER
              │                 │
              └────────┬────────┘
                       ▼
                    REPORT
                       │
                       ▼
                      USER
```

That is the architecture to aim for.

The product is not finished when it can execute commands. It is finished when it can **understand goals, act safely, verify what happened, recover from failures, protect your computer, and provide a natural voice interface from your phone and Mac**.
