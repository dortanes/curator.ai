import { Component, h, State } from "@stencil/core";
import type { QueueItemResponse, QueueStatus, QueueStatusCounts, Channel, CollectedPost, Source } from "@curator/shared";
import { queueApi, channelsApi, uploadApi, imagesApi, sourcesApi, SERVER_BASE } from "../../services/api";
import type { ImageSearchResult } from "../../services/api";

const TABS: { key: string; label: string }[] = [
  { key: "", label: "All" },
  { key: "draft", label: "Drafts" },
  { key: "approved", label: "Approved" },
  { key: "scheduled", label: "Scheduled" },
  { key: "published", label: "Published" },
  { key: "rejected", label: "Rejected" },
];

const PAGE_SIZE = 20;

@Component({
  tag: "page-queue",
  shadow: false,
})
export class PageQueue {
  @State() items: QueueItemResponse[] = [];
  @State() counts: QueueStatusCounts = { all: 0, draft: 0, approved: 0, scheduled: 0, published: 0, rejected: 0 };
  @State() channels: Channel[] = [];
  @State() loading = true;
  @State() activeTab = "draft";
  @State() searchQuery = "";
  @State() editingId: number | null = null;
  @State() editContent = "";
  @State() editChannelId: number | null = null;
  @State() publishChannelId: number | null = null;
  @State() filterChannelId: number | null = null;
  @State() scheduleDate = "";
  @State() selectedIds: Set<number> = new Set();
  @State() uploadingId: number | null = null;
  @State() expandedOriginal: number | null = null;
  @State() page = 1;
  @State() totalItems = 0;
  @State() sources: Source[] = [];
  @State() filterSourceId: number | null = null;
  @State() imageSearchOpen = false;
  @State() imageSearchQuery = "";
  @State() imageSearchResults: ImageSearchResult[] = [];
  @State() imageSearchLoading = false;
  @State() imageSearchLoadingMore = false;
  @State() imageSearchPage = 0;
  @State() imageSearchHasMore = true;
  @State() imageDownloadingUrl: string | null = null;

  private pollTimer?: ReturnType<typeof setInterval>;
  private searchTimer?: ReturnType<typeof setTimeout>;
  private imageSearchTimer?: ReturnType<typeof setTimeout>;

  async componentWillLoad() {
    const [, channels] = await Promise.all([
      this.reload(),
      channelsApi.list().then((c) => (this.channels = c)),
      sourcesApi.list().then((s) => (this.sources = s)).catch(() => {}),
    ]);
    if (channels && channels.length > 0) this.publishChannelId = channels[0].id;
    this.loading = false;
  }

  connectedCallback() {
    this.pollTimer = setInterval(() => this.reload(), 10_000);
  }

