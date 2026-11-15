/**
 * EVA "Ponytail" Pragmatic AI Coding Framework (Phase 19)
 * 7-Step YAGNI Decision Ladder & Anti-Over-Engineering Engine
 * 
 * Enforces senior engineering pragmatism and prevents AI over-engineering:
 * 1. Necessity -> 2. Codebase Reuse -> 3. Standard Library -> 
 * 4. Native Platform -> 5. Installed Dependencies -> 6. Minimal Complexity -> 
 * 7. Minimal Implementation
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { EvaHomeManager } from '../distribution/EvaHomeManager.js';

export type PragmaticMode = 'lite' | 'full' | 'ultra' | 'off';

export type YagniStepName = 
  | 'NECESSITY'
  | 'CODEBASE_REUSE'
  | 'STANDARD_LIBRARY'
  | 'NATIVE_PLATFORM'
  | 'INSTALLED_DEPENDENCIES'
  | 'MINIMAL_COMPLEXITY'
  | 'MINIMAL_IMPLEMENTATION';

export type YagniDecision = 
  | 'REJECT'
  | 'REUSE'
  | 'STDLIB'
  | 'PLATFORM'
  | 'DEPENDENCY'
  | 'ONE_LINER'
  | 'MINIMAL_CODE';

export interface YagniEvaluationInput {
  taskDescription: string;
  targetLanguage?: string;
  proposedDependency?: string;
  workspaceRoot?: string;
  codeSnippet?: string;
  estimatedLinesOfCode?: number;
}

export interface YagniEvaluationResult {
  decision: YagniDecision;
  step: number;
  stepName: YagniStepName;
  mode: PragmaticMode;
  approved: boolean;
  rationale: string;
  suggestedApproach: string;
  locBudget: number;
  warnings: string[];
  remediation?: string;
}

export interface PragmaticConfig {
  mode: PragmaticMode;
  lastUpdated: string;
}

/**
 * Standard Library capability patterns in Node.js / JavaScript
 */
const NODE_STDLIB_MAP: Array<{ pattern: RegExp; module: string; api: string; rationale: string }> = [
  {
    pattern: /\b(?:sha256|sha512|md5|hmac|hash|crypto|random\s*bytes|uuid|guid)\b/i,
    module: 'node:crypto',
    api: 'crypto.createHash() / crypto.randomUUID()',
    rationale: 'Node.js built-in crypto module handles cryptographic operations and UUIDs natively without uuid or crypto-js packages.',
  },
  {
    pattern: /\b(?:read\s*file|write\s*file|mkdir|file\s*exists|fs|read\s*dir|stream|file\s*system)\b/i,
    module: 'node:fs',
    api: 'node:fs / node:fs/promises',
    rationale: 'Node.js built-in fs handles all directory, streaming, and file manipulation without external fs-extra or rimraf.',
  },
  {
    pattern: /\b(?:join\s*path|resolve\s*path|basename|dirname|extension|filepath)\b/i,
    module: 'node:path',
    api: 'node:path',
    rationale: 'Node.js built-in path provides native cross-platform path manipulation without custom string splicing.',
  },
  {
    pattern: /\b(?:hostname|platform|cpu|memory|homedir|tmpdir|uptime|arch)\b/i,
    module: 'node:os',
    api: 'node:os',
    rationale: 'Node.js built-in os provides native operating system metrics without external system information modules.',
  },
  {
    pattern: /\b(?:spawn|exec|child\s*process|fork|run\s*command)\b/i,
    module: 'node:child_process',
    api: 'node:child_process',
    rationale: 'Node.js built-in child_process handles process management without execa.',
  },
  {
    pattern: /\b(?:parse\s*url|format\s*url|query\s*string|search\s*params)\b/i,
    module: 'node:url',
    api: 'new URL() / URLSearchParams',
    rationale: 'Native global URL and URLSearchParams APIs handle parsing without query-string or qs packages.',
  },
  {
    pattern: /\b(?:http\s*request|fetch|rest\s*api|get\s*request|post\s*request|api\s*call)\b/i,
    module: 'global fetch',
    api: 'fetch()',
    rationale: 'Modern Node.js (>=18) features native global fetch without axios, node-fetch, or request.',
  },
];

/**
 * Native Platform CLI tools on macOS and Linux
 */
