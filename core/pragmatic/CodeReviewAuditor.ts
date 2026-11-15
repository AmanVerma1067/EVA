/**
 * EVA "Ponytail" Pragmatic AI Coding Framework (Phase 19)
 * Automated Code Review Auditor & Senior Engineering Quality Gate
 * 
 * Enforces production-grade coding standards:
 * - Secret / credential leak scanning
 * - Hollow mock test detection (bans tests with trivial dummy assertions)
 * - Over-engineering & complexity checks (nesting depth, function length)
 * - TypeScript strictness & missing error handling
 * - Dead code and unused imports
 * - Security boundary & path traversal checks
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export type ReviewSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export interface ReviewViolation {
  rule: string;
  severity: ReviewSeverity;
  line?: number;
  message: string;
  snippet?: string;
  remediation: string;
}

export interface CodeMetrics {
  totalLines: number;
  codeLines: number;
  commentLines: number;
  blankLines: number;
  functionCount: number;
  complexityScore: number;
  secretLeaksFound: number;
}

export interface CodeReviewResult {
  filePath?: string;
  score: number; // 0 to 100
  verdict: 'PASS' | 'WARN' | 'FAIL';
  violationsCount: number;
  violations: ReviewViolation[];
  metrics: CodeMetrics;
  summary: string;
}

/**
 * Secret patterns that represent dangerous credential leaks
 */
const SECRET_PATTERNS = [
  {
    name: 'OpenAI API Key',
    regex: /\b(?:sk-[a-zA-Z0-9_-]{20,}|sk-proj-[a-zA-Z0-9_-]{30,})\b/,
    remediation: 'Use environment variables (process.env.OPENAI_API_KEY) or secret manager.',
  },
  {
    name: 'Anthropic API Key',
    regex: /\bsk-ant-[a-zA-Z0-9_-]{20,}\b/,
    remediation: 'Use environment variables (process.env.ANTHROPIC_API_KEY).',
  },
  {
    name: 'AWS Access Key ID',
    regex: /\bAKIA[0-9A-Z]{16}\b/,
    remediation: 'Use AWS IAM roles, credentials file, or AWS_ACCESS_KEY_ID env var.',
  },
  {
    name: 'GitHub Token',
    regex: /\b(?:ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59})\b/,
    remediation: 'Store GitHub tokens in secrets manager or CI/CD environment variables.',
  },
  {
    name: 'Private Key Header',
    regex: /-----BEGIN\s+(?:RSA|EC|DSA|OPENSSH|PGP|PRIVATE)\s+KEY-----/,
    remediation: 'Never hardcode private keys in source files. Load dynamically from secure storage.',
  },
  {
    name: 'Hardcoded High-Entropy Password/Secret',
    regex: /(?:password|secret|api_key|auth_token)\s*[:=]\s*['"][a-zA-Z0-9!@#$%^&*()_+=\-`~]{12,}['"]/i,
    remediation: 'Move sensitive credentials to protected configuration or environment variables.',
  },
];

/**
 * Hollow mock test patterns in test suites
 */
const HOLLOW_TEST_PATTERNS = [
  {
    name: 'Tautological Assertion',
    regex: /expect\s*\(\s*(?:true|false|1|0|null|undefined)\s*\)\s*\.\s*(?:toBe|toEqual)\s*\(\s*(?:true|false|1|0|null|undefined)\s*\)/,
    remediation: 'Assert the actual output of the unit under test rather than constant booleans or literals.',
  },
  {
    name: 'Tautological toBeTruthy on True',
    regex: /expect\s*\(\s*true\s*\)\s*\.\s*toBeTruthy\s*\(\s*\)/,
    remediation: 'Assert real test subject outputs instead of hardcoded `true`.',
  },
];

export class CodeReviewAuditor {
  private workspaceRoot: string;

  constructor(options?: { workspaceRoot?: string }) {
    this.workspaceRoot = options?.workspaceRoot || process.cwd();
  }

  /**
   * Audits a file on disk
   */
  public async auditFile(filePath: string): Promise<CodeReviewResult> {
    const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(this.workspaceRoot, filePath);
    if (!fs.existsSync(resolved)) {
      return {
        filePath,
        score: 0,
        verdict: 'FAIL',
        violationsCount: 1,
        violations: [
          {
            rule: 'FILE_ACCESSIBILITY',
            severity: 'CRITICAL',
            message: `Target file not found: ${resolved}`,
            remediation: 'Verify file path and workspace boundaries.',
          },
        ],
        metrics: {
          totalLines: 0,
          codeLines: 0,
          commentLines: 0,
          blankLines: 0,
          functionCount: 0,
          complexityScore: 0,
          secretLeaksFound: 0,
        },
        summary: `File not found: ${filePath}`,
      };
    }

    const code = fs.readFileSync(resolved, 'utf-8');
    const result = this.auditCode(code, path.basename(resolved));
    result.filePath = filePath;
    return result;
  }

