import { Component, h, State } from "@stencil/core";
import type { LogEntry } from "@curator/shared";
import { logsApi } from "../../services/api";

@Component({
  tag: "page-logs",
  shadow: false,
})
export class PageLogs {
  @State() entries: LogEntry[] = [];
  @State() loading = true;
  @State() autoScroll = true;
  @State() filterLevel: "all" | "info" | "warn" | "error" = "all";

  private pollTimer?: ReturnType<typeof setInterval>;
  private lastTimestamp?: string;
  private containerRef?: HTMLDivElement;

  async componentWillLoad() {
    await this.loadLogs();
  }

  connectedCallback() {
    this.pollTimer = setInterval(() => this.pollLogs(), 3_000);
  }

  disconnectedCallback() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  private async loadLogs() {
    try {
      const entries = await logsApi.list();
      this.entries = entries;
      if (entries.length > 0) {
        this.lastTimestamp = entries[entries.length - 1].timestamp;
      }
    } catch (err) {
      console.error("Failed to load logs:", err);
    } finally {
      this.loading = false;
      this.scrollToBottom();
    }
  }

  private async pollLogs() {
    try {
      const newEntries = await logsApi.list(this.lastTimestamp);
      if (newEntries.length > 0) {
        this.entries = [...this.entries, ...newEntries].slice(-500);
        this.lastTimestamp = newEntries[newEntries.length - 1].timestamp;
        if (this.autoScroll) {
          requestAnimationFrame(() => this.scrollToBottom());
        }
      }
    } catch {
      // silent retry
    }
  }

  private scrollToBottom() {
    if (this.containerRef && this.autoScroll) {
      requestAnimationFrame(() => {
        if (this.containerRef) {
          this.containerRef.scrollTop = this.containerRef.scrollHeight;
        }
      });
    }
  }

  private async clearLogs() {
    try {
      await logsApi.clear();
      this.entries = [];
      this.lastTimestamp = undefined;
    } catch (err) {
      console.error("Failed to clear logs:", err);
    }
  }

  private levelColor(level: string): string {
    switch (level) {
      case "error": return "text-red-400";
      case "warn": return "text-amber-400";
      default: return "text-neutral-400";
    }
  }

  private levelBg(level: string): string {
    switch (level) {
      case "error": return "bg-red-500/10";
      case "warn": return "bg-amber-500/5";
      default: return "";
    }
  }

  private formatTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  private get filteredEntries(): LogEntry[] {
    if (this.filterLevel === "all") return this.entries;
    return this.entries.filter((e) => e.level === this.filterLevel);
  }

  private countByLevel(level: string): number {
    return this.entries.filter((e) => e.level === level).length;
  }

  render() {
    if (this.loading) {
      return (
        <div class="flex items-center justify-center p-12">
          <span class="material-icons-outlined text-indigo-500 text-3xl animate-spin">progress_activity</span>
        </div>
      );
    }

    const filtered = this.filteredEntries;

    return (
      <div class="flex flex-col h-[calc(100vh-4rem)]">
        {/* Header */}
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-3">
            <h1 class="text-2xl font-bold tracking-tight text-white">Pipeline Logs</h1>
            <span class="text-xs text-neutral-500 bg-neutral-800 px-2 py-0.5 rounded-full">
              {this.entries.length} entries
            </span>
          </div>

          <div class="flex items-center gap-2">
            {/* Level filter pills */}
            {(["all", "info", "warn", "error"] as const).map((level) => {
              const isActive = this.filterLevel === level;
              const count = level === "all" ? this.entries.length : this.countByLevel(level);
              const colors: Record<string, string> = {
                all: isActive ? "bg-neutral-700 text-white" : "text-neutral-500 hover:text-neutral-300",
                info: isActive ? "bg-blue-500/20 text-blue-400" : "text-neutral-500 hover:text-neutral-300",
                warn: isActive ? "bg-amber-500/20 text-amber-400" : "text-neutral-500 hover:text-neutral-300",
                error: isActive ? "bg-red-500/20 text-red-400" : "text-neutral-500 hover:text-neutral-300",
              };
              return (
                <button
                  class={`text-xs font-medium px-2.5 py-1 rounded-full transition-colors cursor-pointer ${colors[level]}`}
                  onClick={() => (this.filterLevel = level)}
                >
                  {level === "all" ? "All" : level.charAt(0).toUpperCase() + level.slice(1)}
                  {count > 0 && <span class="ml-1 opacity-60">{count}</span>}
                </button>
              );
            })}

            <div class="w-px h-5 bg-neutral-700/50 mx-1"></div>

            {/* Auto-scroll toggle */}
            <button
              class={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full transition-colors cursor-pointer ${
                this.autoScroll ? "bg-indigo-500/20 text-indigo-400" : "text-neutral-500 hover:text-neutral-300"
              }`}
              onClick={() => (this.autoScroll = !this.autoScroll)}
            >
              <span class="material-icons-outlined text-xs">vertical_align_bottom</span>
              Auto-scroll
            </button>

            {/* Clear button */}
            <button
              class="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
              onClick={() => this.clearLogs()}
            >
              <span class="material-icons-outlined text-xs">delete_outline</span>
              Clear
            </button>
          </div>
        </div>

        {/* Log container */}
        <div
          ref={(el) => (this.containerRef = el as HTMLDivElement)}
          class="flex-1 rounded-xl border border-neutral-700/50 bg-neutral-950 overflow-y-auto font-mono text-[13px] leading-relaxed"
        >
          {filtered.length === 0 ? (
            <div class="flex flex-col items-center justify-center h-full text-neutral-600">
              <span class="material-icons-outlined text-4xl mb-2">terminal</span>
              <p class="text-sm">No log entries yet. Run the pipeline to see logs.</p>
            </div>
          ) : (
            <div class="divide-y divide-neutral-800/50">
              {filtered.map((entry) => (
                <div class={`flex gap-3 px-4 py-1.5 hover:bg-neutral-800/30 transition-colors ${this.levelBg(entry.level)}`}>
                  <span class="text-neutral-600 shrink-0 select-none text-[11px] pt-px tabular-nums">
                    {this.formatTime(entry.timestamp)}
                  </span>
                  <span class={`shrink-0 uppercase text-[10px] font-bold tracking-wider pt-0.5 w-10 ${this.levelColor(entry.level)}`}>
                    {entry.level === "info" ? "INF" : entry.level === "warn" ? "WRN" : "ERR"}
                  </span>
                  <span class={`flex-1 break-all ${this.levelColor(entry.level)}`}>
                    {entry.message}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }
}
