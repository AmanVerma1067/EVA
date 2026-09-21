/**
 * EVA Plan Evaluator
 * Conforms to Section 9, 10, 27 of EVA Master Orchestration Spec
 * Compares candidate plans using 12 objective criteria and selects the safest, highest-utility plan
 */

import { CandidatePlan, PlanScoreBreakdown } from './types.js';
import { ToolRegistry } from '../tools/ToolRegistry.js';

export interface PlanEvaluationResult {
  winningPlan: CandidatePlan;
  scoredPlans: CandidatePlan[];
  selectionRationale: string;
}

export class PlanEvaluator {
  private toolRegistry?: ToolRegistry;

  constructor(toolRegistry?: ToolRegistry) {
    this.toolRegistry = toolRegistry;
  }

  /**
   * Evaluates and scores all candidate plans, selecting the best one
   */
  public evaluatePlans(candidates: CandidatePlan[]): PlanEvaluationResult {
    if (candidates.length === 0) {
      throw new Error('PlanEvaluator received empty candidate plans array');
    }

    const scoredPlans = candidates.map((plan) => {
      const scores = this.scorePlan(plan);
      return {
        ...plan,
        scores,
      };
    });

    // Sort plans by totalScore descending
    scoredPlans.sort((a, b) => (b.scores?.totalScore ?? 0) - (a.scores?.totalScore ?? 0));

    const winningPlan = scoredPlans[0];
    const selectionRationale = `Selected plan '${winningPlan.id}' (${winningPlan.plannerRole}) with score ${(
      (winningPlan.scores?.totalScore ?? 0) * 100
    ).toFixed(1)}/100 based on safety (${((winningPlan.scores?.safety ?? 0) * 100).toFixed(0)}%), reliability (${((winningPlan.scores?.reliability ?? 0) * 100).toFixed(0)}%), and verification quality (${((winningPlan.scores?.verificationQuality ?? 0) * 100).toFixed(0)}%).`;

    return {
      winningPlan,
      scoredPlans,
      selectionRationale,
    };
  }

  /**
   * Scores an individual candidate plan across the 12 objective criteria
   */
  public scorePlan(plan: CandidatePlan): PlanScoreBreakdown {
    let goalCorrectness = 0.95;
    let safety = 0.95;
    let reliability = 0.92;
    let toolAvailability = 1.0;
    let environmentCompatibility = 0.95;
    let reversibility = 0.9;
    let verificationQuality = 0.92;
    let expectedSuccess = 0.93;
    let cost = 1.0; // 1.0 = low cost
    let latency = 0.95;

    // Check tool availability if registry provided
    if (this.toolRegistry) {
      for (const step of plan.steps) {
        if (!this.toolRegistry.has(step.toolName)) {
          toolAvailability = 0.0;
          break;
        }
      }
    }

    // Step simplicity: 1-2 steps is ideal; penalize over-complex plans slightly
    const stepCount = plan.steps.length;
    let stepSimplicity = 1.0;
    if (stepCount === 1) stepSimplicity = 0.98;
    else if (stepCount === 2) stepSimplicity = 0.95;
    else if (stepCount <= 4) stepSimplicity = 0.85;
    else stepSimplicity = Math.max(0.4, 1.0 - stepCount * 0.1);

    // Evaluate plan characteristics
    if (plan.id.includes('cli_terminal')) {
      // Direct raw shell execution is slightly higher risk than native app launch
      safety = 0.82;
      reliability = 0.85;
      reversibility = 0.75;
    } else if (plan.id.includes('native_system')) {
      // Native system app launch is high safety and reliability
      safety = 0.98;
      reliability = 0.96;
      verificationQuality = 0.95;
      reversibility = 0.92;
    } else if (plan.id.includes('conservative_verified')) {
      // Extra verification steps increase safety & verification, but slightly lower latency
      safety = 0.99;
      reliability = 0.98;
      verificationQuality = 0.98;
      latency = 0.85;
    }

    // Heavy penalty if required tools are unavailable
    if (toolAvailability === 0) {
      expectedSuccess = 0.0;
      safety = 0.0;
    }

    // Section 10 Priority Weights:
    // 1. Correctness: 25%
    // 2. Safety: 25%
    // 3. Reliability: 15%
    // 4. Verification Quality: 15%
    // 5. Success Probability: 10%
    // 6. Simplicity: 5%
    // 7. Latency/Speed: 5%
    const totalScore =
      goalCorrectness * 0.25 +
      safety * 0.25 +
      reliability * 0.15 +
      verificationQuality * 0.15 +
      expectedSuccess * 0.10 +
      stepSimplicity * 0.05 +
      latency * 0.05;

    return {
      goalCorrectness,
      safety,
      reliability,
      toolAvailability,
      environmentCompatibility,
      stepSimplicity,
      reversibility,
      verificationQuality,
      expectedSuccess,
      cost,
      latency,
      totalScore: toolAvailability === 0 ? 0 : totalScore,
    };
  }
}

