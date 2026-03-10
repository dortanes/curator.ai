/**
 * In-memory AI API usage tracker.
 * Tracks requests per minute (RPM), tokens per minute (TPM),
 * and requests per day (RPD) — per model.
 */

interface UsageEntry {
  timestamp: number;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ModelUsageStats {
  model: string;
  rpm: number;       // requests in the last minute
  tpm: number;       // tokens in the last minute
  rpd: number;       // requests today
  tpd: number;       // tokens today
  totalRequests: number;
  totalTokens: number;
}

export interface AiUsageSnapshot {
  models: ModelUsageStats[];
  totalRequests: number;
  totalTokens: number;
  uptimeMinutes: number;
}

const ONE_MINUTE = 60_000;

export class AiUsageTracker {
  private entries: UsageEntry[] = [];
  private startedAt = Date.now();

  /**
   * Record a single API call.
   */
  record(model: string, promptTokens: number, completionTokens: number): void {
    this.entries.push({
      timestamp: Date.now(),
      model,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    });

    // Prune entries older than 24h to prevent memory leak
    const cutoff = Date.now() - 24 * 60 * ONE_MINUTE;
    this.entries = this.entries.filter((e) => e.timestamp >= cutoff);
  }

  /**
   * Get a snapshot of current usage stats.
   */
  getSnapshot(): AiUsageSnapshot {
    const now = Date.now();
    const minuteAgo = now - ONE_MINUTE;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();

    // Group by model
    const modelMap = new Map<string, {
      rpm: number; tpm: number;
      rpd: number; tpd: number;
      total: number; totalTokens: number;
    }>();

    for (const entry of this.entries) {
      let stats = modelMap.get(entry.model);
      if (!stats) {
        stats = { rpm: 0, tpm: 0, rpd: 0, tpd: 0, total: 0, totalTokens: 0 };
        modelMap.set(entry.model, stats);
      }

      stats.total++;
      stats.totalTokens += entry.totalTokens;

      if (entry.timestamp >= minuteAgo) {
        stats.rpm++;
        stats.tpm += entry.totalTokens;
      }
      if (entry.timestamp >= todayMs) {
        stats.rpd++;
        stats.tpd += entry.totalTokens;
      }
    }

    const models: ModelUsageStats[] = [...modelMap.entries()].map(([model, s]) => ({
      model,
      rpm: s.rpm,
      tpm: s.tpm,
      rpd: s.rpd,
      tpd: s.tpd,
      totalRequests: s.total,
      totalTokens: s.totalTokens,
    }));

    return {
      models,
      totalRequests: this.entries.length,
      totalTokens: this.entries.reduce((sum, e) => sum + e.totalTokens, 0),
      uptimeMinutes: Math.floor((now - this.startedAt) / ONE_MINUTE),
    };
  }
}