const NATIVE_PLATFORM_MAP: Array<{ pattern: RegExp; platform: 'darwin' | 'linux' | 'all'; command: string; rationale: string }> = [
  {
    pattern: /\b(?:screen\s*capture|take\s*screenshot|grab\s*screen)\b/i,
    platform: 'darwin',
    command: 'screencapture -x <file>',
    rationale: 'macOS provides native screencapture CLI with zero dependencies.',
  },
  {
    pattern: /\b(?:battery|power|thermals|pmset)\b/i,
    platform: 'darwin',
    command: 'pmset -g batt / pmset -g therm',
    rationale: 'macOS provides pmset CLI for real-time hardware diagnostics.',
  },
  {
    pattern: /\b(?:open\s*url|open\s*browser|open\s*file)\b/i,
    platform: 'all',
    command: process.platform === 'darwin' ? 'open <url>' : 'xdg-open <url>',
    rationale: 'Operating systems provide open / xdg-open for launching native viewer applications.',
  },
  {
    pattern: /\b(?:git\s*status|git\s*diff|git\s*commit|git\s*log)\b/i,
    platform: 'all',
    command: 'git',
    rationale: 'Native git CLI handles repository operations reliably without heavy third-party git bindings.',
  },
];

/**
 * Unnecessary / speculative patterns indicating violation of Step 1 (Necessity / YAGNI)
 */
const SPECULATIVE_PATTERNS = [
  {
    pattern: /\b(?:just\s*in\s*case|in\s*case\s*(?:we\s*)?need|for\s*future\s*use|future-proof(?:ing)?|might\s*need\s*later|premature\s*abstraction|speculative)\b/i,
    rationale: 'YAGNI Violation: Speculative feature rejected. Code should only satisfy current explicit requirements.',
  },
  {
    pattern: /\b(?:generic\s*(?:plugin\s*system|database\s*driver|abstraction|framework)|abstract\s*factory\s*pattern|complex\s*dependency\s*injection)\b/i,
    rationale: 'YAGNI Violation: Over-architected pattern for a single direct consumer. Prefer direct, typed composition.',
  },
  {
    pattern: /\b(?:wrapper\s*around\s*wrapper|pass-through\s*proxy|redundant\s*facade)\b/i,
    rationale: 'YAGNI Violation: Redundant abstraction layer adding friction without functional value.',
  },
];

export class YagniDecisionLadder {
  private mode: PragmaticMode = 'full';
  private homeManager?: EvaHomeManager;
  private configPath?: string;
  private persist: boolean;

  constructor(options?: {
    mode?: PragmaticMode;
    homeManager?: EvaHomeManager;
    persist?: boolean;
  }) {
    this.persist = options?.persist ?? true;
    if (options?.homeManager) {
      this.homeManager = options.homeManager;
      this.configPath = path.join(this.homeManager.getDirectoryPath('config'), 'pragmatic_settings.json');
    }
    if (options?.mode) {
      this.mode = options.mode;
    } else if (this.persist && this.configPath && fs.existsSync(this.configPath)) {
      try {
        const raw = fs.readFileSync(this.configPath, 'utf-8');
        const parsed = JSON.parse(raw) as PragmaticConfig;
        if (parsed.mode) {
          this.mode = parsed.mode;
        }
      } catch {
        this.mode = 'full';
      }
    }
  }

  /**
   * Retrieves current anti-over-engineering operational mode
   */
  public getMode(): PragmaticMode {
    return this.mode;
  }

  /**
   * Updates the anti-over-engineering mode and persists state if configured
   */
  public setMode(newMode: PragmaticMode): void {
    this.mode = newMode;
    if (this.persist && this.configPath) {
      try {
        const config: PragmaticConfig = {
          mode: this.mode,
          lastUpdated: new Date().toISOString(),
        };
        fs.mkdirSync(path.dirname(this.configPath), { recursive: true, mode: 0o700 });
        fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
      } catch {
        // Silently tolerate persistence failure in test/ephemeral environments
      }
    }
  }

