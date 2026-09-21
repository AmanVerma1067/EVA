/**
 * EVA Structured Logger with Automatic Secret Redaction
 * Conforms to EVA_AI_Implementation_Master_Spec Section 15 & 16
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'security';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  component: string;
  context?: Record<string, unknown>;
  error?: Record<string, unknown>;
}

export interface LoggerOptions {
  component: string;
  minLevel?: LogLevel;
  sink?: (entry: LogEntry) => void;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  security: 4,
};

const SECRET_PATTERNS = [
  /bearer\s+[a-zA-Z0-9_\-\.=:_+/]+/gi,
  /sk-[a-zA-Z0-9_-]{20,}/gi,
  /ghp_[a-zA-Z0-9]{36}/gi,
  /xox[baprs]-[0-9a-zA-Z]{10,48}/gi,
  /(?:api[_-]?key|secret|password|token|auth|credential)["']?\s*[:=]\s*["']?([^"'\s,;]+)["']?/gi,
];

export function redactSecrets(input: unknown): unknown {
  if (typeof input === 'string') {
    let sanitized = input;
    for (const pattern of SECRET_PATTERNS) {
      sanitized = sanitized.replace(pattern, (match, p1) => {
        if (p1) {
          return match.replace(p1, '[REDACTED]');
        }
        return '[REDACTED]';
      });
    }
    return sanitized;
  }

  if (Array.isArray(input)) {
    return input.map(redactSecrets);
  }

  if (input !== null && typeof input === 'object') {
    const sanitizedObj: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('password') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('token') ||
        lowerKey.includes('apikey') ||
        lowerKey.includes('api_key') ||
        lowerKey.includes('authorization') ||
        lowerKey.includes('privatekey') ||
        lowerKey.includes('private_key')
      ) {
        sanitizedObj[key] = '[REDACTED]';
      } else {
        sanitizedObj[key] = redactSecrets(value);
      }
    }
    return sanitizedObj;
  }

  return input;
}

export class Logger {
  private component: string;
  private minLevel: LogLevel;
  private sink: (entry: LogEntry) => void;

  constructor(options: LoggerOptions) {
    this.component = options.component;
    this.minLevel = options.minLevel ?? (process.env.EVA_LOG_LEVEL as LogLevel) ?? 'info';
    this.sink = options.sink ?? ((entry) => {
      const formatted = JSON.stringify(entry);
      if (entry.level === 'error' || entry.level === 'security') {
        process.stderr.write(formatted + '\n');
      } else {
        process.stdout.write(formatted + '\n');
      }
    });
  }

  public child(childComponent: string): Logger {
    return new Logger({
      component: `${this.component}:${childComponent}`,
      minLevel: this.minLevel,
      sink: this.sink,
    });
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.minLevel];
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>, error?: unknown): void {
    if (!this.shouldLog(level)) return;

    const sanitizedContext = context ? (redactSecrets(context) as Record<string, unknown>) : undefined;
    const sanitizedMessage = redactSecrets(message) as string;

    let sanitizedError: Record<string, unknown> | undefined;
    if (error instanceof Error) {
      sanitizedError = {
        name: error.name,
        message: redactSecrets(error.message) as string,
        stack: error.stack ? (redactSecrets(error.stack) as string) : undefined,
      };
      if ('code' in error) {
        sanitizedError.code = (error as { code: unknown }).code;
      }
      if ('details' in error) {
        sanitizedError.details = redactSecrets((error as { details: unknown }).details);
      }
    } else if (error) {
      sanitizedError = { raw: redactSecrets(error) };
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message: sanitizedMessage,
      component: this.component,
      context: sanitizedContext,
      error: sanitizedError,
    };

    this.sink(entry);
  }

  public debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, context);
  }

  public info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context);
  }

  public warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context);
  }

  public error(message: string, context?: Record<string, unknown>, error?: unknown): void {
    this.log('error', message, context, error);
  }

  public security(message: string, context?: Record<string, unknown>, error?: unknown): void {
    this.log('security', message, context, error);
  }
}

export const rootLogger = new Logger({ component: 'eva' });

