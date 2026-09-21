/**
 * EVA Role Manager & Claude Prompt Orchestration Engine
 * Conforms to Section 11, 12, 13, 14, 28 of EVA Master Orchestration Spec
 * Manages operational roles and crafts senior-grade technical prompts for Claude Code
 */

import { RoleType } from './types.js';

export interface StrategicPlanOutput {
  title: string;
  businessObjective: string;
  constraints: string[];
  dependencies: string[];
  risks: string[];
  phasedStrategy: Array<{ phase: number; name: string; deliverables: string[] }>;
  milestones: string[];
  successCriteria: string[];
  failureScenarios: string[];
  recommendedApproach: string;
  markdownContent: string;
}

export interface ClaudePromptDetails {
  objective: string;
  context: string;
  architectureNotes?: string;
  relevantFiles?: string[];
  requirements: string[];
  constraints: string[];
  implementationExpectations: string[];
  securityConsiderations: string[];
  testRequirements: string[];
  definitionOfDone: string[];
  fullPrompt: string;
}

export class RoleManager {
  private activeRole: RoleType = 'GENERAL';

  public getRole(): RoleType {
    return this.activeRole;
  }

  public setRole(role: RoleType): void {
    this.activeRole = role;
  }

  /**
   * Detects role switches in user goals
   */
  public detectRoleFromGoal(goal: string): RoleType {
    const lower = goal.toLowerCase();

    if (/\b(?:act as (?:a |the )?planner|as a planner|enter planner mode|plan mode)\b/i.test(lower) || lower.startsWith('plan ')) {
      return 'PLANNER';
    }
    if (/\b(?:act as (?:a |the )?developer|as a developer|act as senior developer|enter dev mode|developer mode)\b/i.test(lower)) {
      return 'SENIOR_DEVELOPER';
    }
    if (/\b(?:act as (?:a )?security engineer|security review|security audit)\b/i.test(lower)) {
      return 'SECURITY_ENGINEER';
    }
    if (/\b(?:act as (?:a )?qa engineer|qa mode|qa review)\b/i.test(lower)) {
      return 'QA_ENGINEER';
    }
    if (/\b(?:act as (?:a )?architect|software architect)\b/i.test(lower)) {
      return 'SOFTWARE_ARCHITECT';
    }

    return this.activeRole;
  }

  /**
   * Section 12: Generates a comprehensive strategic plan when in PLANNER mode
   */
  public generateStrategicPlan(objective: string): StrategicPlanOutput {
    const title = `Strategic Plan: ${objective}`;
    const phasedStrategy = [
      {
        phase: 1,
        name: 'Discovery, Requirements & Risk Assessment',
        deliverables: ['Stakeholder alignment document', 'Technical constraints mapping', 'Dependency graph'],
      },
      {
        phase: 2,
        name: 'Architecture, Prototyping & Interface Contracts',
        deliverables: ['Data schema specifications', 'API/Service interface contracts', 'PoC validation'],
      },
      {
        phase: 3,
        name: 'Incremental Implementation & Automated Testing',
        deliverables: ['Core feature implementation', 'Unit, integration & security test suites', 'Peer reviews'],
      },
      {
        phase: 4,
        name: 'Verification, Staging Deployment & Rollout',
        deliverables: ['Performance benchmarking', 'Canary release', 'Production monitoring & telemetry'],
      },
    ];

    const milestones = [
      'M1: Requirements & Architecture Sign-Off',
      'M2: Core Engine & Automated Tests Passing',
      'M3: Security Audit & Verification Confirmed',
      'M4: Production General Availability',
    ];

    const constraints = [
      'Zero downtime or regression on existing production workflows',
      'Strict local privacy and credential isolation',
      'Resource and latency budgets under 200ms for critical operations',
    ];

    const dependencies = [
      'Environment inspection capabilities on macOS',
      'Tool execution subsystem authorization',
      'Telemetry and audit logging integration',
    ];

    const risks = [
      'Unresolved target ambiguities leading to improper execution',
      'External tool dependency timeouts or rate limits',
      'Inadequate rollback or reversibility mechanisms',
    ];

    const successCriteria = [
      '100% automated verification of completed milestones',
      'Zero unverified action reports',
      'Graceful diagnostic recovery on tool failures',
    ];

    const failureScenarios = [
      'Subsystem failure during execution -> Triggers automated diagnostic rollback and user alert',
      'Rate-limiting by downstream AI model -> Provides clean countdown and offline fallback',
    ];

    const recommendedApproach =
      'Adopt a phased, observation-driven execution pipeline. Complete Phase 1 discovery and obtain explicit user authorization before initiating any state-mutating actions.';

    const markdownContent = `# ${title}

## 1. Business Objective
${objective}

## 2. Constraints & Dependencies
### Constraints
${constraints.map((c) => `- ${c}`).join('\n')}

### Dependencies
${dependencies.map((d) => `- ${d}`).join('\n')}

## 3. Risk Assessment & Mitigations
${risks.map((r) => `- ⚠️ ${r}`).join('\n')}

## 4. Phased Implementation Roadmap
${phasedStrategy
  .map(
    (p) => `### Phase ${p.phase}: ${p.name}
${p.deliverables.map((d) => `  - [ ] ${d}`).join('\n')}`
  )
  .join('\n\n')}

## 5. Key Milestones
${milestones.map((m) => `- 🎯 ${m}`).join('\n')}

## 6. Success Criteria & Definition of Done
${successCriteria.map((s) => `- ✅ ${s}`).join('\n')}

## 7. Failure Scenarios & Recovery Strategies
${failureScenarios.map((f) => `- 🛡️ ${f}`).join('\n')}

## 8. Strategic Recommendation
${recommendedApproach}
`;

    return {
      title,
      businessObjective: objective,
      constraints,
      dependencies,
      risks,
      phasedStrategy,
      milestones,
      successCriteria,
      failureScenarios,
      recommendedApproach,
      markdownContent,
    };
  }