  /**
   * Evaluates a proposed coding task or feature against the 7-Step YAGNI Decision Ladder
   */
  public evaluate(input: YagniEvaluationInput): YagniEvaluationResult {
    const task = input.taskDescription.trim();
    const warnings: string[] = [];

    // Mode OFF: No guardrails, permissive pass-through
    if (this.mode === 'off') {
      return {
        decision: 'MINIMAL_CODE',
        step: 7,
        stepName: 'MINIMAL_IMPLEMENTATION',
        mode: this.mode,
        approved: true,
        rationale: 'Anti-over-engineering guardrails are disabled (mode: off).',
        suggestedApproach: 'Direct implementation without YAGNI constraints.',
        locBudget: 500,
        warnings: ['Mode is OFF: Over-engineering checks are inactive.'],
      };
    }

    // ========================================================
    // Step 1: Necessity (YAGNI Check)
    // ========================================================
    for (const spec of SPECULATIVE_PATTERNS) {
      if (spec.pattern.test(task)) {
        return {
          decision: 'REJECT',
          step: 1,
          stepName: 'NECESSITY',
          mode: this.mode,
          approved: false,
          rationale: spec.rationale,
          suggestedApproach: 'Omit speculative implementation. Build only when concretely needed.',
          locBudget: 0,
          warnings: ['Task flagged as premature optimization or speculative architecture.'],
          remediation: 'Remove speculative abstraction and focus exclusively on the core requirement.',
        };
      }
    }

    // ========================================================
    // Step 2: Codebase Reuse
    // ========================================================
    const reuseCheck = this.checkCodebaseReuse(task, input.workspaceRoot);
    if (reuseCheck) {
      return {
        decision: 'REUSE',
        step: 2,
        stepName: 'CODEBASE_REUSE',
        mode: this.mode,
        approved: true,
        rationale: `Existing functionality discovered in codebase: ${reuseCheck.description}`,
        suggestedApproach: `Import and reuse '${reuseCheck.existingModule}' instead of creating a new helper.`,
        locBudget: this.getLocBudget(15),
        warnings,
      };
    }

    // ========================================================
    // Step 3: Standard Library
    // ========================================================
    for (const std of NODE_STDLIB_MAP) {
      if (std.pattern.test(task) || (input.codeSnippet && std.pattern.test(input.codeSnippet))) {
        return {
          decision: 'STDLIB',
          step: 3,
          stepName: 'STANDARD_LIBRARY',
          mode: this.mode,
          approved: true,
          rationale: std.rationale,
          suggestedApproach: `Use Node.js standard library '${std.module}' (${std.api}) natively.`,
          locBudget: this.getLocBudget(30),
          warnings,
        };
      }
    }

    // ========================================================
    // Step 4: Native Platform Utility
    // ========================================================
    for (const plat of NATIVE_PLATFORM_MAP) {
      if (plat.pattern.test(task)) {
        return {
          decision: 'PLATFORM',
          step: 4,
          stepName: 'NATIVE_PLATFORM',
          mode: this.mode,
          approved: true,
          rationale: plat.rationale,
          suggestedApproach: `Execute platform utility '${plat.command}' via child process or terminal tool.`,
          locBudget: this.getLocBudget(20),
          warnings,
        };
      }
    }

    // ========================================================
    // Step 5: Installed Dependencies
    // ========================================================
    if (input.proposedDependency) {
      const depCheck = this.checkDependency(input.proposedDependency, input.workspaceRoot);
      if (!depCheck.alreadyInstalled) {
        if (this.mode === 'full' || this.mode === 'ultra') {
          return {
            decision: 'REJECT',
            step: 5,
            stepName: 'INSTALLED_DEPENDENCIES',
            mode: this.mode,
            approved: false,
            rationale: `Installing new npm package '${input.proposedDependency}' is blocked under ${this.mode.toUpperCase()} mode without explicit authorization.`,
            suggestedApproach: depCheck.alternative || 'Implement using Node.js standard library or existing workspace dependencies.',
            locBudget: 0,
            warnings: [`Unauthorized dependency introduction: '${input.proposedDependency}'`],
            remediation: 'Replace with native Node.js standard library or existing package.',
          };
        } else {
          warnings.push(`Warning: Proposed dependency '${input.proposedDependency}' is not currently in package.json.`);
        }
      } else {
        return {
          decision: 'DEPENDENCY',
          step: 5,
          stepName: 'INSTALLED_DEPENDENCIES',
          mode: this.mode,
          approved: true,
          rationale: `Package '${input.proposedDependency}' is already installed in project dependencies.`,
          suggestedApproach: `Import from installed package '${input.proposedDependency}'.`,
          locBudget: this.getLocBudget(40),
          warnings,
        };
      }
    }

    // ========================================================
    // Step 6: Minimal Complexity (One-Liner / Pure Function)
    // ========================================================
    if (this.isSimpleTransformation(task, input.estimatedLinesOfCode)) {
      return {
        decision: 'ONE_LINER',
        step: 6,
        stepName: 'MINIMAL_COMPLEXITY',
        mode: this.mode,
        approved: true,
        rationale: 'Task can be satisfied with a clean one-liner, regex, or concise pure function without classes.',
        suggestedApproach: 'Implement as an exported pure helper function (< 10 lines of code).',
        locBudget: this.getLocBudget(10),
        warnings,
      };
    }

    // ========================================================
    // Step 7: Minimal Code Implementation
    // ========================================================
    const budget = this.getLocBudget(input.estimatedLinesOfCode || 50);
    return {
      decision: 'MINIMAL_CODE',
      step: 7,
      stepName: 'MINIMAL_IMPLEMENTATION',
      mode: this.mode,
      approved: true,
      rationale: 'Steps 1–6 verified. Implement minimal, strongly-typed code satisfying requirements.',
      suggestedApproach: `Write focused TypeScript implementation adhering to max ${budget} LOC budget.`,
      locBudget: budget,
      warnings,
    };
  }

