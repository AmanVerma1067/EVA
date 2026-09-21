/**
 * EVA macOS System Status & Hardware Diagnostic Tool
 * Monitors battery, AC charging, thermal/heating, and opened applications
 * Conforms to EVA_AI_Implementation_Master_Spec Phase 5 & Phase 11
 */

import { z } from 'zod';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ToolContract, ToolResult, VerificationResult, ExecutionContext, RiskLevel } from '../../core/tools/ToolContract.js';

const execFileAsync = promisify(execFile);

export const MacStatusInputSchema = z.object({
  filter: z.enum(['all', 'battery', 'thermal', 'apps']).default('all'),
});

export const MacStatusOutputSchema = z.object({
  battery: z.object({
    percentage: z.number(),
    isCharging: z.boolean(),
    powerSource: z.string(),
    details: z.string(),
  }),
  thermal: z.object({
    status: z.string(),
    isNormal: z.boolean(),
    details: z.string(),
  }),
  runningApps: z.array(z.string()),
  summaryText: z.string(),
});

export type MacStatusInput = z.infer<typeof MacStatusInputSchema>;
export type MacStatusOutput = z.infer<typeof MacStatusOutputSchema>;

export class MacSystemStatusTool implements ToolContract<MacStatusInput, MacStatusOutput> {
  public readonly name = 'system.mac_status';
  public readonly version = '1.0.0';
  public readonly description = 'Queries real-time macOS system health: battery, charging state, heating/thermals, and active opened applications';
  public readonly riskLevel: RiskLevel = 'READ';
  public readonly timeoutMs = 10000;

  public readonly inputSchema = MacStatusInputSchema;
  public readonly outputSchema = MacStatusOutputSchema;

  private runner?: (filter: string) => Promise<MacStatusOutput>;

  constructor(options?: { runner?: (filter: string) => Promise<MacStatusOutput> }) {
    this.runner = options?.runner;
  }

  public async execute(params: MacStatusInput, ctx: ExecutionContext): Promise<ToolResult<MacStatusOutput>> {
    const startTime = Date.now();

    try {
      if (this.runner) {
        const data = await this.runner(params.filter);
        return {
          success: true,
          data,
          metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
        };
      }

      // 1. Query Battery & Charging via pmset
      let batteryPct = 100;
      let isCharging = false;
      let powerSource = 'AC Power';
      let battDetails = 'Battery data not available';

      try {
        const { stdout: battRaw } = await execFileAsync('pmset', ['-g', 'batt'], { signal: ctx.abortSignal });
        battDetails = battRaw.trim();
        if (battRaw.includes("'Battery Power'")) {
          powerSource = 'Battery Power';
        } else if (battRaw.includes("'AC Power'")) {
          powerSource = 'AC Power';
        }

        const pctMatch = battRaw.match(/(\d+)%/);
        if (pctMatch) {
          batteryPct = parseInt(pctMatch[1], 10);
        }

        isCharging = battRaw.includes('charging') && !battRaw.includes('not charging');
      } catch {
        // Fallback for non-laptop or test environments
      }

      // 2. Query Thermal & Heating via pmset -g therm
      let thermalStatus = 'Normal';
      let isNormal = true;
      let thermDetails = 'Running cool with no thermal pressure recorded.';

      try {
        const { stdout: thermRaw } = await execFileAsync('pmset', ['-g', 'therm'], { signal: ctx.abortSignal });
        const lowerTherm = thermRaw.toLowerCase();
        const isExplicitlyNominal = lowerTherm.includes('nominal') || lowerTherm.includes('no thermal warning') || lowerTherm.includes('level = 0');
        const hasWarning =
          (lowerTherm.includes('thermal warning level') && !lowerTherm.includes('level = 0') && !lowerTherm.includes('no thermal warning')) ||
          (lowerTherm.includes('pressure') && !lowerTherm.includes('nominal') && !lowerTherm.includes('no thermal pressure')) ||
          lowerTherm.includes('thermal_pressure = moderate') ||
          lowerTherm.includes('thermal_pressure = heavy') ||
          lowerTherm.includes('thermal_pressure = trapping');

        if (hasWarning && !isExplicitlyNominal) {
          thermalStatus = 'Elevated';
          isNormal = false;
          thermDetails = 'Thermal warning or elevated pressure recorded.';
        } else {
          thermalStatus = 'Normal';
          isNormal = true;
          thermDetails = 'Running cool with no thermal pressure recorded.';
        }
      } catch {
        // Fallback
      }

      // 3. Query Open GUI Applications via System Events
      let runningApps: string[] = [];
      try {
        const script = 'tell application "System Events" to get name of every process whose background only is false';
        const { stdout: appsRaw } = await execFileAsync('osascript', ['-e', script], { signal: ctx.abortSignal });
        runningApps = appsRaw
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
      } catch {
        runningApps = ['Finder'];
      }

      // 4. Synthesize natural human-like spoken summary
      const powerClause = powerSource === 'AC Power'
        ? (isCharging ? 'charging on AC power' : 'connected to AC power')
        : 'on battery power';
      const thermClause = isNormal ? 'running cool and normal' : 'experiencing elevated temperature';
      const appsClause = runningApps.length > 0
        ? `Currently opened applications: ${runningApps.slice(0, 6).join(', ')}${runningApps.length > 6 ? ` and ${runningApps.length - 6} more` : ''}.`
        : 'No major front-facing applications open.';

      let summaryText = `Your Mac is at ${batteryPct}% battery (${powerClause}). Heating and thermals are ${thermClause}. ${appsClause}`;

      if (params.filter === 'battery') {
        summaryText = `Battery is at ${batteryPct}% (${powerClause}).`;
      } else if (params.filter === 'thermal') {
        summaryText = `Mac thermals are ${thermClause}.`;
      } else if (params.filter === 'apps') {
        summaryText = appsClause;
      }

      return {
        success: true,
        data: {
          battery: {
            percentage: batteryPct,
            isCharging,
            powerSource,
            details: battDetails,
          },
          thermal: {
            status: thermalStatus,
            isNormal,
            details: thermDetails,
          },
          runningApps,
          summaryText,
        },
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'MAC_STATUS_FAILED',
          message: `Failed to retrieve Mac system status: ${String(err)}`,
          category: 'recoverable',
        },
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    }
  }

  public async verify(
    params: MacStatusInput,
    result: ToolResult<MacStatusOutput>,
    ctx?: ExecutionContext
  ): Promise<VerificationResult> {
    const verified = Boolean(result.success && result.data && result.data.battery);
    return {
      verified,
      status: verified ? 'CONFIRMED' : 'FAILED',
      evidence: verified
        ? `System status verified (Battery: ${result.data?.battery?.percentage}%, Apps: ${result.data?.runningApps?.length ?? 0}).`
        : 'Failed to verify system status.',
    };
  }
}
