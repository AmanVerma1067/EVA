/**
 * EVA Execution Engine
 * Conforms to Section 21, 22, 23 of EVA Master Orchestration Spec
 * Manages observation-driven, step-by-step tool execution, verification, and recovery.
 */

import {
  CandidatePlan,
  PlanStep,
  StepExecutionObservation,
  RecoveryAttempt,
} from './types.js';
import { ToolRouter, ToolDispatchOutput } from '../tools/ToolRouter.js';
import { TaskLifecycleTracker } from './TaskStatus.js';
import { ObservationEngine } from './ObservationEngine.js';
import { VerificationEngine } from './VerificationEngine.js';
import { RecoveryEngine } from './RecoveryEngine.js';
import { VerificationResult } from '../tools/ToolContract.js';

export interface ExecutionResult {
  success: boolean;
  observations: StepExecutionObservation[];
  verification: VerificationResult;
  recoveryAttempts: RecoveryAttempt[];
}

export class ExecutionEngine {
  private router: ToolRouter;
  private observationEngine: ObservationEngine;
  private verificationEngine: VerificationEngine;
  private recoveryEngine: RecoveryEngine;

  constructor(options: {
    router: ToolRouter;
    observationEngine: ObservationEngine;
    verificationEngine: VerificationEngine;
    recoveryEngine: RecoveryEngine;
  }) {
    this.router = options.router;
    this.observationEngine = options.observationEngine;
    this.verificationEngine = options.verificationEngine;
    this.recoveryEngine = options.recoveryEngine;
  }

  public async executePlan(options: {
    plan: CandidatePlan;
    tracker: TaskLifecycleTracker;
    sessionId: string;
    deviceId: string;
    taskId: string;
  }): Promise<ExecutionResult> {
    const { plan, tracker, sessionId, deviceId, taskId } = options;
    const observations: StepExecutionObservation[] = [];
    const recoveryAttempts: RecoveryAttempt[] = [];
    let overallSuccess = true;

    tracker.transition('EXECUTING', `Executing plan '${plan.id}' with ${plan.steps.length} step(s)`);

    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      const dispatchOutput = await this.router.dispatch({
        toolName: step.toolName,
        parameters: step.parameters,
        sessionId,
        deviceId,
        taskId,
      });

      tracker.transition('OBSERVING', `Observing outcome of step ${i + 1} (${step.toolName})`);
      const obs = this.observationEngine.observe(i, step, dispatchOutput);
      observations.push(obs);

      if (!obs.isSuccessful) {
        // Trigger recovery
        tracker.transition('RECOVERING', `Diagnosing failure for step ${i + 1} (${step.toolName})`);
        const recovery = await this.recoveryEngine.diagnoseAndRecover(step, dispatchOutput);

        if (recovery && recovery.recoveryPlan.length > 0) {
          recovery.attempted = true;
          recoveryAttempts.push(recovery);

          let recoverySuccess = true;
          for (let rIdx = 0; rIdx < recovery.recoveryPlan.length; rIdx++) {
            const rStep = recovery.recoveryPlan[rIdx];
            const rOutput = await this.router.dispatch({
              toolName: rStep.toolName,
              parameters: rStep.parameters,
              sessionId,
              deviceId,
              taskId,
            });
            const rObs = this.observationEngine.observe(i + rIdx + 1, rStep, rOutput);
            observations.push(rObs);

            if (!rObs.isSuccessful) {
              recoverySuccess = false;
              break;
            }
          }

          recovery.succeeded = recoverySuccess;
          if (!recoverySuccess) {
            overallSuccess = false;
            break;
          }
        } else {
          overallSuccess = false;
          break;
        }
      }
    }

    // Final verification phase
    tracker.transition('VERIFYING', 'Verifying final system state transition');
    const lastStep = plan.steps[plan.steps.length - 1];
    const lastObs = observations[observations.length - 1];

    let verification: VerificationResult = {
      verified: overallSuccess,
      status: overallSuccess ? 'CONFIRMED' : 'FAILED',
      evidence: overallSuccess ? 'All steps confirmed active.' : 'Plan execution failed.',
    };

    if (lastStep && lastObs) {
      verification = await this.verificationEngine.verifyStepOutcome(
        lastStep,
        lastObs.output.data,
        lastObs.output.verification
      );
    }

    const finalSuccess = overallSuccess && verification.verified;
    tracker.transition(
      finalSuccess ? 'COMPLETED' : 'FAILED',
      finalSuccess ? 'Task completed successfully and verified.' : 'Task failed verification.'
    );

    return {
      success: finalSuccess,
      observations,
      verification,
      recoveryAttempts,
    };
  }
}

