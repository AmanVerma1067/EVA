/**
 * EVA AI Model Registry
 * Conforms to Section 11, 14, 15 of EVA Product Architecture, Distribution & Launch Spec
 * Maintains metadata for available AI models and agents across multiple providers.
 * Strictly separates metadata from credentials (API keys are never stored here).
 */

export type ModelCategory = 'fast' | 'reasoning' | 'coding' | 'vision' | 'local' | 'agent';

export type ProviderName = 'anthropic' | 'openai' | 'google' | 'ollama' | 'local';

export type AvailabilityStatus = 'AVAILABLE' | 'RATE_LIMITED' | 'UNAVAILABLE' | 'UNKNOWN';

export interface ModelMetadata {
  id: string;
  name: string;
  provider: ProviderName;
  category: ModelCategory;
  contextWindowTokens: number;
  capabilities: Array<'chat' | 'streaming' | 'tool_calling' | 'vision' | 'embeddings'>;
  costClass: 'free' | 'low' | 'medium' | 'high';
  latencyClass: 'low' | 'medium' | 'high';
  privacyClass: 'local' | 'enterprise' | 'cloud';
  availability: AvailabilityStatus;
  rateLimitResetTime?: number;
  notes?: string;
}

export class ModelRegistry {
  private models: Map<string, ModelMetadata> = new Map();

  constructor() {
    this.registerDefaults();
  }

  private registerDefaults(): void {
    // 1. Coding Agent (Claude Code CLI)
    this.register({
      id: 'claude-code-cli',
      name: 'Claude Code Agent',
      provider: 'anthropic',
      category: 'coding',
      contextWindowTokens: 200000,
      capabilities: ['chat', 'streaming', 'tool_calling'],
      costClass: 'medium',
      latencyClass: 'medium',
      privacyClass: 'cloud',
      availability: 'AVAILABLE',
      notes: 'Integrated local development agent for codebase reviews and task implementation',
    });

    // 2. Fast Model (Claude 3.5 Haiku)
    this.register({
      id: 'claude-3-5-haiku',
      name: 'Claude 3.5 Haiku',
      provider: 'anthropic',
      category: 'fast',
      contextWindowTokens: 200000,
      capabilities: ['chat', 'streaming', 'tool_calling'],
      costClass: 'low',
      latencyClass: 'low',
      privacyClass: 'cloud',
      availability: 'AVAILABLE',
      notes: 'Low-latency dialogue and rapid intent parsing',
    });

    // 3. Reasoning Model (Claude 3.5 Sonnet / Opus)
    this.register({
      id: 'claude-3-5-sonnet',
      name: 'Claude 3.5 Sonnet',
      provider: 'anthropic',
      category: 'reasoning',
      contextWindowTokens: 200000,
      capabilities: ['chat', 'streaming', 'tool_calling', 'vision'],
      costClass: 'medium',
      latencyClass: 'medium',
      privacyClass: 'cloud',
      availability: 'AVAILABLE',
      notes: 'Complex multi-step strategic planning and architecture evaluation',
    });

    // 4. Local Model (Ollama / Llama 3)
    this.register({
      id: 'ollama-llama-3',
      name: 'Ollama Llama 3 (Local)',
      provider: 'ollama',
      category: 'local',
      contextWindowTokens: 8192,
      capabilities: ['chat', 'streaming'],
      costClass: 'free',
      latencyClass: 'low',
      privacyClass: 'local',
      availability: 'AVAILABLE',
      notes: 'Offline-capable private local inference running entirely on host Mac',
    });

    // 5. Vision Model (macOS Vision Subsystem)
    this.register({
      id: 'macos-native-vision',
      name: 'macOS Native Vision & OCR',
      provider: 'local',
      category: 'vision',
      contextWindowTokens: 4096,
      capabilities: ['vision'],
      costClass: 'free',
      latencyClass: 'low',
      privacyClass: 'local',
      availability: 'AVAILABLE',
      notes: 'On-device Apple Vision Framework OCR and window screen inspection',
    });
  }

  public register(model: ModelMetadata): void {
    this.models.set(model.id, model);
  }

  public get(id: string): ModelMetadata | undefined {
    return this.models.get(id);
  }

  public getAll(): ModelMetadata[] {
    return Array.from(this.models.values());
  }

  public getByCategory(category: ModelCategory): ModelMetadata[] {
    return this.getAll().filter((m) => m.category === category);
  }

  public updateAvailability(
    id: string,
    status: AvailabilityStatus,
    resetTime?: number
  ): void {
    const model = this.models.get(id);
    if (model) {
      model.availability = status;
      model.rateLimitResetTime = resetTime;
    }
  }
}