  disconnectedCallback() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    if (this.imageSearchTimer) clearTimeout(this.imageSearchTimer);
  }

  private async reload() {
    try {
      const result = await queueApi.list(
        this.activeTab || undefined,
        this.searchQuery || undefined,
        this.filterSourceId ?? undefined,
        this.filterChannelId ?? undefined,
      );
      this.items = result.items.sort((a, b) => {
        const dateA = a.status === "scheduled" && a.scheduledAt
          ? a.scheduledAt
          : a.status === "published" && a.publishedAt
            ? a.publishedAt
            : a.createdAt;
        const dateB = b.status === "scheduled" && b.scheduledAt
          ? b.scheduledAt
          : b.status === "published" && b.publishedAt
            ? b.publishedAt
            : b.createdAt;
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      });
      this.counts = result.counts;
      this.totalItems = this.getCountForTab(this.activeTab);
    } catch (err) {
      console.error("[Queue] reload failed:", err);
    }
  }

  /** Convert MarkdownV2 string to safe HTML for preview display */
  private renderMdv2(md: string): string {
    // Remove MDV2 escapes FIRST (backslash before any non-alphanumeric character)
    let html = md.replace(/\\([^a-zA-Z0-9\s])/g, "$1");
    // HTML-escape
    html = html
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    // Bold
    html = html.replace(/\*([^*]+)\*/g, "<b>$1</b>");
    // Underline (before italic, since __ contains _)
    html = html.replace(/__([^_]+)__/g, "<u>$1</u>");
    // Italic
    html = html.replace(/_([^_]+)_/g, "<i>$1</i>");
    // Strikethrough
    html = html.replace(/~([^~]+)~/g, "<s>$1</s>");
    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-indigo-400 underline" target="_blank">$1</a>');
    // Newlines
    html = html.replace(/\n/g, "<br>");
    return html;
  }

  private onSearchInput(val: string) {
    this.searchQuery = val;
    this.page = 1;
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.reload(), 300);
  }

  private async switchTab(key: string) {
    this.activeTab = key;
    this.page = 1;
    this.selectedIds = new Set();
    await this.reload();
  }

  /* ── Editing ─────────────────────────── */

  private startEditing(item: QueueItemResponse) {
    this.editingId = item.id;
    this.editContent = item.rewrittenContent;
    this.editChannelId = item.channelId ?? null;
  }

  private cancelEditing() {
    this.editingId = null;
    this.editContent = "";
    this.editChannelId = null;
  }

  private autoResize(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }

  private async saveEdit() {
    if (!this.editingId) return;
    await queueApi.update(this.editingId, {
      rewrittenContent: this.editContent,
      channelId: this.editChannelId,
    });
    this.editingId = null;
    this.editChannelId = null;
    await this.reload();
  }

  /* ── Status ──────────────────────────── */

  private async updateStatus(id: number, status: QueueStatus) {
    await queueApi.update(id, { status });
    await this.reload();
  }

  private async publishNow(item: QueueItemResponse) {
    const channelId = item.channelId;
    if (!channelId) return;
    await queueApi.publish(item.id, { channelId });
    await this.reload();
  }

  private async schedulePost(item: QueueItemResponse) {
    if (!this.scheduleDate) return;
    const channelId = item.channelId;
    if (!channelId) return;
    await queueApi.update(item.id, {
      status: "scheduled",
      scheduledAt: new Date(this.scheduleDate).toISOString(),
      channelId,
    });
    this.scheduleDate = "";
    await this.reload();
  }

  /* ── Delete ──────────────────────────── */

  private async deleteItem(id: number) {
    try {
      await queueApi.delete(id);
    } catch (err) {
      console.error("[Queue] Delete failed:", err);
      return;
    }
    if (this.editingId === id) this.cancelEditing();
    await this.reload();
  }

  /* ── Selection ───────────────────────── */

  private toggleSelect(id: number) {
    const next = new Set(this.selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.selectedIds = next;
  }

  private toggleSelectAll() {
    const pageItems = this.getPageItems();
    if (this.selectedIds.size === pageItems.length) {
      this.selectedIds = new Set();
    } else {
      this.selectedIds = new Set(pageItems.map((i) => i.id));
    }
  }

  private async bulkAction(status: QueueStatus) {
    if (this.selectedIds.size === 0) return;
    await queueApi.bulkUpdate([...this.selectedIds], status);
    this.selectedIds = new Set();
    await this.reload();
  }

  private async bulkDelete() {
    if (this.selectedIds.size === 0) return;
    const ids = [...this.selectedIds];
    for (const id of ids) {
      try {
        await queueApi.delete(id);
      } catch (err) {
        console.error(`[Queue] Failed to delete #${id}:`, err);
      }
    }
    this.selectedIds = new Set();
    await this.reload();
  }

  /* ── Image ───────────────────────────── */

  private async handleImageUpload(itemId: number, file: File) {
    this.uploadingId = itemId;
    try {
      const url = await uploadApi.image(file);
      await queueApi.update(itemId, { imageUrl: url });
      await this.reload();
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      this.uploadingId = null;
    }
  }

  private async removeImage(itemId: number) {
    await queueApi.update(itemId, { imageUrl: null });
    await this.reload();
  }

  /* ── Image Search ────────────────────── */

  private toggleImageSearch() {
    this.imageSearchOpen = !this.imageSearchOpen;
    if (!this.imageSearchOpen) {
      this.imageSearchResults = [];
      this.imageSearchQuery = "";
      this.imageSearchPage = 0;
      this.imageSearchHasMore = true;
    }
  }

  private onImageSearchInput(val: string) {
    this.imageSearchQuery = val;
    if (this.imageSearchTimer) clearTimeout(this.imageSearchTimer);
    if (!val.trim()) {
      this.imageSearchResults = [];
      this.imageSearchPage = 0;
      this.imageSearchHasMore = true;
      return;
    }
    this.imageSearchTimer = setTimeout(() => this.runImageSearch(false), 500);
  }

  private async runImageSearch(loadMore: boolean) {
    if (!this.imageSearchQuery.trim()) return;
    if (loadMore) {
      this.imageSearchLoadingMore = true;
    } else {
      this.imageSearchLoading = true;
      this.imageSearchPage = 0;
      this.imageSearchHasMore = true;
    }
    try {
      const page = loadMore ? this.imageSearchPage + 1 : 0;
      const result = await imagesApi.search(this.imageSearchQuery, page);
      if (loadMore) {
        this.imageSearchResults = [...this.imageSearchResults, ...result.images];
      } else {
        this.imageSearchResults = result.images;
      }
      this.imageSearchPage = page;
      this.imageSearchHasMore = result.images.length >= 10;
    } catch (err) {
      console.error("[ImageSearch] Failed:", err);
      if (!loadMore) this.imageSearchResults = [];
      this.imageSearchHasMore = false;
    } finally {
      this.imageSearchLoading = false;
      this.imageSearchLoadingMore = false;
    }
  }

  private handleImageGridScroll(e: Event) {
    const el = e.target as HTMLElement;
    if (
      !this.imageSearchLoadingMore &&
      this.imageSearchHasMore &&
      el.scrollTop + el.clientHeight >= el.scrollHeight - 40
    ) {
      this.runImageSearch(true);
    }
  }

  private async selectSearchImage(imageUrl: string, itemId: number) {
    this.imageDownloadingUrl = imageUrl;
    try {
      const { url } = await imagesApi.download(imageUrl);
      await queueApi.update(itemId, { imageUrl: url });
      this.imageSearchOpen = false;
      this.imageSearchResults = [];
      this.imageSearchQuery = "";
      await this.reload();
    } catch (err) {
      console.error("[ImageSearch] Download failed:", err);
    } finally {
      this.imageDownloadingUrl = null;
    }
  }

  /* ── Helpers ─────────────────────────── */

  private getCountForTab(key: string): number {
    if (!key) return this.counts.all;
    const k = key as keyof QueueStatusCounts;
    return this.counts[k] || 0;
  }

  private getPageItems(): QueueItemResponse[] {
    const start = (this.page - 1) * PAGE_SIZE;
    return this.items.slice(start, start + PAGE_SIZE);
  }

  private truncate(text: string, maxLen = 200): string {
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen) + "…";
  }

  private statusColor(status: string): string {
    switch (status) {
      case "draft": return "bg-neutral-500/15 text-neutral-400";
      case "approved": return "bg-blue-500/15 text-blue-400";
      case "scheduled": return "bg-indigo-500/15 text-indigo-400";
      case "published": return "bg-emerald-500/15 text-emerald-400";
      case "rejected": return "bg-red-500/15 text-red-400";
      default: return "bg-neutral-500/15 text-neutral-400";
    }
  }

  /* ── Render ─────────────────────────── */

  render() {
    const isEditing = this.editingId !== null;
    const pageItems = this.getPageItems();
    const totalPages = Math.ceil(this.items.length / PAGE_SIZE);

    return (
      <div>
        {/* Header */}
        <div class="flex items-center justify-between mb-6">
          <h1 class="text-2xl font-bold tracking-tight text-white">Post Queue</h1>
          {this.channels.length > 0 && (
            <div class="relative">
              <select
                class="appearance-none bg-neutral-800 border border-neutral-700 text-neutral-300 text-sm rounded-lg pl-3 pr-8 py-2 focus:outline-none focus:border-neutral-500 cursor-pointer"
                onChange={(e) => {
                  const val = (e.target as HTMLSelectElement).value;
                  this.filterChannelId = val ? Number(val) : null;
                  this.filterSourceId = null;
                  this.page = 1;
                  this.reload();
                }}
              >
                <option value="" selected={!this.filterChannelId}>All Channels</option>
                {this.channels.map((ch) => (
                  <option value={ch.id} selected={this.filterChannelId === ch.id}>{ch.name}</option>
                ))}
              </select>
              <span class="material-icons-outlined text-base absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none">expand_more</span>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div class="flex gap-1 mb-6 bg-neutral-800/50 rounded-lg p-1 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              class={`px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap
                ${this.activeTab === tab.key 
                  ? "bg-neutral-700 text-white shadow-sm" 
                  : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700/50"}`}
              onClick={() => this.switchTab(tab.key)}
            >
              {tab.label}
              <span class="ml-2 text-xs opacity-60">{this.getCountForTab(tab.key)}</span>
            </button>
          ))}
        </div>

        {/* Toolbar */}
        <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
          <div class="relative w-full max-w-md">
            <span class="material-icons-outlined text-base absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">search</span>
            <input
              class="w-full bg-neutral-800 border border-neutral-700 text-neutral-200 placeholder:text-neutral-500 text-sm rounded-lg pl-10 pr-4 py-2.5 focus:outline-none focus:border-neutral-500 transition-colors"
              type="text"
              placeholder="Search posts..."
              value={this.searchQuery}
              onInput={(e) => this.onSearchInput((e.target as HTMLInputElement).value)}
            />
          </div>

          {/* Source filter */}
          {this.sources.length > 0 && (
            <div class="relative">
              <select
                class="appearance-none bg-neutral-800 border border-neutral-700 text-neutral-300 text-sm rounded-lg pl-3 pr-8 py-2.5 focus:outline-none focus:border-neutral-500 cursor-pointer"
                onChange={(e) => {
                  const val = (e.target as HTMLSelectElement).value;
                  this.filterSourceId = val ? Number(val) : null;
                  this.page = 1;
                  this.reload();
                }}
              >
                <option value="" selected={!this.filterSourceId}>All Sources</option>
                {(this.filterChannelId
                  ? this.sources.filter((s) => s.channelId === this.filterChannelId)
                  : this.sources
                ).map((s) => (
                  <option value={s.id} selected={this.filterSourceId === s.id}>{s.name}</option>
                ))}
              </select>
              <span class="material-icons-outlined text-base absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none">expand_more</span>
            </div>
          )}

          {this.selectedIds.size > 0 && (
            <div class="flex items-center gap-2">
              <span class="text-sm text-neutral-400 mr-2">{this.selectedIds.size} selected</span>
              <button class="rounded-md bg-blue-600 py-1.5 px-3 text-xs font-medium text-white hover:bg-blue-500 transition-colors" onClick={() => this.bulkAction("approved")}>Approve</button>
              <button class="rounded-md bg-red-600/80 py-1.5 px-3 text-xs font-medium text-white hover:bg-red-500 transition-colors" onClick={() => this.bulkAction("rejected")}>Reject</button>
              <button class="rounded-md border border-red-500/30 py-1.5 px-3 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors" onClick={() => this.bulkDelete()}>Delete</button>
            </div>
          )}
        </div>

        {/* Content */}
        {this.loading ? (
          <div class="flex justify-center p-12">
            <span class="material-icons-outlined text-3xl text-indigo-500 animate-spin">progress_activity</span>
          </div>
        ) : this.items.length === 0 ? (
          <div class="flex flex-col items-center justify-center p-16 text-center border border-dashed border-neutral-700 rounded-xl">
            <span class="text-4xl mb-3 opacity-40">📝</span>
            <p class="text-neutral-500 font-medium">{this.searchQuery ? "No posts match your search." : "Queue is empty."}</p>
          </div>
        ) : (
          <div>
            {/* Select all */}
            {!isEditing && (
              <div class="flex items-center mb-4">
                <label class="flex items-center gap-3 cursor-pointer text-sm text-neutral-400 hover:text-neutral-300 transition-colors">
                  <input
                    type="checkbox"
                    class="w-4 h-4 rounded border-neutral-600 bg-neutral-800 text-indigo-500 focus:ring-indigo-500/30 focus:ring-offset-0 cursor-pointer"
                    checked={this.selectedIds.size === pageItems.length && pageItems.length > 0}
                    onChange={() => this.toggleSelectAll()}
                  />
                  Select all ({pageItems.length})
                </label>
              </div>
            )}

            <div class="flex flex-col gap-3">
              {pageItems.map((item) => this.renderCard(item, isEditing))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div class="flex justify-center mt-6">
                <div class="flex items-center gap-1 bg-neutral-800 rounded-lg border border-neutral-700 p-1">
                  <button
                    class="rounded-md py-1.5 px-3 text-xs font-medium text-neutral-400 hover:text-white hover:bg-neutral-700 transition-colors disabled:opacity-30 disabled:pointer-events-none"
                    disabled={this.page <= 1}
                    onClick={() => { this.page--; this.selectedIds = new Set(); }}
                  >
                    « Prev
                  </button>
                  <span class="px-3 py-1.5 text-xs font-medium text-neutral-300">
                    Page {this.page} of {totalPages}
                  </span>
                  <button
                    class="rounded-md py-1.5 px-3 text-xs font-medium text-neutral-400 hover:text-white hover:bg-neutral-700 transition-colors disabled:opacity-30 disabled:pointer-events-none"
                    disabled={this.page >= totalPages}
                    onClick={() => { this.page++; this.selectedIds = new Set(); }}
                  >
                    Next »
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  private renderCard(item: QueueItemResponse, isEditing: boolean) {
    const editing = this.editingId === item.id;
    const dimmed = isEditing && !editing;
    const selected = this.selectedIds.has(item.id);

    return (
      <div
        class={`rounded-xl border overflow-hidden transition-all duration-200
          ${dimmed ? "opacity-20 scale-[0.99] pointer-events-none blur-[1px]" : ""}
          ${editing ? "border-indigo-500/50 ring-1 ring-indigo-500/20 shadow-lg shadow-indigo-500/5" : ""}
          ${selected && !editing ? "border-indigo-500/30 bg-indigo-500/5" : ""}
          ${!editing && !selected ? "border-neutral-700/60 bg-neutral-800/40 hover:border-neutral-600" : ""}
          ${editing ? "bg-neutral-800" : ""}`}
        key={item.id}
      >
        {editing ? this.renderEditView(item) : this.renderReadView(item)}
      </div>
    );
  }

  /* ── Read view ───────────────────────── */

  private renderReadView(item: QueueItemResponse) {
    const post = item.originalPost as CollectedPost | undefined;

    return [
      /* Header row */
      <div class="flex items-center justify-between px-5 py-3 border-b border-neutral-700/40">
        <div class="flex items-center gap-3">
          <input
            type="checkbox"
            class="w-4 h-4 rounded border-neutral-600 bg-neutral-800 text-indigo-500 focus:ring-indigo-500/30 focus:ring-offset-0 cursor-pointer"
            checked={this.selectedIds.has(item.id)}
            onChange={() => this.toggleSelect(item.id)}
          />
          <span class={`px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide ${this.statusColor(item.status)}`}>
            {item.status}
          </span>
          {item.channel && <span class="text-xs text-neutral-500">{item.channel.name}</span>}
        </div>
        <div class="flex items-center gap-3">
          <span class="text-xs text-neutral-600 font-mono">#{item.id}</span>
          <span class="text-xs text-neutral-500">
            {item.status === "scheduled" && item.scheduledAt
              ? `📅 ${new Date(item.scheduledAt).toLocaleString()}`
              : item.status === "published" && item.publishedAt
                ? `✅ ${new Date(item.publishedAt).toLocaleString()}`
                : new Date(item.createdAt).toLocaleString()}
          </span>
        </div>
      </div>,

      /* Content */
      <div class="px-5 py-4 cursor-pointer hover:bg-neutral-700/20 transition-colors" onClick={() => this.startEditing(item)}>
        <div class="whitespace-pre-wrap leading-relaxed text-sm text-neutral-300" innerHTML={this.renderMdv2(this.truncate(item.rewrittenContent, 300))}></div>
      </div>,

      /* Image preview */
      item.imageUrl && (
        <div class="px-5 pb-4">
          <div class="relative group inline-block rounded-lg overflow-hidden border border-neutral-700">
            <img src={`${SERVER_BASE}${item.imageUrl}`} alt="" class="w-32 h-24 object-cover" />
            <button
              class="absolute inset-0 bg-neutral-900/80 text-red-400 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => this.removeImage(item.id)}
              title="Remove image"
            >
              <span class="material-icons-outlined text-xl">close</span>
            </button>
          </div>
        </div>
      ),

      /* Original source toggle */
      post && (
        <div class="px-5 py-2.5 border-t border-neutral-700/30">
          <button
            class="flex items-center gap-2 text-[11px] font-semibold text-neutral-500 hover:text-neutral-300 tracking-wider uppercase transition-colors"
            onClick={() => { this.expandedOriginal = this.expandedOriginal === item.id ? null : item.id; }}
          >
            {this.expandedOriginal === item.id ? "▾" : "▸"} Original Source
          </button>
          {this.expandedOriginal === item.id && (
            <div class="mt-3 pl-3 border-l-2 border-neutral-700 text-xs text-neutral-400 whitespace-pre-wrap leading-relaxed">
              {post.content}
            </div>
          )}
        </div>
      ),

      /* ── Action toolbar: single row with delete at the end ── */
      (item.status === "draft" || item.status === "approved") && (
        <div class="flex items-center gap-2 px-5 py-3 border-t border-neutral-700/30 bg-neutral-800/30">
          {item.status === "draft" && (
            <button
              class="rounded-md bg-blue-600 py-1.5 px-4 text-xs font-medium text-white hover:bg-blue-500 transition-colors shadow-sm"
              onClick={() => this.updateStatus(item.id, "approved")}
            >
              ✓ Approve
            </button>
          )}
          <button
            class="rounded-md bg-emerald-600 py-1.5 px-4 text-xs font-medium text-white hover:bg-emerald-500 transition-colors shadow-sm"
            onClick={() => this.publishNow(item)}
          >
            ▶ Publish
          </button>
          <button
            class="rounded-md border border-neutral-600 py-1.5 px-4 text-xs font-medium text-neutral-400 hover:text-neutral-200 hover:border-neutral-500 transition-colors"
            onClick={() => this.updateStatus(item.id, "rejected")}
          >
            ✕ Reject
          </button>

          <span class="w-px h-5 bg-neutral-700 mx-1"></span>

          <input
            type="datetime-local"
            class="bg-neutral-800 border border-neutral-700 text-neutral-300 text-xs rounded-md px-2.5 py-1.5 focus:outline-none focus:border-neutral-500"
            value={this.scheduleDate}
            onInput={(e) => (this.scheduleDate = (e.target as HTMLInputElement).value)}
          />
          <button
            class="rounded-md border border-indigo-500/30 py-1.5 px-3 text-xs font-medium text-indigo-400 hover:bg-indigo-500/10 transition-colors"
            onClick={() => this.schedulePost(item)}
          >
            Schedule
          </button>

          <span class="flex-1"></span>

          <button
            class="rounded-md border border-red-500/30 py-1.5 px-3 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
            onClick={() => this.deleteItem(item.id)}
          >
            🗑 Delete
          </button>
        </div>
      ),

      /* Delete for non-actionable statuses (published, rejected, scheduled) */
      item.status !== "draft" && item.status !== "approved" && (
        <div class="flex items-center justify-end px-5 py-2 border-t border-neutral-700/30 bg-neutral-800/30">
          <button
            class="rounded-md border border-red-500/30 py-1.5 px-3 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
            onClick={() => this.deleteItem(item.id)}
          >
            🗑 Delete
          </button>
        </div>
      ),
    ];
  }

  /* ── Edit view ───────────────────────── */

  private renderEditView(item: QueueItemResponse) {
    return [
      <div class="flex items-center gap-3 px-5 py-3 border-b border-neutral-700/40 bg-neutral-800/50">
        <span class={`px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide ${this.statusColor(item.status)}`}>{item.status}</span>
        <span class="text-xs text-neutral-500 font-mono">Editing #{item.id}</span>
        <span class="flex-1"></span>
        <div class="relative">
          <select
            class="appearance-none bg-neutral-900 border border-neutral-600 text-neutral-300 text-xs rounded-md pl-2.5 pr-7 py-1.5 focus:outline-none focus:border-indigo-500 cursor-pointer"
            onChange={(e) => (this.editChannelId = Number((e.target as HTMLSelectElement).value))}
          >
            {this.channels.map((ch) => (
              <option value={ch.id} selected={this.editChannelId === ch.id}>{ch.name}</option>
            ))}
          </select>
          <span class="material-icons-outlined text-xs absolute right-1.5 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none">expand_more</span>
        </div>
      </div>,

      <mdv2-editor
        value={this.editContent}
        onMdv2Change={(e: CustomEvent<string>) => {
          this.editContent = e.detail;
        }}
      />,

      <div class="flex items-center justify-between px-5 py-3 border-t border-neutral-700/40 bg-neutral-800/50">
        <div class="flex items-center gap-3">
          <label class={`rounded-md border border-neutral-600 py-1.5 px-3 text-xs font-medium text-neutral-400 hover:border-neutral-500 hover:text-neutral-300 transition-colors cursor-pointer ${this.uploadingId === item.id ? "pointer-events-none opacity-50" : ""}`}>
            {this.uploadingId === item.id ? (
              <span class="flex items-center gap-1.5">
                <span class="material-icons-outlined text-sm animate-spin">progress_activity</span>
                Uploading
              </span>
            ) : "📎 Image"}
            <input
              type="file"
              accept="image/*"
              class="hidden"
              disabled={this.uploadingId === item.id}
              onChange={(e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (file) this.handleImageUpload(item.id, file);
              }}
            />
          </label>

          <button
            class={`rounded-md border py-1.5 px-3 text-xs font-medium transition-colors ${
              this.imageSearchOpen
                ? "border-indigo-500/50 text-indigo-400 bg-indigo-500/10"
                : "border-neutral-600 text-neutral-400 hover:border-neutral-500 hover:text-neutral-300"
            }`}
            onClick={() => this.toggleImageSearch()}
          >
            🔍 Search
          </button>
          
          {item.imageUrl && (
            <div class="flex items-center gap-2 px-2 py-1 rounded-md bg-neutral-700/50 border border-neutral-600">
              <img src={`${SERVER_BASE}${item.imageUrl}`} class="w-8 h-6 object-cover rounded-sm" alt="" />
              <button class="text-neutral-500 hover:text-red-400 transition-colors text-xs" onClick={() => this.removeImage(item.id)} title="Remove">×</button>
            </div>
          )}
        </div>
        
        <div class="flex gap-2">
          <button
            class="rounded-md border border-neutral-600 py-2 px-5 text-sm font-medium text-neutral-400 hover:text-neutral-200 hover:border-neutral-500 transition-colors"
            onClick={() => this.cancelEditing()}
          >
            Cancel
          </button>
          <button
            class="rounded-md bg-indigo-600 py-2 px-6 text-sm font-medium text-white hover:bg-indigo-500 transition-colors shadow-sm"
            onClick={() => this.saveEdit()}
          >
            Save Changes
          </button>
        </div>
      </div>,

      /* Image search panel */
      this.imageSearchOpen && (
        <div class="px-5 py-4 border-t border-neutral-700/40 bg-neutral-900/50">
          <div class="relative mb-4">
            <span class="material-icons-outlined text-base absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">image_search</span>
            <input
              class="w-full bg-neutral-800 border border-neutral-700 text-neutral-200 placeholder:text-neutral-500 text-sm rounded-lg pl-10 pr-4 py-2.5 focus:outline-none focus:border-indigo-500 transition-colors"
              type="text"
              placeholder="Search for images..."
              value={this.imageSearchQuery}
              onInput={(e) => this.onImageSearchInput((e.target as HTMLInputElement).value)}
            />
          </div>

          {this.imageSearchLoading && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", padding: "32px 0" }}>
              <span
                style={{
                  display: "inline-block",
                  width: "24px",
                  height: "24px",
                  border: "3px solid #6366f1",
                  borderTopColor: "transparent",
                  borderRadius: "50%",
                  animation: "spin 0.8s linear infinite",
                }}
              ></span>
              <span style={{ fontSize: "14px", color: "#a1a1aa" }}>Searching...</span>
            </div>
          )}

          {!this.imageSearchLoading && this.imageSearchResults.length > 0 && (
            <div
              class="max-h-72 overflow-y-auto rounded-lg"
              onScroll={(e) => this.handleImageGridScroll(e)}
            >
              <div class="grid grid-cols-4 gap-2">
                {this.imageSearchResults.map((img) => (
                  <button
                    class={`relative group rounded-lg overflow-hidden border border-neutral-700 hover:border-indigo-500 transition-all aspect-video bg-neutral-800 ${
                      this.imageDownloadingUrl === img.url ? "opacity-50 pointer-events-none" : ""
                    }`}
                    onClick={() => this.selectSearchImage(img.url, item.id)}
                    title="Click to attach"
                  >
                    <img
                      src={img.url}
                      alt=""
                      class="w-full h-full object-cover"
                      loading="lazy"
                    />
                    {this.imageDownloadingUrl === img.url && (
                      <div class="absolute inset-0 flex items-center justify-center bg-neutral-900/70">
                        <span style={{ display: "inline-block", width: "20px", height: "20px", border: "3px solid #818cf8", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}></span>
                      </div>
                    )}
                    <div class="absolute inset-0 bg-indigo-600/0 group-hover:bg-indigo-600/20 transition-colors flex items-center justify-center">
                      <span class="material-icons-outlined text-white opacity-0 group-hover:opacity-100 transition-opacity text-2xl drop-shadow-lg">add_circle</span>
                    </div>
                  </button>
                ))}
              </div>
              {this.imageSearchLoadingMore && (
                <div class="flex justify-center py-3">
                  <span style={{ display: "inline-block", width: "20px", height: "20px", border: "3px solid #818cf8", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}></span>
                </div>
              )}
            </div>
          )}

          {!this.imageSearchLoading && this.imageSearchQuery && this.imageSearchResults.length === 0 && (
            <p class="text-center text-neutral-500 text-sm py-4">No images found. Try a different query.</p>
          )}
        </div>
      ),
    ];
  }
}
