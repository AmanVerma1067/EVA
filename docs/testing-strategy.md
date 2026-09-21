# EVA — Testing Strategy & Verification Protocol

## 1. Universal Testing Hierarchy

EVA uses a 7-level automated testing hierarchy. No feature can be promoted without passing its relevant test levels.

```
┌─────────────────────────────────────────────────────────┐
│ Level 7: Agent Evaluations (Goal understanding, safety) │
├─────────────────────────────────────────────────────────┤
│ Level 6: Reliability & Chaos Tests (Restarts, crashes)  │
├─────────────────────────────────────────────────────────┤
│ Level 5: Security & Adversarial Tests (Attacks, bounds) │
├─────────────────────────────────────────────────────────┤
│ Level 4: End-to-End Tests (Full user workflows)         │
├─────────────────────────────────────────────────────────┤
│ Level 3: Integration Tests (Multi-component pipelines)  │
├─────────────────────────────────────────────────────────┤
│ Level 2: Unit Tests (Isolated functions & classes)      │
├─────────────────────────────────────────────────────────┤
│ Level 1: Static Analysis (TypeScript, ESLint, Prettier) │
└─────────────────────────────────────────────────────────┘
```

## 2. Testing Levels Explained

### Level 1: Static Analysis
- TypeScript compiler (`tsc --noEmit`) with `strict: true`.
- ESLint rules preventing unchecked `any`, unhandled promises, and console leaks.

### Level 2: Unit Tests
- Testing individual domain classes: `PolicyEngine`, `AuditLogger`, `SessionManager`, `ToolRouter`.
- 100% path coverage on security-sensitive routing logic.

### Level 3: Integration Tests
- Testing tool dispatch end-to-end:
  - Input Schema Validation → Policy Evaluation → Audit Event → Execution → Verification.
  - Mocked system boundaries where appropriate to ensure reproducible CI execution.

### Level 4: End-to-End Tests
- Testing complete workflows:
  - Phone pairing handshake → Session establishment → Command request → Approval prompt → Tool execution → Status update.

### Level 5: Security & Adversarial Testing
- Explicit penetration testing test cases:
  1. Path traversal injection (`../../../../etc/shadow`).
  2. Malformed JSON-RPC and schema mismatch attacks.
  3. Execution of `CRITICAL` tools without signed approval token.
  4. Prompt injection attempts designed to bypass policy rules.
  5. Replay attacks with stale timestamps and repeated nonces.

### Level 6: Reliability & Chaos Tests
- Simulating network dropouts during active tool execution.
- Testing process termination and state recovery.
- Verification of bounded retries (halting after 3 failed attempts).
- Cycle detection preventing runaway loops.

### Level 7: Agent Evaluations
- Measuring whether the LLM planner:
  - Interprets user instructions accurately.
  - Chooses least-privilege tools.
  - Halts appropriately on security blocks.

## 3. Definition of Done (DoD) Checklist

A feature or phase is **DONE** only when:
- [x] Implementation complete.
- [x] Type checking passes (`tsc --noEmit`).
- [x] Unit tests pass (`npm run test:unit`).
- [x] Security test suite passes (`npm run test:security`).
- [x] Actual behavior verified with objective proof.
- [x] Documentation updated.
- [x] No release-blocking vulnerabilities present.