  /**
   * Audits raw code string
   */
  public auditCode(code: string, fileName = 'anonymous.ts'): CodeReviewResult {
    const lines = code.split('\n');
    const violations: ReviewViolation[] = [];
    const isTestFile = /\.(?:test|spec)\.[a-zA-Z0-9]+$/.test(fileName);

    let codeLines = 0;
    let commentLines = 0;
    let blankLines = 0;
    let functionCount = 0;
    let secretLeaksFound = 0;
    let maxNestingDepth = 0;

    // Track unused imports and declarations
    const importedIdentifiers = new Set<string>();
    const usedIdentifiers = new Set<string>();

    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;
      const rawLine = lines[i];
      const trimmed = rawLine.trim();

      if (trimmed.length === 0) {
        blankLines++;
        continue;
      }

      if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
        commentLines++;
        continue;
      }

      codeLines++;

      // 1. Secret Leak Detection
      for (const sec of SECRET_PATTERNS) {
        if (sec.regex.test(rawLine)) {
          secretLeaksFound++;
          violations.push({
            rule: 'NO_HARDCODED_SECRETS',
            severity: 'CRITICAL',
            line: lineNum,
            message: `Detected probable ${sec.name} hardcoded in source.`,
            snippet: this.maskSecretSnippet(trimmed),
            remediation: sec.remediation,
          });
        }
      }

      // 2. Hollow Test Detection (Test files only)
      if (isTestFile) {
        for (const hollow of HOLLOW_TEST_PATTERNS) {
          if (hollow.regex.test(rawLine)) {
            violations.push({
              rule: 'NO_HOLLOW_TESTS',
              severity: 'HIGH',
              line: lineNum,
              message: `Hollow test pattern detected: ${hollow.name}.`,
              snippet: trimmed,
              remediation: hollow.remediation,
            });
          }
        }
      }

      // 3. Nesting Depth & Cyclomatic Complexity Proxy
      const leadingSpaces = rawLine.search(/\S|$/);
      const depth = Math.floor(leadingSpaces / 2);
      if (depth > maxNestingDepth) {
        maxNestingDepth = depth;
      }
      if (depth >= 6) {
        violations.push({
          rule: 'MAX_NESTING_DEPTH',
          severity: 'MEDIUM',
          line: lineNum,
          message: `Deep nesting detected (depth: ${depth} levels). Exceeds senior engineering limit of 5.`,
          snippet: trimmed,
          remediation: 'Extract nested logic into early returns (guard clauses) or separate helper functions.',
        });
      }

