/**
 * EVA Tool Registry
 * Conforms to EVA_AI_Implementation_Master_Spec Section 8 (Phase 2)
 */

import { ToolContract } from './ToolContract.js';
import { ValidationError } from '../errors/EvaError.js';

export class ToolRegistry {
  private tools: Map<string, ToolContract<any, any>> = new Map();

  public register(tool: ToolContract<any, any>): void {
    if (!tool.name || typeof tool.name !== 'string') {
      throw new ValidationError('Tool name must be a non-empty string');
    }
    if (this.tools.has(tool.name)) {
      throw new ValidationError(`Tool with name '${tool.name}' is already registered`);
    }
    if (!tool.inputSchema || !tool.outputSchema) {
      throw new ValidationError(`Tool '${tool.name}' must provide both input and output schemas`);
    }
    if (!tool.execute || typeof tool.execute !== 'function') {
      throw new ValidationError(`Tool '${tool.name}' must provide an execute function`);
    }
    if (!tool.verify || typeof tool.verify !== 'function') {
      throw new ValidationError(`Tool '${tool.name}' must provide a verify function`);
    }

    this.tools.set(tool.name, tool);
  }

  public get(name: string): ToolContract<any, any> | undefined {
    return this.tools.get(name);
  }

  public has(name: string): boolean {
    return this.tools.has(name);
  }

  public getAll(): ToolContract<any, any>[] {
    return Array.from(this.tools.values());
  }

  public getManifests(): Array<{
    name: string;
    version: string;
    description: string;
    riskLevel: string;
    timeoutMs: number;
  }> {
    return this.getAll().map((t) => ({
      name: t.name,
      version: t.version,
      description: t.description,
      riskLevel: t.riskLevel,
      timeoutMs: t.timeoutMs,
    }));
  }
}

