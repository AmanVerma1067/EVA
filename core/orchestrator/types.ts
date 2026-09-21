/**
 * EVA Orchestrator Type Definitions
 * Unifies types across all 15 pipeline components
 */

import { ToolDispatchOutput } from '../tools/ToolRouter.js';
import { VerificationResult } from '../tools/ToolContract.js';

export type RoleType =
  | 'GENERAL'
  | 'PLANNER'
  | 'SOFTWARE_ARCHITECT'
  | 'SENIOR_DEVELOPER'
  | 'CODE_REVIEWER'
  | 'DEVOPS_ENGINEER'
  | 'SECURITY_ENGINEER'
  | 'RESEARCHER'
  | 'PROJECT_MANAGER'
  | 'PRODUCT_MANAGER'
  | 'BUSINESS_STRATEGIST'
  | 'QA_ENGINEER'
  | 'SYSTEM_ADMIN';

export type IntentType =
  | 'OPEN_APPLICATION'
  | 'CLOSE_APPLICATION'
  | 'CHECK_APPLICATION_STATUS'
  | 'OPEN_PROJECT_IN_EDITOR'
  | 'RUN_DEVELOPER_TASK'
  | 'REVIEW_CODEBASE'
  | 'SYSTEM_HEALTH_DIAGNOSTICS'
  | 'COMMUNICATION_CALL'
  | 'COMMUNICATION_MESSAGE'
  | 'WEB_SEARCH_OR_NAVIGATE'
  | 'MEDIA_PLAYBACK'
  | 'STRATEGIC_PLANNING'
  | 'CONVERSATIONAL_GREETING'
  | 'SYSTEM_CAPABILITY_INQUIRY'
  | 'QUERY_PREVIOUS_RESULT'
  | 'UNKNOWN';

export type EntityType =
  | 'APPLICATION'
  | 'PROJECT'
  | 'DIRECTORY'
  | 'FILE'
  | 'URL'
  | 'CLI_TOOL'
  | 'PERSON'
  | 'MEDIA_QUERY'
  | 'SYSTEM_SUBSYSTEM'
  | 'ANAPHORA'
  | 'UNKNOWN';

export interface NormalizedSpeech {
  rawText: string;
  cleanedText: string;
  strippedFillers: string[];
  strippedQualifiers: string[];
  normalizedTokens: string[];
}

export interface ResolvedIntent {
  intent: IntentType;
  rawTarget: string;
  action: string;
  qualifiers: string[];
  confidence: number;
  metadata?: Record<string, unknown>;
}

export interface ResolvedEntity {
  type: EntityType;
  name: string;
  resolvedPath?: string;
  bundleId?: string;
  processName?: string;
  url?: string;
  confidence: number;
  metadata?: Record<string, unknown>;
}

export type LaunchStrategyType =
  | 'RUNNING_PROCESS_ACTIVATE'
  | 'MACOS_APP_BUNDLE'
  | 'VSCODE_WORKSPACE'
  | 'TERMINAL_CLI'
  | 'BROWSER_NAVIGATE'
  | 'SYSTEM_DIAGNOSTIC'
  | 'COMMUNICATION_DISPATCH'
  | 'NONE';

export interface CapabilityLaunchStrategy {
  type: LaunchStrategyType;
  target: string;
  command?: string;
  args?: string[];
  workingDirectory?: string;
  verificationMethod: string;
  description: string;
}

export interface PlanStep {
  thought: string;
  toolName: string;
  parameters: Record<string, unknown>;
}

export interface PlanScoreBreakdown {
  goalCorrectness: number;
  safety: number;
  reliability: number;
  toolAvailability: number;
  environmentCompatibility: number;
  stepSimplicity: number;
  reversibility: number;
  verificationQuality: number;
  expectedSuccess: number;
  cost: number;
  latency: number;
  totalScore: number;
}

export interface CandidatePlan {
  id: string;
  plannerId: string;
  plannerRole: string;
  description: string;
  steps: PlanStep[];
  scores?: PlanScoreBreakdown;
  rationale?: string;
}

export interface StepExecutionObservation {
  stepIndex: number;
  step: PlanStep;
  output: ToolDispatchOutput;
  observationSummary: string;
  isSuccessful: boolean;
  needsRecovery: boolean;
}

export interface RecoveryAttempt {
  failureReason: string;
  recoveryStrategy: string;
  recoveryPlan: PlanStep[];
  attempted: boolean;
  succeeded?: boolean;
}

export interface OrchestrationResult {
  taskId: string;
  rawInput: string;
  normalizedSpeech: NormalizedSpeech;
  intent: ResolvedIntent;
  entity: ResolvedEntity;
  strategy: CapabilityLaunchStrategy;
  role: RoleType;
  candidatePlans: CandidatePlan[];
  selectedPlan: CandidatePlan;
  executionObservations: StepExecutionObservation[];
  verification: VerificationResult;
  recoveryAttempts: RecoveryAttempt[];
  spokenResponse: string;
  textResponse: string;
  success: boolean;
  metrics: {
    speechToIntentMs: number;
    planningMs: number;
    executionMs: number;
    verificationMs: number;
    totalMs: number;
  };
}

