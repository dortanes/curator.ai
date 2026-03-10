import { Component, h, State } from "@stencil/core";
import type { DashboardStats, AiModelUsage } from "@curator/shared";
import { dashboardApi, pipelineApi, settingsApi } from "../../services/api";

@Component({
  tag: "page-dashboard",
  shadow: false,
})
export class PageDashboard {
  @State() stats: DashboardStats | null = null;
  @State() loading = true;
  @State() collecting = false;
  @State() collectMessage = "";
  @State() pipelineError: string | null = null;
  @State() lastRunAt: string | null = null;
  @State() pipelineStage = "idle";
  @State() collectInterval = 30;
  @State() intervalSaving = false;

  private pollTimer?: ReturnType<typeof setInterval>;

  async componentWillLoad() {
    await this.loadStats();
  }

  connectedCallback() {
    this.pollTimer = setInterval(() => this.loadStats(), 10_000);
  }

  disconnectedCallback() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  private async loadStats() {
    try {
      const [stats, status] = await Promise.all([
        dashboardApi.stats(),
        pipelineApi.status(),
      ]);
      this.stats = stats;
      this.collecting = status.running;
      this.pipelineError = status.lastError ?? null;
      this.lastRunAt = status.lastRunAt ?? null;
      this.pipelineStage = status.stage ?? "idle";
      this.collectInterval = status.collectIntervalMinutes ?? 30;
    } catch (err) {
      console.error("Failed to load dashboard:", err);
    } finally {
      this.loading = false;
    }
  }

  private async runCollector() {
    if (this.collecting) return;
    this.collecting = true;
    this.collectMessage = "";
    this.pipelineError = null;
    try {
      const result = await pipelineApi.run();
      this.collectMessage = result.message;
      if (!result.started) {
        this.collecting = false;
      }
      const check = setInterval(async () => {
        try {
          const [status, stats] = await Promise.all([
            pipelineApi.status(),
            dashboardApi.stats(),
          ]);
          this.pipelineStage = status.stage ?? "idle";
          this.stats = stats;
          if (!status.running) {
            this.collecting = false;
            this.pipelineError = status.lastError ?? null;
            this.lastRunAt = status.lastRunAt ?? null;
            this.collectMessage = status.lastError ? "Pipeline failed" : "Collection complete";
            clearInterval(check);
            setTimeout(() => (this.collectMessage = ""), 5000);
          }
        } catch {
          clearInterval(check);
          this.collecting = false;
        }
      }, 2000);
    } catch (err) {
      console.error("Failed to run collector:", err);
      this.collecting = false;
      this.collectMessage = "Failed to start collector";
      setTimeout(() => (this.collectMessage = ""), 5000);
    }
  }

  private async handleIntervalChange(e: Event) {
    const value = Number((e.target as HTMLSelectElement).value);
    this.intervalSaving = true;
    try {
      await settingsApi.update({ collectIntervalMinutes: value });
      this.collectInterval = value;
    } catch (err) {
      console.error("Failed to update interval:", err);
    } finally {
      this.intervalSaving = false;
    }
  }

  private formatNumber(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
    if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
    return String(n);
  }

  private stageProgress(): string {
    const stage = this.pipelineStage.toLowerCase();
    if (stage.startsWith("starting")) return "10%";
    if (stage.startsWith("collecting")) return "25%";
    if (stage.startsWith("filtering")) return "50%";
    if (stage.startsWith("rewriting")) return "75%";
    return "90%";
  }

