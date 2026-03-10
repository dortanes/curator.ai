export interface LogEntry {
  timestamp: string;
  level: "info" | "warn" | "error";
  message: string;
}

const MAX_ENTRIES = 500;
const CAPTURE_PREFIXES = ["[Pipeline]", "[AiService]", "[Scheduler]", "[Publisher]", "[DB]", "[Server]", "[PromptManager]"];

/**
 * In-memory ring buffer that captures console output from pipeline/AI services.
 * Provides a queryable log store for the UI.
 */
export class LogBuffer {
  private entries: LogEntry[] = [];
  private origLog = console.log;
  private origWarn = console.warn;
  private origError = console.error;

  /**
   * Install console interceptors. Call once at startup.
   */
  install(): void {
    const self = this;

    console.log = (...args: unknown[]) => {
      self.origLog.apply(console, args);
      self.capture("info", args);
    };

    console.warn = (...args: unknown[]) => {
      self.origWarn.apply(console, args);
      self.capture("warn", args);
    };

    console.error = (...args: unknown[]) => {
      self.origError.apply(console, args);
      self.capture("error", args);
    };
  }

  private capture(level: LogEntry["level"], args: unknown[]): void {
    const message = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");

    // Only capture messages that start with known prefixes
    const shouldCapture = CAPTURE_PREFIXES.some((p) => message.startsWith(p));
    if (!shouldCapture) return;

    this.entries.push({
      timestamp: new Date().toISOString(),
      level,
      message,
    });

    // Trim to max size
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(-MAX_ENTRIES);
    }
  }

  /**
   * Get all log entries, optionally filtered by timestamp.
   */
  getAll(since?: string): LogEntry[] {
    if (!since) return [...this.entries];
    return this.entries.filter((e) => e.timestamp > since);
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this.entries = [];
  }
}
