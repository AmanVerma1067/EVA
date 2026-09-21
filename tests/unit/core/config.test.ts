import { describe, it, expect } from 'vitest';
import { loadConfig, getConfig } from '../../../core/config/Config.js';

describe('Config Loader', () => {
  it('should load default configuration safely', () => {
    const config = loadConfig();
    expect(config.environment).toBeDefined();
    expect(config.server.port).toBeGreaterThanOrEqual(1024);
    expect(config.security.sessionTtlMs).toBe(12 * 60 * 60 * 1000);
    expect(config.agent.maxToolCallsPerTask).toBe(50);
  });

  it('should allow valid overrides', () => {
    const config = loadConfig({
      server: {
        host: '0.0.0.0',
        port: 9000,
        tlsEnabled: true,
      },
    });
    expect(config.server.host).toBe('0.0.0.0');
    expect(config.server.port).toBe(9000);
    expect(config.server.tlsEnabled).toBe(true);
  });

  it('should return cached config via getConfig()', () => {
    const config = getConfig();
    expect(config).toBeDefined();
  });
});