  render() {
    if (this.loading) {
      return (
        <div class="flex items-center justify-center p-12">
          <span class="material-icons-outlined text-indigo-500 text-3xl animate-spin">progress_activity</span>
        </div>
      );
    }

    const s = this.stats;
    const ai = s?.aiUsage;

    const statCards = [
      { icon: "link", label: "Active Sources", value: `${s?.activeSourcesCount ?? 0}/${s?.sourcesCount ?? 0}`, color: "text-blue-400" },
      { icon: "inbox", label: "Collected Posts", value: s?.collectedPostsCount ?? 0, color: "text-emerald-400" },
      { icon: "edit_note", label: "Drafts in Queue", value: s?.queueDraftCount ?? 0, color: "text-indigo-400" },
      { icon: "schedule", label: "Scheduled", value: s?.queueScheduledCount ?? 0, color: "text-amber-400" },
      { icon: "check_circle", label: "Published Today", value: s?.publishedTodayCount ?? 0, color: "text-green-400" },
      { icon: "history", label: "Last Published", value: s?.lastPublishedAt ? new Date(s.lastPublishedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—", color: "text-neutral-400" },
    ];

    return (
      <div>
        {/* Header */}
        <div class="flex items-center justify-between mb-6">
          <h1 class="text-2xl font-bold tracking-tight text-white">Dashboard</h1>
          <div class="flex items-center gap-3">
            {this.collectMessage && (
              <span class={`text-xs font-medium px-2.5 py-1 rounded-full ${this.pipelineError ? "bg-red-500/10 text-red-400" : "bg-neutral-700/50 text-neutral-400"}`}>
                {this.collectMessage}
              </span>
            )}

            {/* Frequency selector */}
            <div class="relative inline-flex items-center">
              <span class="material-icons-outlined text-neutral-500 text-sm absolute left-2.5 pointer-events-none">schedule</span>
              <select
                id="collect-interval-select"
                class="appearance-none bg-neutral-800 border border-neutral-700 text-neutral-300 text-sm rounded-md h-9 pl-8 pr-8 focus:outline-none focus:border-indigo-500 transition-colors cursor-pointer disabled:opacity-50"
                disabled={this.intervalSaving}
                onChange={(e) => this.handleIntervalChange(e)}
              >
                {[
                  { v: 0, l: "Manual only" },
                  { v: 15, l: "Every 15 min" },
                  { v: 30, l: "Every 30 min" },
                  { v: 60, l: "Every 1 hour" },
                  { v: 120, l: "Every 2 hours" },
                  { v: 360, l: "Every 6 hours" },
                  { v: 720, l: "Every 12 hours" },
                  { v: 1440, l: "Every 24 hours" },
                ].map((o) => (
                  <option value={String(o.v)} selected={this.collectInterval === o.v}>{o.l}</option>
                ))}
              </select>
              <span class="material-icons-outlined text-neutral-500 text-xs absolute right-2 pointer-events-none">expand_more</span>
            </div>

            <button
              class="rounded-md w-fit bg-indigo-600 h-9 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-500 transition-all disabled:opacity-50 disabled:pointer-events-none inline-flex items-center gap-2 whitespace-nowrap shrink-0"
              disabled={this.collecting}
              onClick={() => this.runCollector()}
            >
              <span class={`material-icons-outlined text-sm ${this.collecting ? "animate-spin" : ""}`}>
                {this.collecting ? "progress_activity" : "play_arrow"}
              </span>
              {this.collecting ? "Collecting..." : "Run Collector"}
            </button>
          </div>
        </div>

        {/* Pipeline progress bar */}
        {this.collecting && this.pipelineStage !== "idle" && (
          <div class="mb-6 rounded-lg bg-neutral-800/50 border border-neutral-700/50 px-4 py-3">
            <div class="flex items-center justify-between mb-1.5">
              <span class="text-sm font-medium text-neutral-300 capitalize">{this.pipelineStage}</span>
              <span class="text-[10px] text-neutral-500 uppercase tracking-wider">In progress</span>
            </div>
            <div class="h-1 rounded-full bg-neutral-700 overflow-hidden">
              <div class="h-full rounded-full bg-indigo-500 animate-pulse" style={{ width: this.stageProgress() }}></div>
            </div>
          </div>
        )}

        {/* Pipeline error banner */}
        {this.pipelineError && (
          <div class="flex items-start gap-3 px-4 py-3 mb-6 rounded-lg bg-red-500/10 border border-red-500/20">
            <span class="material-icons-outlined text-red-400 text-lg mt-0.5">error</span>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-red-400">Pipeline Error</p>
              <p class="text-xs text-red-300/80 mt-0.5 break-all">{this.pipelineError}</p>
              {this.lastRunAt && (
                <p class="text-[10px] text-red-400/50 mt-1">Last successful run: {new Date(this.lastRunAt).toLocaleString()}</p>
              )}
            </div>
            <button
              class="text-red-400/50 hover:text-red-300 transition-colors"
              onClick={() => (this.pipelineError = null)}
            >
              <span class="material-icons-outlined text-base">close</span>
            </button>
          </div>
        )}

        {/* Pipeline stats */}
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
          {statCards.map((card) => (
            <div class="rounded-xl border p-4 bg-neutral-800/50 border-neutral-700/50">
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs font-medium text-neutral-500 uppercase tracking-wide">{card.label}</span>
                <span class={`material-icons-outlined text-lg ${card.color}`}>{card.icon}</span>
              </div>
              <div class={`text-2xl font-bold ${card.color}`}>{card.value}</div>
            </div>
          ))}
        </div>

        {/* AI Usage section */}
        <div class="rounded-xl border border-neutral-700/50 bg-neutral-800/30 p-6">
          <div class="flex items-center justify-between mb-5">
            <div class="flex items-center gap-3">
              <span class="material-icons-outlined text-xl text-indigo-400">smart_toy</span>
              <h2 class="text-lg font-semibold text-white">AI Usage</h2>
            </div>
            {ai && (
              <span class="text-xs text-neutral-500">
                Uptime: {ai.uptimeMinutes < 60 ? `${ai.uptimeMinutes}m` : `${Math.floor(ai.uptimeMinutes / 60)}h ${ai.uptimeMinutes % 60}m`}
              </span>
            )}
          </div>

          {!ai || ai.models.length === 0 ? (
            <div class="text-center py-8">
              <span class="material-icons-outlined text-4xl text-neutral-700 mb-2">analytics</span>
              <p class="text-neutral-500 text-sm">No AI calls recorded yet. Run the collector to see usage stats.</p>
            </div>
          ) : (
            <div>
              {/* Summary row */}
              <div class="grid grid-cols-2 gap-3 mb-5">
                <div class="rounded-lg bg-neutral-800 border border-neutral-700/50 p-4">
                  <div class="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">Total Requests</div>
                  <div class="text-2xl font-bold text-indigo-400">{ai.totalRequests}</div>
                </div>
                <div class="rounded-lg bg-neutral-800 border border-neutral-700/50 p-4">
                  <div class="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">Total Tokens</div>
                  <div class="text-2xl font-bold text-emerald-400">{this.formatNumber(ai.totalTokens)}</div>
                </div>
              </div>

              {/* Per-model table */}
              <div class="overflow-x-auto">
                <table class="w-full text-sm">
                  <thead>
                    <tr class="border-b border-neutral-700/50">
                      <th class="text-left py-2.5 px-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Model</th>
                      <th class="text-right py-2.5 px-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">RPM</th>
                      <th class="text-right py-2.5 px-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">TPM</th>
                      <th class="text-right py-2.5 px-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">RPD</th>
                      <th class="text-right py-2.5 px-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">TPD</th>
                      <th class="text-right py-2.5 px-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Total Req</th>
                      <th class="text-right py-2.5 px-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Total Tok</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ai.models.map((m: AiModelUsage) => (
                      <tr class="border-b border-neutral-800 hover:bg-neutral-800/50 transition-colors">
                        <td class="py-3 px-3">
                          <span class="font-mono text-sm text-white">{m.model}</span>
                        </td>
                        <td class="py-3 px-3 text-right">
                          <span class={`font-mono ${m.rpm > 0 ? "text-amber-400" : "text-neutral-600"}`}>{m.rpm}</span>
                        </td>
                        <td class="py-3 px-3 text-right">
                          <span class={`font-mono ${m.tpm > 0 ? "text-amber-400" : "text-neutral-600"}`}>{this.formatNumber(m.tpm)}</span>
                        </td>
                        <td class="py-3 px-3 text-right">
                          <span class="font-mono text-indigo-400">{m.rpd}</span>
                        </td>
                        <td class="py-3 px-3 text-right">
                          <span class="font-mono text-indigo-400">{this.formatNumber(m.tpd)}</span>
                        </td>
                        <td class="py-3 px-3 text-right">
                          <span class="font-mono text-neutral-300">{m.totalRequests}</span>
                        </td>
                        <td class="py-3 px-3 text-right">
                          <span class="font-mono text-neutral-300">{this.formatNumber(m.totalTokens)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Legend */}
              <div class="flex flex-wrap gap-4 mt-4 pt-3 border-t border-neutral-700/30">
                <span class="text-[10px] text-neutral-600 uppercase tracking-wider">RPM = Requests/min</span>
                <span class="text-[10px] text-neutral-600 uppercase tracking-wider">TPM = Tokens/min</span>
                <span class="text-[10px] text-neutral-600 uppercase tracking-wider">RPD = Requests/day</span>
                <span class="text-[10px] text-neutral-600 uppercase tracking-wider">TPD = Tokens/day</span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
}
