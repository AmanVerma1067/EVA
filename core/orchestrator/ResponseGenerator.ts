/**
 * EVA Response Generator
 * Conforms to Section 25 of EVA Master Orchestration Spec
 * Formulates concise, ear-friendly spoken TTS responses and structured rich text responses
 */

import {
  ResolvedIntent,
  ResolvedEntity,
  CandidatePlan,
  StepExecutionObservation,
  RecoveryAttempt,
  RoleType,
} from './types.js';
import { VerificationResult } from '../tools/ToolContract.js';

export class ResponseGenerator {
  public generate(options: {
    intent: ResolvedIntent;
    entity: ResolvedEntity;
    role: RoleType;
    plan: CandidatePlan;
    observations: StepExecutionObservation[];
    verification: VerificationResult;
    recoveryAttempts: RecoveryAttempt[];
    success: boolean;
    durationMs: number;
  }): { spoken: string; text: string } {
    const {
      intent,
      entity,
      role,
      plan,
      observations,
      verification,
      recoveryAttempts,
      success,
      durationMs,
    } = options;

    // 1. Determine spoken summary
    let spoken = '';
    if (success) {
      if (intent.intent === 'OPEN_APPLICATION') {
        spoken = `${entity.name} is now open and active.`;
      } else if (intent.intent === 'OPEN_PROJECT_IN_EDITOR') {
        spoken = `Opened project ${entity.name} in Visual Studio Code.`;
      } else if (intent.intent === 'CLOSE_APPLICATION') {
        spoken = `Closed ${entity.name}.`;
      } else if (intent.intent === 'COMMUNICATION_CALL') {
        spoken = `Starting WhatsApp call to ${entity.name}.`;
      } else if (intent.intent === 'WEB_SEARCH_OR_NAVIGATE') {
        spoken = `Opened ${entity.name} in your browser.`;
      } else if (intent.intent === 'MEDIA_PLAYBACK') {
        spoken = `Playing ${entity.name} on YouTube.`;
      } else if (intent.intent === 'SYSTEM_HEALTH_DIAGNOSTICS') {
        spoken = 'Your Mac is running smoothly. System health metrics are displayed.';
      } else if (intent.intent === 'REVIEW_CODEBASE') {
        spoken = 'Claude Code completed the architectural code review.';
      } else {
        spoken = `Completed task successfully in ${(durationMs / 1000).toFixed(1)} seconds.`;
      }
    } else {
      // Failure messaging conforms to Section 25:
      // What failed, why it failed, what was attempted, what was verified
      const lastObs = observations[observations.length - 1];
      const errorDetail = lastObs?.output.error?.message || 'Operation failed verification.';
      if (recoveryAttempts.length > 0 && recoveryAttempts.some((r) => r.attempted)) {
        spoken = `Unable to launch ${entity.name} after trying recovery strategies. ${errorDetail}`;
      } else {
        spoken = `Could not complete action for ${entity.name}. ${errorDetail}`;
      }
    }

    // 2. Determine rich markdown text summary
    const statusBadge = success ? '✅ SUCCESS (CONFIRMED)' : '❌ FAILED';
    const roleBadge = `[ROLE: ${role}]`;

    let text = `### EVA Execution Summary ${roleBadge}\n\n`;
    text += `**Status**: ${statusBadge} | **Duration**: ${durationMs}ms\n`;
    text += `**Intent**: \`${intent.intent}\` | **Target**: \`${entity.name}\` (${entity.type})\n\n`;

    text += `#### Planned Strategy (\`${plan.id}\`)\n`;
    text += `${plan.description}\n\n`;

    text += `#### Execution Steps & Observations\n`;
    for (const obs of observations) {
      const stepStatus = obs.isSuccessful ? '✓' : '✗';
      text += `- **Step ${obs.stepIndex + 1}** [${obs.step.toolName}]: ${stepStatus} ${obs.observationSummary}\n`;
    }

    if (recoveryAttempts.length > 0) {
      text += `\n#### Diagnostic Recovery\n`;
      for (const rec of recoveryAttempts) {
        text += `- 🛡️ **Reason**: ${rec.failureReason}\n  **Recovery Plan**: ${rec.recoveryStrategy} (${rec.succeeded ? 'Recovered' : 'Unresolved'})\n`;
      }
    }

    text += `\n#### Verification\n`;
    text += `**State**: \`${verification.status}\` — ${verification.evidence}\n`;

    return {
      spoken,
      text,
    };
  }
}

