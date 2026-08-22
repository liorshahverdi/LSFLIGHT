/**
 * Structured logging (FLT-005).
 *
 * The sim never calls console.* directly (lint-enforced). Hosts choose the
 * sink: console in dev, ring buffer in tests, file/JSONL in the CLI.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogRecord {
  level: LogLevel;
  system: string;
  msg: string;
  entityId?: number;
  scenarioId?: string;
}

export interface LogSink {
  write(record: LogRecord): void;
}

/** Bounded in-memory sink for tests and headless runs. */
export class RingBufferSink implements LogSink {
  private buf: LogRecord[] = [];

  constructor(private readonly capacity: number) {
    if (capacity < 1) throw new Error("RingBufferSink capacity must be >= 1");
  }

  write(record: LogRecord): void {
    this.buf.push(record);
    if (this.buf.length > this.capacity) this.buf.shift();
  }

  /** Most recent records, oldest first. */
  records(): LogRecord[] {
    return [...this.buf];
  }

  clear(): void {
    this.buf = [];
  }
}

export type LogContext = Omit<LogRecord, "level" | "system" | "msg">;

export interface BoundLogger {
  debug(msg: string, ctx?: LogContext): void;
  info(msg: string, ctx?: LogContext): void;
  warn(msg: string, ctx?: LogContext): void;
  error(msg: string, ctx?: LogContext): void;
}

export interface Logger {
  debug(system: string, msg: string, ctx?: LogContext): void;
  info(system: string, msg: string, ctx?: LogContext): void;
  warn(system: string, msg: string, ctx?: LogContext): void;
  error(system: string, msg: string, ctx?: LogContext): void;
  /** Returns a logger with a bound system name (methods take msg first). */
  child(system: string): BoundLogger;
}

export function createLogger(options: { sink: LogSink }): Logger {
  const { sink } = options;

  const emit = (level: LogLevel, system: string, msg: string, ctx?: LogContext): void => {
    const record: LogRecord = {
      level,
      system,
      msg,
      ...(ctx?.entityId !== undefined ? { entityId: ctx.entityId } : {}),
      ...(ctx?.scenarioId !== undefined ? { scenarioId: ctx.scenarioId } : {}),
    };
    sink.write(Object.freeze(record));
  };

  return {
    debug: (s, m, c) => emit("debug", s, m, c),
    info: (s, m, c) => emit("info", s, m, c),
    warn: (s, m, c) => emit("warn", s, m, c),
    error: (s, m, c) => emit("error", s, m, c),
    child: (system: string) => ({
      debug: (m: string, c?: LogContext) => emit("debug", system, m, c),
      info: (m: string, c?: LogContext) => emit("info", system, m, c),
      warn: (m: string, c?: LogContext) => emit("warn", system, m, c),
      error: (m: string, c?: LogContext) => emit("error", system, m, c),
      child: (): BoundLogger => {
        throw new Error("nested child() not supported; bind at top level");
      },
    }),
  };
}
