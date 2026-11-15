# Phase 19: "Ponytail" Pragmatic AI Coding Framework & Governance Engine

## 1. Executive Overview

Phase 19 introduces EVA's **"Ponytail" Pragmatic AI Coding Framework**, eliminating AI over-engineering, speculative architecture, and sloppy code generation. 

Standard AI coding assistants default to premature abstraction: generating unneeded factory classes, installing redundant third-party npm libraries for trivial tasks, leaving silent empty catch blocks, creating hollow tests that assert `true === true`, and leaking credentials in plain text.

The Phase 19 engine enforces senior-developer discipline through:
1. **The 7-Step YAGNI Decision Ladder**: A deterministic evaluation pipeline executed before any code is generated or modified.
2. **Anti-Over-Engineering Modes**: Configurable operational guardrails (`lite`, `full` [default], `ultra`, `off`).
3. **Automated Code Review Auditor**: Static quality gate analyzing AST complexity, secret leaks, hollow mock tests, deep nesting, and TypeScript strictness.
4. **Registered Developer Tools & CLI Family**: Integrated `pragmatic.yagni_eval` and `code.review` tools (bringing EVA's tool registry to **32 registered tools**).

---

## 2. The 7-Step YAGNI Decision Ladder

```mermaid
flowchart TD
    Task[Coding Requirement / Goal] --> Mode{Active Mode Check}
    Mode -- off --> Bypass[Bypass Guardrails (Mode: OFF)]
    Mode -- active --> Q1{1. Is this feature strictly necessary?}
    
    Q1 -- No --> S1[Step 1: REJECT (Speculative / Premature)]
    Q1 -- Yes --> Q2{2. Does it exist in the codebase?}
    
    Q2 -- Yes --> S2[Step 2: REUSE (Existing Module / Helper)]
    Q2 -- No --> Q3{3. Can Node.js stdlib solve it?}
    
    Q3 -- Yes --> S3[Step 3: STDLIB (node:crypto, node:fs, node:os, fetch)]
    Q3 -- No --> Q4{4. Can native OS command handle it?}
    
    Q4 -- Yes --> S4[Step 4: PLATFORM (git, screencapture, pmset, open)]
    Q4 -- No --> Q5{5. Is proposed dependency installed?}
    
    Q5 -- No (New npm pkg) --> S5A[Step 5: REJECT / WARN (Unauthorized Dependency)]
    Q5 -- Yes (Installed) --> S5B[Step 5: DEPENDENCY (Use Existing Package)]
    Q5 -- None Needed --> Q6{6. Can it be a clean one-liner?}
    
    Q6 -- Yes --> S6[Step 6: ONE_LINER (Pure helper < 15 LOC)]
    Q6 -- No --> S7[Step 7: MINIMAL_CODE (Minimal TS within LOC budget)]
```

### 2.1 Decision States & Ladder Steps

| Step | Name | Evaluation Target | Standard Action / Remediation |
|---|---|---|---|
| **1** | `NECESSITY` | Catches "just in case", speculative frameworks, premature abstraction | **REJECT**: Omit implementation; build only when explicitly required. |
| **2** | `CODEBASE_REUSE` | Scans workspace for existing loggers, parsers, token radars, or utils | **REUSE**: Import and reuse existing workspace helper. |
| **3** | `STANDARD_LIBRARY` | Checks if `node:crypto`, `node:fs`, `node:path`, `node:os`, `fetch()` suffices | **STDLIB**: Use native Node.js standard library; avoid wrapper packages. |
| **4** | `NATIVE_PLATFORM` | Checks if `git`, `screencapture`, `pmset`, `open`, or `xdg-open` handles it | **PLATFORM**: Execute native macOS/Linux CLI command. |
| **5** | `INSTALLED_DEPENDENCIES` | Inspects `package.json` for existing libraries | **DEPENDENCY**: Reuse existing packages; reject new external npm installs without approval. |
| **6** | `MINIMAL_COMPLEXITY` | Identifies simple transformations (formatting, slugify, filter) | **ONE_LINER**: Implement as a pure, exported function (< 15 lines). |
| **7** | `MINIMAL_IMPLEMENTATION` | Evaluates requirements when steps 1–6 pass | **MINIMAL_CODE**: Write minimal strongly typed code adhering to LOC budget. |

---

## 3. Anti-Over-Engineering Operational Modes

EVA supports 4 persistent operational modes stored in `~/.local/share/eva/config/pragmatic_settings.json`:

| Mode | Strictness | LOC Budget Scaling | Behavior & Restrictions |
|---|---|---|---|
| `lite` | Moderate | 150% base budget | Standard guardrails; warns on duplicate abstractions, allows prototyping. |
| `full` *(Default)* | High | 100% base budget | Strictly enforces the 7-step YAGNI ladder; strictly blocks unapproved dependencies. |
| `ultra` | Extreme | 50% base budget | Aggressive minimalism; mandates inlining, cuts LOC budget by half, rejects abstractions. |
| `off` | Disabled | 300% base budget | Guardrails disabled for exploratory or experimental generation. |

---

## 4. Automated Code Review Auditor & Quality Gates

The `CodeReviewAuditor` engine (`core/pragmatic/CodeReviewAuditor.ts`) executes static code analysis against senior engineering rules:

### 4.1 Inviolable Rules & Penalty Weights

| Rule Name | Severity | Penalty | Target Violation |
|---|---|---|---|
| `NO_HARDCODED_SECRETS` | `CRITICAL` | -40 pts | Hardcoded OpenAI keys (`sk-proj-...`), Anthropic keys, AWS keys, GitHub tokens, private keys. |
| `NO_EVAL` | `CRITICAL` | -40 pts | Direct dynamic code execution via `eval()` or `new Function()`. |
| `NO_HOLLOW_TESTS` | `HIGH` | -15 pts | Dummy tautological test assertions (`expect(true).toBe(true)`). |
| `PATH_TRAVERSAL_RISK` | `HIGH` | -15 pts | Hardcoded relative escapes (`../../../`) bypassing workspace boundaries. |
| `NO_EMPTY_CATCH` | `HIGH` | -15 pts | Silent empty catch blocks swallow runtime exceptions without logging. |
| `MAX_NESTING_DEPTH` | `MEDIUM` | -8 pts | Indentation depth exceeding 5 levels; requires guard clauses or extraction. |
| `NO_EXPLICIT_ANY` | `MEDIUM` | -8 pts | Use of `any` without explicit justification or eslint annotation. |
| `NO_UNUSED_IMPORTS` | `LOW` | -3 pts | Unreferenced imports that bloat bundle sizes and context windows. |

### 4.2 Scoring & Quality Verdicts
- **Score 90–100**: `PASS (Excellent)` — Adheres to senior engineering standards.
- **Score 75–89**: `WARN (Acceptable)` — Pass with actionable warnings.
- **Score < 75 or CRITICAL**: `FAIL (Rejected)` — Requires immediate remediation before commit.

---

## 5. Registered Developer Tools

Two new tools integrated into EVA's core dispatch pipeline:

| Tool Manifest | Risk Level | Capability Required | Description |
|---|---|---|---|
| `pragmatic.yagni_eval` | `READ` | `SYSTEM_INFO` | Evaluates a proposed task, feature, or dependency against the 7-step YAGNI ladder. |
| `code.review` | `READ` | `FILESYSTEM_READ` | Performs static code quality audits, secret leak scanning, and anti-over-engineering review. |

---

## 6. CLI Command Family Reference

```bash
# View current anti-over-engineering operational mode
eva mode

# Switch operational mode to ULTRA, FULL, LITE, or OFF
eva mode ultra
eva mode full

# Audit a source file for quality, secrets, complexity, and senior engineering rules
eva review core/logger/Logger.ts

# Audit git working tree diff before committing
eva review diff

# Evaluate a proposed feature through the 7-Step YAGNI Decision Ladder
eva yagni "add generic plugin framework just in case"
eva yagni "generate secure sha256 checksum for backup"
```

### Live CLI Examples

#### `eva yagni "add generic plugin framework just in case"`
```text
EVA Ponytail YAGNI Evaluation
================================================================
Status:            ✗ REJECTED
Decision:          REJECT
Ladder Step:       Step 1 (NECESSITY)
Operational Mode:  FULL
LOC Budget:        0 lines
Rationale:         YAGNI Violation: Speculative feature rejected. Code should only satisfy current explicit requirements.
Suggested:         Omit speculative implementation. Build only when concretely needed.
Warnings:          Task flagged as premature optimization or speculative architecture.
Remediation:       Remove speculative abstraction and focus exclusively on the core requirement.
================================================================
```

#### `eva review core/logger/Logger.ts`
```text
✓ PASS Code Review Quality Audit: Logger.ts (Score: 100/100)
Lines: 185 (151 code, 4 comments) | Functions: 12 | Complexity: 68
No violations found. Code adheres to Ponytail senior engineering standards.
```

---

## 7. Verification & Automated Test Suite

Phase 19 adds 20 unit tests in `tests/unit/pragmatic/pragmatic_system.test.ts`:
- ✓ Step 1 (Necessity): Rejection of speculative / future-proof requirements.
- ✓ Step 2 (Codebase Reuse): Detection and suggestion of existing workspace helpers.
- ✓ Step 3 (Standard Library): Recognition of `node:crypto`, `node:fs`, `node:path`, `fetch`.
- ✓ Step 4 (Native Platform): Detection of native OS commands (`git`, `screencapture`, `pmset`).
- ✓ Step 5 (Installed Dependencies): Approval of installed packages and rejection of unauthorized new packages in `full` mode.
- ✓ Step 6 (Minimal Complexity): One-liner pure function recommendation.
- ✓ Step 7 (Minimal Implementation): LOC budgeting scaled across operational modes.
- ✓ Anti-over-engineering mode transitions (`lite`, `full`, `ultra`, `off`).
- ✓ CodeReviewAuditor on clean code (100/100 PASS).
- ✓ Secret leak detection (OpenAI keys, Anthropic keys, AWS credentials, private keys).
- ✓ Hollow mock test detection (tautological assertions).
- ✓ Nesting depth & dynamic `eval()` bans.
- ✓ Unified git diff auditing.
- ✓ `pragmatic.yagni_eval` and `code.review` tool execution and schema verification.
- ✓ End-to-end natural language routing in `AgentBrain`.

**Overall Test Suite Status**: **40 test files passed (40/40), 237 tests passed (237/237), 100% pass rate**.