  /**
   * Section 14: Crafts a comprehensive, senior-grade prompt for Claude Code
   */
  public engineerClaudePrompt(options: {
    objective: string;
    projectPath?: string;
    relevantFiles?: string[];
    context?: string;
  }): ClaudePromptDetails {
    const objective = options.objective;
    const context = options.context || `Working in project repository at ${options.projectPath || 'current workspace'}.`;
    const relevantFiles = options.relevantFiles || ['src/', 'package.json'];

    const requirements = [
      `Accurately fulfill the user's technical goal: "${objective}".`,
      'Follow the existing codebase architectural patterns and TypeScript idioms.',
      'Maintain docstrings, explicit types, and clean error handling.',
    ];

    const constraints = [
      'Do NOT delete or break existing functionality; preserve 100% test pass rate.',
      'Do NOT hardcode environment-specific credentials, tokens, or absolute user home paths.',
      'Operate within standard permissions and follow least privilege principles.',
    ];

    const implementationExpectations = [
      'Inspect relevant files thoroughly before writing any modifications.',
      'Make modular, single-responsibility changes with clean interfaces.',
      'Handle edge cases including missing inputs, timeouts, and process failures.',
    ];

    const securityConsiderations = [
      'Sanitize all user inputs before executing shell commands or filesystem operations.',
      'Prevent command injection, path traversal, and unauthorized network calls.',
    ];

    const testRequirements = [
      'Add or update automated unit and integration tests covering the new behavior.',
      'Verify that all tests pass cleanly via npm test before concluding.',
    ];

    const definitionOfDone = [
      'Clean TypeScript build with zero compilation errors.',
      'All unit and integration tests passing with 100% success rate.',
      'Verified runtime execution confirms actual system transition.',
    ];

    const fullPrompt = `You are acting as a Senior Software Engineer collaborating on this codebase.

## Objective
${objective}

## Context & Environment
${context}
${options.projectPath ? `Repository Path: ${options.projectPath}` : ''}

## Relevant Files & Areas
${relevantFiles.map((f) => `- ${f}`).join('\n')}

## Core Requirements
${requirements.map((r) => `- ${r}`).join('\n')}

## Technical Constraints
${constraints.map((c) => `- ${c}`).join('\n')}

## Implementation Expectations
${implementationExpectations.map((e) => `- ${e}`).join('\n')}

## Security Requirements
${securityConsiderations.map((s) => `- 🔒 ${s}`).join('\n')}

## Testing Requirements
${testRequirements.map((t) => `- 🧪 ${t}`).join('\n')}

## Definition of Done
${definitionOfDone.map((d) => `- ✅ ${d}`).join('\n')}

Please review the existing code, implement the solution cleanly, run the tests, and provide a clear summary of changes.`;

    return {
      objective,
      context,
      relevantFiles,
      requirements,
      constraints,
      implementationExpectations,
      securityConsiderations,
      testRequirements,
      definitionOfDone,
      fullPrompt,
    };
  }
}