      // 4. Function Count
      if (/\b(?:function\s+\w+|const\s+\w+\s*=\s*(?:async\s*)?\([^)]*\)\s*=>|\b(?:public|private|protected|async)?\s*\w+\s*\([^)]*\)\s*:\s*[a-zA-Z<>]+)/.test(rawLine)) {
        functionCount++;
      }

      // 5. TypeScript Strictness Checks
      if (/\bas\s+any\b|:\s*any\b|<any>/.test(rawLine) && !rawLine.includes('eslint-disable')) {
        violations.push({
          rule: 'NO_EXPLICIT_ANY',
          severity: 'MEDIUM',
          line: lineNum,
          message: "Unsafe 'any' type annotation used without justification.",
          snippet: trimmed,
          remediation: 'Define an explicit interface, generic type parameter, or use `unknown` with type narrowing.',
        });
      }

      // Empty Catch Block
      if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(trimmed)) {
        violations.push({
          rule: 'NO_EMPTY_CATCH',
          severity: 'HIGH',
          line: lineNum,
          message: 'Silent empty catch block detected. Swallows unexpected failures silently.',
          snippet: trimmed,
          remediation: 'Log the error via Logger, rethrow, or record error context explicitly.',
        });
      }

      // 6. Security & Execution Boundaries
      if (/\beval\s*\(/.test(trimmed) || /\bnew\s+Function\s*\(/.test(trimmed)) {
        violations.push({
          rule: 'NO_EVAL',
          severity: 'CRITICAL',
          line: lineNum,
          message: 'Direct dynamic code execution (eval / new Function) is prohibited.',
          snippet: trimmed,
          remediation: 'Replace dynamic evaluation with deterministic parsers or AST evaluation.',
        });
      }

      // Path Traversal in Strings
      if (/(?:\.\.\/){3,}/.test(trimmed)) {
        violations.push({
          rule: 'PATH_TRAVERSAL_RISK',
          severity: 'HIGH',
          line: lineNum,
          message: 'Deep relative path traversal pattern (`../../../`) detected.',
          snippet: trimmed,
          remediation: 'Use configured workspace root or path.resolve with boundary validation.',
        });
      }

      // Collect imports for unused import check
      const importMatch = trimmed.match(/^import\s+(?:\{([^}]+)\}|\*\s+as\s+(\w+)|(\w+))\s+from/);
      if (importMatch) {
        if (importMatch[1]) {
          importMatch[1].split(',').forEach((s) => {
            const sym = s.trim().split(/\s+as\s+/)[0]?.trim();
            if (sym) importedIdentifiers.add(sym);
          });
        } else if (importMatch[2]) {
          importedIdentifiers.add(importMatch[2].trim());
        } else if (importMatch[3]) {
          importedIdentifiers.add(importMatch[3].trim());
        }
      } else {
        // Collect words used in code
        const words = trimmed.match(/[a-zA-Z0-9_$]+/g);
        if (words) {
          words.forEach((w) => usedIdentifiers.add(w));
        }
      }
    }

    // 7. Check for Unused Imports
    for (const imp of importedIdentifiers) {
      if (!usedIdentifiers.has(imp)) {
        violations.push({
          rule: 'NO_UNUSED_IMPORTS',
          severity: 'LOW',
          message: `Unused import detected: '${imp}'.`,
          remediation: `Remove unused import '${imp}' to keep context lean and prevent bundle bloat.`,
        });
      }
    }

    // 8. File Length Check
    if (lines.length > 500 && !fileName.includes('test') && !fileName.includes('spec')) {
      violations.push({
        rule: 'FILE_LENGTH_LIMIT',
        severity: 'MEDIUM',
        message: `File exceeds 500 lines (${lines.length} lines). High context tax.`,
        remediation: 'Decompose module into smaller, single-responsibility files.',
      });
    }

    // Calculate Quality Score (0 to 100)
    let score = 100;
    for (const v of violations) {
      switch (v.severity) {
        case 'CRITICAL':
          score -= 40;
          break;
        case 'HIGH':
          score -= 15;
          break;
        case 'MEDIUM':
          score -= 8;
          break;
        case 'LOW':
          score -= 3;
          break;
        case 'INFO':
          score -= 0;
          break;
      }
    }
    score = Math.max(0, Math.min(100, score));

    // Determine Verdict
    let verdict: 'PASS' | 'WARN' | 'FAIL' = 'PASS';
    if (score < 75 || violations.some((v) => v.severity === 'CRITICAL')) {
      verdict = 'FAIL';
    } else if (score < 90 || violations.some((v) => v.severity === 'HIGH')) {
      verdict = 'WARN';
    }

    const complexityScore = maxNestingDepth * 10 + Math.floor(functionCount * 1.5);

    const metrics: CodeMetrics = {
      totalLines: lines.length,
      codeLines,
      commentLines,
      blankLines,
      functionCount,
      complexityScore,
      secretLeaksFound,
    };

    const summary = this.buildSummary(fileName, score, verdict, violations, metrics);

    return {
      filePath: fileName,
      score,
      verdict,
      violationsCount: violations.length,
      violations,
      metrics,
      summary,
    };
  }

  /**
   * Audits unified git diff string
   */
  public auditDiff(diffText: string): CodeReviewResult {
    const lines = diffText.split('\n');
    const addedCode: string[] = [];

    for (const line of lines) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        addedCode.push(line.slice(1));
      }
    }

    return this.auditCode(addedCode.join('\n'), 'git-diff.patch');
  }

  /**
   * Obfuscates sensitive secrets from logs/snippets
   */
  private maskSecretSnippet(snippet: string): string {
    return snippet.replace(/(['"])(sk-[a-zA-Z0-9_\-]{6})[a-zA-Z0-9_\-]+(['"])/, '$1$2...[REDACTED]$3')
                  .replace(/(AKIA)[0-9A-Z]{12}([0-9A-Z]{4})/, '$1...[REDACTED]...$2');
  }

  /**
   * Generates a readable review summary
   */
  private buildSummary(
    fileName: string,
    score: number,
    verdict: 'PASS' | 'WARN' | 'FAIL',
    violations: ReviewViolation[],
    metrics: CodeMetrics
  ): string {
    const badge = verdict === 'PASS' ? '✓ PASS' : verdict === 'WARN' ? '⚠️ WARN' : '✗ FAIL';
    let text = `${badge} Code Review Quality Audit: ${fileName} (Score: ${score}/100)\n`;
    text += `Lines: ${metrics.totalLines} (${metrics.codeLines} code, ${metrics.commentLines} comments) | Functions: ${metrics.functionCount} | Complexity: ${metrics.complexityScore}\n`;

    if (violations.length === 0) {
      text += 'No violations found. Code adheres to Ponytail senior engineering standards.';
    } else {
      text += `Found ${violations.length} issue(s):\n`;
      for (const v of violations.slice(0, 5)) {
        const lineInfo = v.line ? `[L${v.line}] ` : '';
        text += `  • ${v.severity}: ${lineInfo}${v.message}\n    ↳ Remediation: ${v.remediation}\n`;
      }
      if (violations.length > 5) {
        text += `  ... and ${violations.length - 5} more violation(s).\n`;
      }
    }

    return text.trim();
  }
}
