/**
 * EVA AI Router & Degradation Manager
 * Conforms to Section 12, 14, 37 of EVA Product Architecture, Distribution & Launch Spec
 * Dynamically selects AI models based on task type, complexity, privacy, latency, and availability.
 * Manages connection modes (ONLINE, DEGRADED, OFFLINE) and ensures local capabilities remain active.
 */

import {
  ModelRegistry,
  ModelMetadata,
  ModelCategory,
  ProviderName,
  AvailabilityStatus,
} from './ModelRegistry.js';

export type ConnectionMode = 'ONLINE' | 'DEGRADED' | 'OFFLINE';

export type ReasoningComplexity = 'low' | 'medium' | 'high';
export type PrivacyRequirement = 'local' | 'enterprise' | 'cloud';

export interface RouteRequest {
  taskType: 'interaction' | 'planning' | 'coding' | 'vision' | 'sensitive' | 'agent' | 'general';
  capabilities?: Array<'chat' | 'streaming' | 'tool_calling' | 'vision' | 'embeddings'>;
  complexity?: ReasoningComplexity;
  privacy?: PrivacyRequirement;
  contextTokens?: number;
  maxLatency?: 'low' | 'medium' | 'high';
  maxCost?: 'free' | 'low' | 'medium' | 'high';
  preferredModelId?: string;
  requireVerification?: boolean;
}

export interface RouteDecision {
  selectedModel?: ModelMetadata;
  category: ModelCategory;
  connectionMode: ConnectionMode;
  isLocal: boolean;
  reason: string;
  fallbackModel?: ModelMetadata;
  alternativeModels: ModelMetadata[];
}

export class AIRouter {
  private registry: ModelRegistry;
  private connectionMode: ConnectionMode = 'ONLINE';
  private providerAvailability: Map<ProviderName, boolean> = new Map();

  constructor(registry?: ModelRegistry) {
    this.registry = registry ?? new ModelRegistry();
    // Default all providers to available
    this.providerAvailability.set('anthropic', true);
    this.providerAvailability.set('openai', true);
    this.providerAvailability.set('google', true);
    this.providerAvailability.set('ollama', true);
    this.providerAvailability.set('local', true);
    this.evaluateConnectionMode();
  }

  public getConnectionMode(): ConnectionMode {
    return this.connectionMode;
  }

  public setConnectionMode(mode: ConnectionMode): void {
    this.connectionMode = mode;
  }

  public setProviderAvailability(provider: ProviderName, available: boolean): void {
    this.providerAvailability.set(provider, available);
    this.evaluateConnectionMode();
  }

  public getRegistry(): ModelRegistry {
    return this.registry;
  }

  private evaluateConnectionMode(): void {
    const cloudAvailable =
      (this.providerAvailability.get('anthropic') ?? false) ||
      (this.providerAvailability.get('openai') ?? false) ||
      (this.providerAvailability.get('google') ?? false);

    const localAvailable =
      (this.providerAvailability.get('local') ?? true) ||
      (this.providerAvailability.get('ollama') ?? false);

    if (cloudAvailable) {
      // Check if any cloud model is degraded/rate-limited
      const cloudModels = this.registry.getAll().filter((m) => m.privacyClass !== 'local');
      const hasRateLimited = cloudModels.some((m) => m.availability === 'RATE_LIMITED');
      this.connectionMode = hasRateLimited ? 'DEGRADED' : 'ONLINE';
    } else if (localAvailable) {
      this.connectionMode = 'OFFLINE';
    } else {
      this.connectionMode = 'OFFLINE';
    }
  }

