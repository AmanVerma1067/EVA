import { describe, expect, it } from 'vitest';
import { ModelRegistry } from '../../../core/providers/ModelRegistry.js';
import { AIRouter } from '../../../core/providers/AIRouter.js';

describe('AI Model Registry and Dynamic AIRouter', () => {
  it('registers defaults across all primary categories without storing credentials', () => {
    const registry = new ModelRegistry();
    const models = registry.getAll();

    expect(models.length).toBeGreaterThanOrEqual(5);

    const categories = models.map((m) => m.category);
    expect(categories).toContain('fast');
    expect(categories).toContain('reasoning');
    expect(categories).toContain('coding');
    expect(categories).toContain('vision');
    expect(categories).toContain('local');

    // Ensure zero credentials / secrets exist in metadata
    for (const m of models) {
      expect((m as any).apiKey).toBeUndefined();
      expect((m as any).token).toBeUndefined();
      expect((m as any).secret).toBeUndefined();
    }
  });

  it('dynamically routes simple interaction tasks to fast model', () => {
    const router = new AIRouter();
    const decision = router.route({
      taskType: 'interaction',
      complexity: 'low',
    });

    expect(decision.category).toBe('fast');
    expect(decision.selectedModel?.id).toBe('claude-3-5-haiku');
    expect(decision.connectionMode).toBe('ONLINE');
  });

  it('routes complex architecture / planning tasks to reasoning model', () => {
    const router = new AIRouter();
    const decision = router.route({
      taskType: 'planning',
      complexity: 'high',
    });

    expect(decision.category).toBe('reasoning');
    expect(decision.selectedModel?.id).toBe('claude-3-5-sonnet');
  });

  it('routes coding tasks to coding agent', () => {
    const router = new AIRouter();
    const decision = router.route({
      taskType: 'coding',
    });

    expect(decision.category).toBe('coding');
    expect(decision.selectedModel?.id).toBe('claude-code-cli');
  });

  it('routes vision tasks to vision model', () => {
    const router = new AIRouter();
    const decision = router.route({
      taskType: 'vision',
    });

    expect(decision.category).toBe('vision');
    expect(decision.selectedModel?.id).toBe('macos-native-vision');
    expect(decision.isLocal).toBe(true);
  });

  it('routes sensitive tasks or local privacy requirement to local model', () => {
    const router = new AIRouter();
    const decision = router.route({
      taskType: 'sensitive',
      privacy: 'local',
    });

    expect(decision.isLocal).toBe(true);
    expect(decision.selectedModel?.privacyClass).toBe('local');
  });

  it('transitions to OFFLINE mode and restricts routing to local models', () => {
    const router = new AIRouter();
    router.setConnectionMode('OFFLINE');

    const decision = router.route({
      taskType: 'interaction',
    });

    expect(decision.connectionMode).toBe('OFFLINE');
    expect(decision.isLocal).toBe(true);
    expect(decision.selectedModel?.provider).toBe('ollama');
  });

  it('transitions to DEGRADED mode when cloud model is rate limited', () => {
    const registry = new ModelRegistry();
    registry.updateAvailability('claude-3-5-haiku', 'RATE_LIMITED');
    const router = new AIRouter(registry);
    router.setProviderAvailability('anthropic', true);

    expect(router.getConnectionMode()).toBe('DEGRADED');

    const decision = router.route({
      taskType: 'interaction',
      complexity: 'low',
    });

    // Should avoid rate-limited haiku and select available alternative
    expect(decision.selectedModel?.id).not.toBe('claude-3-5-haiku');
  });

  it('formats human-readable routing explanation for observability', () => {
    const router = new AIRouter();
    const decision = router.route({ taskType: 'coding' });
    const explanation = router.explainRouting(decision);

    expect(explanation).toContain('[AI Router: ONLINE]');
    expect(explanation).toContain('claude-code-cli');
    expect(explanation).toContain('anthropic');
  });
});
