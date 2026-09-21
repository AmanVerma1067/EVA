import { describe, it, expect } from 'vitest';
import { Logger, redactSecrets, LogEntry } from '../../../core/logger/Logger.js';

describe('Logger and Secret Redaction', () => {
  it('should redact sensitive keys and bearer tokens from strings and objects', () => {
    const sensitive = {
      user: 'alice',
      password: 'superSecretPassword123!',
      apiKey: 'sk-proj-1234567890abcdef1234567890',
      nested: {
        token: 'ghp_123456789012345678901234567890123456',
        publicNote: 'Hello world',
      },
    };

    const cleaned = redactSecrets(sensitive) as Record<string, unknown>;
    expect(cleaned.password).toBe('[REDACTED]');
    expect(cleaned.apiKey).toBe('[REDACTED]');
    expect((cleaned.nested as Record<string, unknown>).token).toBe('[REDACTED]');
    expect((cleaned.nested as Record<string, unknown>).publicNote).toBe('Hello world');
  });

  it('should route log messages to sink with correct levels', () => {
    const entries: LogEntry[] = [];
    const logger = new Logger({
      component: 'test',
      minLevel: 'debug',
      sink: (entry) => entries.push(entry),
    });

    logger.debug('Debug message');
    logger.info('Info message');
    logger.warn('Warn message');
    logger.error('Error message');
    logger.security('Security event');

    expect(entries.length).toBe(5);
    expect(entries[0].level).toBe('debug');
    expect(entries[4].level).toBe('security');
    expect(entries[4].message).toBe('Security event');
  });

  it('should filter out logs below minLevel', () => {
    const entries: LogEntry[] = [];
    const logger = new Logger({
      component: 'test',
      minLevel: 'warn',
      sink: (entry) => entries.push(entry),
    });

    logger.debug('Should not appear');
    logger.info('Should not appear');
    logger.warn('Should appear');
    logger.error('Should appear');

    expect(entries.length).toBe(2);
    expect(entries[0].level).toBe('warn');
    expect(entries[1].level).toBe('error');
  });
});

