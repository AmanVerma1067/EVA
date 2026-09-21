# EVA — System Architecture & Component Design

## 1. High-Level Topology

```
                         USER
                          │
                   Voice / Text / Touch
                          │
                          ▼
                 ┌──────────────────┐
                 │   PHONE CLIENT   │
                 │                  │
                 │ Voice (STT/TTS)  │
                 │ Status Dashboard │
                 │ Approval Modal   │
                 │ Ed25519 Device ID│
                 └────────┬─────────┘
                          │
             Mutual Authentication + TLS / WSS
             Nonce-Based Replay Protection
                          │
                          ▼
                 ┌──────────────────┐
                 │    MAC DAEMON    │
                 │                  │
                 │ Session Manager  │
                 │ Policy Engine    │
                 │ Audit System     │
                 │ Agent Loop       │
                 │ Tool Router      │
                 └────────┬─────────┘
                          │
      ┌───────────┬───────┼───────────┬───────────┐
      ▼           ▼       ▼           ▼           ▼
   Terminal     macOS   Browser     Vision     Claude Code
                Control
```

## 2. Component Specifications

### 2.1 Phone Client Layer
- **Audio Capture & Synthesis**: Handles microphone streams, voice activity detection (VAD), audio compression, and low-latency audio playback.
- **Security Keypair**: Generates an Ed25519 keypair inside the mobile device's Secure Enclave / KeyStore.
- **Approval Engine**: Renders cryptographically signed approval prompts detailing:
  - Tool name and version.
  - Full parameters (with highlighted diffs for file/code changes).
  - Risk tier (`SENSITIVE` / `CRITICAL`).
  - Request timeout (30 seconds default, auto-rejects on timeout).

### 2.2 Network Gateway & Session Management
- **Local Service Discovery**: Advertises service on local network (mDNS/Bonjour).
- **Mutual Handshake Protocol**:
  1. Phone sends `PairingRequest` containing device name and public key.
  2. Mac displays ephemeral 6-digit numeric PIN.
  3. User enters PIN into phone; phone proves possession of PIN via HMAC-SHA256.
  4. Mac records phone public key in trusted device store (`~/.eva/trusted_devices.json`).
  5. Subsequent connections exchange signed challenge nonces to establish authenticated WebSocket sessions.
- **Session Revocation**: One-click revocation from Mac menu bar or phone client invalidates all active tokens immediately.

### 2.3 Policy Engine & Risk Classifier
The deterministic policy engine evaluates every structured tool request before dispatch:
- **Input**:
  - `caller`: Authenticated session and device identity.
  - `toolName`: Unique tool identifier.
  - `parameters`: Strictly validated parameter object.
  - `context`: Task origin, current directory, ambient state.
- **Risk Assessment**:
  - `READ`: Safe read-only inspections. Autonomous execution allowed.
  - `NORMAL`: Low-impact operational actions (e.g. app launch, window focus). Autonomous execution allowed with audit logging.
  - `SENSITIVE`: Workspace file modifications, git operations, local tests. Requires policy whitelist or user consent.
  - `CRITICAL`: System-level configuration, destructive deletions (`rm`), credential access, remote network exfiltration. Mandatory human approval.
- **Decision Engine**:
  - Emits `ALLOW`, `REQUIRE_APPROVAL`, or `DENY`.

### 2.4 Audit Logging Subsystem
- Append-only JSONL log written to `~/.eva/audit/audit.log`.
- State transition tracking:
  - `REQUESTED`: Tool invocation proposed.
  - `AUTHORIZED`: Evaluated by policy engine and (if necessary) approved by human.
  - `EXECUTED`: Tool runner completed operation.
  - `VERIFIED`: Output inspected and confirmed against objective success criteria.
- Automatic secret scrubbers redact passwords, private keys, API tokens, and authorization headers.

### 2.5 Tool Registry & Execution Router
- Every tool implements a strict `ToolContract`:
  ```typescript
  interface ToolContract<TInput, TOutput> {
    name: string;
    version: string;
    description: string;
    riskLevel: 'READ' | 'NORMAL' | 'SENSITIVE' | 'CRITICAL';
    inputSchema: ZodSchema<TInput>;
    outputSchema: ZodSchema<TOutput>;
    timeoutMs: number;
    execute(params: TInput, ctx: ExecutionContext): Promise<ToolResult<TOutput>>;
    verify(params: TInput, result: ToolResult<TOutput>, ctx: ExecutionContext): Promise<VerificationResult>;
  }
  ```
- Tool router enforces timeouts via `AbortController`.
- Tool failures return normalized structured error codes: `RECOVERABLE`, `NON_RECOVERABLE`, `REQUIRES_HUMAN_INPUT`, `SECURITY_VIOLATION`.

### 2.6 Agent Planner & Execution Loop
- Multi-step ReAct loop with strict boundary guards:
  - Step budget: Max 50 tool calls.
  - Time budget: Max 600 seconds.
  - Cycle detection: Detects identical repetitive actions and halts before runaway loops occur.
  - Step-by-step verification: Result of previous tool verified before invoking next tool.