  /**
   * Helper to scale line of code budget based on operational mode
   */
  private getLocBudget(baseBudget: number): number {
    switch (this.mode) {
      case 'ultra':
        return Math.max(10, Math.floor(baseBudget * 0.5));
      case 'full':
        return baseBudget;
      case 'lite':
        return Math.floor(baseBudget * 1.5);
      case 'off':
        return baseBudget * 3;
    }
  }

  /**
   * Checks if an existing workspace module already implements the requested capability
   */
  private checkCodebaseReuse(task: string, workspaceRoot?: string): { existingModule: string; description: string } | null {
    const lower = task.toLowerCase();

    if (/\b(?:log(?:ger|ging)?|audit\s*log)\b/.test(lower)) {
      return { existingModule: 'core/logger/Logger.ts', description: 'Centralized redact-safe Logger' };
    }
    if (/\b(?:ast|parse\s*typescript|symbol\s*extract|outline)\b/.test(lower)) {
      return { existingModule: 'core/context/ASTSymbolParser.ts', description: 'AST Symbol Parser' };
    }
    if (/\b(?:token\s*budget|token\s*count|rate\s*limit)\b/.test(lower)) {
      return { existingModule: 'core/context/TokenBudgetRadar.ts', description: 'Token Budget Radar' };
    }
    if (/\b(?:context\s*prun|compact\s*code|slice\s*diff)\b/.test(lower)) {
      return { existingModule: 'core/context/ContextPruner.ts', description: 'Context Pruner' };
    }
    if (/\b(?:diagnostics?|health\s*check|system\s*check)\b/.test(lower)) {
      return { existingModule: 'core/health/EvaDoctor.ts', description: 'EvaDoctor diagnostics engine' };
    }

    return null;
  }

  /**
   * Verifies if a proposed dependency is present in package.json
   */
  private checkDependency(depName: string, workspaceRoot?: string): { alreadyInstalled: boolean; alternative?: string } {
    const root = workspaceRoot || process.cwd();
    const pkgPath = path.join(root, 'package.json');

    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
        if (depName in deps) {
          return { alreadyInstalled: true };
        }
      } catch {
        // Continue to alternatives
      }
    }

    // Check common unnecessary packages and their native alternatives
    const altMap: Record<string, string> = {
      'uuid': 'Use native crypto.randomUUID() from node:crypto',
      'axios': 'Use native global fetch()',
      'node-fetch': 'Use native global fetch()',
      'chalk': 'Use standard ANSI escape codes or simple color formatter',
      'lodash': 'Use ES2024 Array and Object methods natively (map, filter, reduce, find, Object.entries)',
      'moment': 'Use native Date / Intl.DateTimeFormat APIs',
      'dayjs': 'Use native Date / Intl.DateTimeFormat APIs',
      'rimraf': 'Use fs.rmSync(path, { recursive: true, force: true }) from node:fs',
      'mkdirp': 'Use fs.mkdirSync(path, { recursive: true }) from node:fs',
      'fs-extra': 'Use native node:fs and node:fs/promises',
    };

    return {
      alreadyInstalled: false,
      alternative: altMap[depName.toLowerCase()],
    };
  }

  /**
   * Determines if a task describes a trivial transformation suitable for Step 6
   */
  private isSimpleTransformation(task: string, estimatedLoc?: number): boolean {
    if (estimatedLoc !== undefined && estimatedLoc <= 15) {
      return true;
    }
    const lower = task.toLowerCase();
    return /\b(?:format\s*string|slugify|capitalize|trim|parse\s*number|filter\s*list|sort\s*by|is\s*empty|clamp)\b/.test(lower);
  }
}
