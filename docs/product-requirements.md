# EVA — Product Requirements Document (PRD)

## 1. Executive Summary

EVA is a private, voice-controlled AI operating layer designed for a MacBook (M2 primary trusted execution environment) and phone (voice and remote-control companion interface). EVA provides natural-language computing, multi-step task planning, deterministic macOS desktop automation, terminal control, scoped filesystem management, browser automation, visual screen understanding, and Claude Code developer integration.

## 2. Core Principles & Non-Negotiable Rules

1. **The LLM is Never the Security Boundary**:
   The LLM generates structured tool proposals. A deterministic local policy engine validates, categorizes risk, and either permits, requires human approval, or blocks execution.
2. **Never Claim Success Without Verification**:
   All operations must follow the pipeline: `ACTION → RESULT → VERIFICATION → CONFIRMED/FAILED/PARTIAL`. Process exit code 0 alone does not prove goal attainment.
3. **Fail Closed**:
   Any ambiguity in identity, authorization, parameter validation, or tool availability results in execution rejection or explicit clarification.
4. **Least Privilege & Scoped Access**:
   Tools receive the minimum filesystem, network, and system permissions necessary for their discrete purpose.
5. **No Secret Ingestion**:
   Credentials, keys, and personal tokens are isolated in macOS Keychain and redacted from logs, AI context, and telemetry.

## 3. System Components & Personas

- **User**: The human owner who controls the system, configures trust levels, issues voice/text requests, and approves high-risk actions.
- **Phone Companion Client**:
  - Voice capture (STT) and voice feedback (TTS).
  - Out-of-band interactive approval modal for sensitive/critical operations.
  - Task status, activity feed, and device revocation controls.
- **Mac EVA Daemon**:
  - Secure local gateway (authenticated WebSocket / TLS).
  - Session Manager & Device Registry.
  - Deterministic Policy Engine.
  - Tamper-evident Audit Logger.
  - Agent Loop & Multi-Step Planner.
  - Tool Registry, Router, and Execution Sandboxes.
- **Execution Subsystems**:
  - Native macOS Application & Window Controller (`osascript`, Accessibility APIs).
  - Scoped Terminal & Shell Runner.
  - Scoped Filesystem Driver.
  - Claude Code Process Controller.
  - Screen Capture & Vision Grounding Engine.
  - Headless/Headed Browser Controller.

## 4. Functional Requirements

### 4.1 Device Pairing & Trust Management
- Mutual pairing over local network using an ephemeral 6-digit PIN and Ed25519 public key exchange.
- Session tokens with configurable TTL (default 12 hours) and instant revocation.
- Monotonic sequence nonces preventing request replay.

### 4.2 Voice Interaction
- Low-latency voice capture with local or streaming speech-to-text.
- Audio interruption / barge-in support.
- Concise spoken feedback; detailed diagnostics streamed to phone/mac display.

### 4.3 Task Execution & Planning
- Multi-step task decomposition with observation and verification at each step.
- Bounded retries (maximum 3 safe attempts per failed step).
- Hard guardrails:
  - Max task execution time: 10 minutes (configurable).
  - Max tool calls per goal: 50.
  - Max cycle detection: Identical consecutive state transitions trigger safe stop.

### 4.4 Human-in-the-Loop Approval
- Any tool categorized as `SENSITIVE` (per policy) or `CRITICAL` (always) requires explicit confirmation on the user's phone or Mac menu bar before execution commences.

## 5. Non-Functional Requirements

- **Latency**: Voice-to-intent acknowledgment under 1.5 seconds.
- **Resource Footprint**: Background daemon CPU idle < 1%, memory consumption < 200MB.
- **Reliability**: Zero silent failures, zero unbounded loops, graceful recovery on network disconnect.
- **Security Audit**: 100% of tool invocations, policy evaluations, and approvals recorded in structured JSONL format.