  /**
   * Selects the optimal model for a given task request based on Section 12 criteria.
   */
  public route(request: RouteRequest): RouteDecision {
    const allModels = this.registry.getAll();

    // 1. In OFFLINE mode, filter strictly to local providers
    let candidateModels = allModels;
    if (this.connectionMode === 'OFFLINE' || request.privacy === 'local' || request.taskType === 'sensitive') {
      candidateModels = candidateModels.filter(
        (m) => m.privacyClass === 'local' || m.provider === 'local' || m.provider === 'ollama'
      );
    } else {
      // Filter out providers marked as unavailable
      candidateModels = candidateModels.filter((m) => {
        const providerOk = this.providerAvailability.get(m.provider) ?? true;
        const statusOk = m.availability !== 'UNAVAILABLE';
        return providerOk && statusOk;
      });
    }

    // 2. Filter by required capabilities
    if (request.capabilities && request.capabilities.length > 0) {
      candidateModels = candidateModels.filter((m) =>
        request.capabilities!.every((cap) => m.capabilities.includes(cap))
      );
    }

    // 3. Filter by context size if requested
    if (request.contextTokens) {
      candidateModels = candidateModels.filter((m) => m.contextWindowTokens >= request.contextTokens!);
    }

    // 4. Handle preferred model
    if (request.preferredModelId) {
      const preferred = candidateModels.find((m) => m.id === request.preferredModelId);
      if (preferred && preferred.availability === 'AVAILABLE') {
        return {
          selectedModel: preferred,
          category: preferred.category,
          connectionMode: this.connectionMode,
          isLocal: preferred.privacyClass === 'local',
          reason: `User explicitly requested model '${preferred.id}'`,
          alternativeModels: candidateModels.filter((m) => m.id !== preferred.id),
        };
      }
    }

    // 5. Determine target category from task type and complexity
    const targetCategory = this.determineCategory(request);

    // Filter by category or related categories
    let matchingModels = candidateModels.filter((m) => m.category === targetCategory);

    // If no exact match in target category (e.g. offline and no local coding agent), fallback to available local model
    if (matchingModels.length === 0) {
      matchingModels = candidateModels;
    }

    // Prioritize AVAILABLE over RATE_LIMITED
    const availableMatching = matchingModels.filter((m) => m.availability === 'AVAILABLE');
    let pool: ModelMetadata[];
    if (availableMatching.length > 0) {
      pool = availableMatching;
    } else {
      const availableAny = candidateModels.filter((m) => m.availability === 'AVAILABLE');
      pool = availableAny.length > 0 ? availableAny : matchingModels;
    }

    // Sort by suitability score
    const scored = pool.map((model) => ({
      model,
      score: this.scoreModel(model, request, targetCategory),
    }));
    scored.sort((a, b) => b.score - a.score);

    const selected = scored.length > 0 ? scored[0].model : undefined;
    const fallback = scored.length > 1 ? scored[1].model : undefined;

    const isLocal = selected ? selected.privacyClass === 'local' : false;

    let reason: string;
    if (!selected) {
      reason =
        this.connectionMode === 'OFFLINE'
          ? 'Offline mode active: No suitable local model found with required capabilities. Cloud AI is unreachable.'
          : 'No available model matched the required capabilities and constraints.';
    } else if (this.connectionMode === 'OFFLINE') {
      reason = `Offline mode: routing to local model '${selected.id}' (${selected.provider}).`;
    } else if (selected.category === targetCategory) {
      reason = `Selected '${selected.id}' as optimal match for category '${targetCategory}' (complexity: ${request.complexity ?? 'medium'}).`;
    } else {
      reason = `Fallback: '${selected.id}' selected because preferred category '${targetCategory}' had no active candidates.`;
    }

    return {
      selectedModel: selected,
      category: selected ? selected.category : targetCategory,
      connectionMode: this.connectionMode,
      isLocal,
      reason,
      fallbackModel: fallback,
      alternativeModels: scored.slice(1).map((s) => s.model),
    };
  }

  private determineCategory(request: RouteRequest): ModelCategory {
    if (request.taskType === 'vision') return 'vision';
    if (request.taskType === 'coding') return 'coding';
    if (request.taskType === 'agent') return 'agent';
    if (request.taskType === 'sensitive' || request.privacy === 'local') return 'local';

    if (request.taskType === 'planning') {
      return request.complexity === 'low' ? 'fast' : 'reasoning';
    }

    if (request.taskType === 'interaction') {
      return request.complexity === 'high' ? 'reasoning' : 'fast';
    }

    if (request.complexity === 'high') return 'reasoning';
    return 'fast';
  }

  private scoreModel(
    model: ModelMetadata,
    request: RouteRequest,
    targetCategory: ModelCategory
  ): number {
    let score = 0;

    // Category match bonus
    if (model.category === targetCategory) score += 50;

    // Availability
    if (model.availability === 'AVAILABLE') score += 30;
    if (model.availability === 'RATE_LIMITED') score -= 50;

    // Complexity preference
    if (request.complexity === 'high') {
      if (model.category === 'reasoning') score += 25;
      if (model.category === 'fast') score -= 10;
    } else if (request.complexity === 'low') {
      if (model.latencyClass === 'low') score += 20;
      if (model.costClass === 'free' || model.costClass === 'low') score += 15;
    }

    // Privacy preference
    if (request.privacy === 'local') {
      if (model.privacyClass === 'local') score += 40;
      else score -= 100;
    }

    // Latency preference
    if (request.maxLatency === 'low') {
      if (model.latencyClass === 'low') score += 20;
      else if (model.latencyClass === 'high') score -= 20;
    }

    // Cost preference
    if (request.maxCost === 'free' && model.costClass !== 'free') {
      score -= 30;
    }

    return score;
  }

  /**
   * Conforms to Section 36: Exposes provider, model, and reason for observability.
   */
  public explainRouting(decision: RouteDecision): string {
    if (!decision.selectedModel) {
      return `[AI Router: ${decision.connectionMode}] No model available. Reason: ${decision.reason}`;
    }
    return (
      `[AI Router: ${decision.connectionMode}] Provider: ${decision.selectedModel.provider} | ` +
      `Model: ${decision.selectedModel.id} | Local: ${decision.isLocal} | Reason: ${decision.reason}`
    );
  }
}
