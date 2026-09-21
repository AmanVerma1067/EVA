/**
 * EVA Observation Engine
 * Conforms to Section 21 of EVA Master Orchestration Spec
 * Collects runtime evidence, exit codes, output streams, and system indicators
 * after each execution step to evaluate the real post-action state.
 */

import { PlanStep, StepExecutionObservation } from './types.js';
import { ToolDispatchOutput } from '../tools/ToolRouter.js';

export class ObservationEngine {
  /**
   * Observes and analyzes the result of an executed step
   */
  public observe(
    stepIndex: number,
    step: PlanStep,
    output: ToolDispatchOutput
  ): StepExecutionObservation {
    const isSuccessful = output.success && (!output.verification || output.verification.status !== 'FAILED');
    let needsRecovery = !output.success;

    let summary = '';
    if (output.success) {
      if (output.verification?.status === 'CONFIRMED') {
        summary = `Step ${stepIndex + 1} (${step.toolName}) executed successfully and confirmed by system verification.`;
      } else {
        summary = `Step ${stepIndex + 1} (${step.toolName}) completed successfully.`;
      }
    } else {
      const errMsg = output.error?.message || 'Tool returned failure status';
      summary = `Step ${stepIndex + 1} (${step.toolName}) failed: ${errMsg}`;
      needsRecovery = true;
    }

    return {
      stepIndex,
      step,
      output,
      observationSummary: summary,
      isSuccessful,
      needsRecovery,
    };
  }
}

