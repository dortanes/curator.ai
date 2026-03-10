import { Component, h, State } from "@stencil/core";
import type { CollectedPost, Channel, Source } from "@curator/shared";
import { postsApi, channelsApi, sourcesApi } from "../../services/api";

@Component({
  tag: "page-posts",
  shadow: false,
})
export class PagePosts {
  @State() posts: (CollectedPost & { source?: { id: number; name: string; type: string; channel?: { id: number; name: string } } })[] = [];
  @State() total = 0;
  @State() page = 1;
  @State() pageSize = 20;
  @State() loading = true;
  @State() channels: Channel[] = [];
  @State() sources: (Source & { channelId: number })[] = [];
  @State() filterChannelId: number | null = null;
  @State() filterSourceId: number | null = null;
  @State() searchQuery = "";
  @State() expandedId: number | null = null;

  private pollTimer?: ReturnType<typeof setInterval>;
  private searchTimer?: ReturnType<typeof setTimeout>;

  async componentWillLoad() {
    await Promise.all([
      this.loadPosts(),
      channelsApi.list().then((c) => (this.channels = c)).catch(() => {}),
      sourcesApi.list().then((s) => (this.sources = s as any)).catch(() => {}),
    ]);
  }

  connectedCallback() {
    this.pollTimer = setInterval(() => this.loadPosts(), 10_000);
  }

  disconnectedCallback() {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = undefined; }
    if (this.searchTimer) clearTimeout(this.searchTimer);
  }

  private async loadPosts() {
    try {
      const result = await postsApi.list({
        page: this.page,
        pageSize: this.pageSize,
        sourceId: this.filterSourceId ?? undefined,
        channelId: this.filterChannelId ?? undefined,
        search: this.searchQuery || undefined,
      });
      this.posts = result.items as any;
      this.total = result.total;
    } catch (err) {
      console.error("Failed to load posts:", err);
    } finally {
      this.loading = false;
    }
  }

  private onSearchInput(val: string) {
    this.searchQuery = val;
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.page = 1;
      this.loadPosts();
    }, 400);
  }

  private async changePage(delta: number) {
    this.page = Math.max(1, this.page + delta);
    await this.loadPosts();
  }

  private get filteredSources() {
    return this.filterChannelId
      ? this.sources.filter((s) => s.channelId === this.filterChannelId)
      : this.sources;
  }

  private timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  render() {
    const totalPages = Math.ceil(this.total / this.pageSize);

    return (
      <div>
        {/* Header */}
        <div class="flex items-center justify-between mb-6">
          <h1 class="text-2xl font-bold tracking-tight text-white">Collected Posts</h1>
          <div class="flex items-center gap-3">
            {this.channels.length > 0 && (
              <div class="relative">
                <select
                  class="appearance-none bg-neutral-800 border border-neutral-700 text-neutral-300 text-sm rounded-lg pl-3 pr-8 py-2 focus:outline-none focus:border-neutral-500 cursor-pointer"
                  onChange={(e) => {
                    const val = (e.target as HTMLSelectElement).value;
                    this.filterChannelId = val ? Number(val) : null;
                    this.filterSourceId = null;
                    this.page = 1;
                    this.loadPosts();
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

            {this.sources.length > 0 && (
              <div class="relative">
                <select
                  class="appearance-none bg-neutral-800 border border-neutral-700 text-neutral-300 text-sm rounded-lg pl-3 pr-8 py-2 focus:outline-none focus:border-neutral-500 cursor-pointer"
                  onChange={(e) => {
                    const val = (e.target as HTMLSelectElement).value;
                    this.filterSourceId = val ? Number(val) : null;
                    this.page = 1;
                    this.loadPosts();
                  }}
                >
                  <option value="" selected={!this.filterSourceId}>All Sources</option>
                  {this.filteredSources.map((s) => (
                    <option value={s.id} selected={this.filterSourceId === s.id}>{s.name}</option>
                  ))}
                </select>
                <span class="material-icons-outlined text-base absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none">expand_more</span>
              </div>
            )}

            <span class="px-3 py-1 rounded-full text-xs font-semibold border border-neutral-600 text-neutral-400">{this.total} total</span>
          </div>
        </div>

        {/* Search */}
        <div class="relative w-full max-w-md mb-6">
          <span class="material-icons-outlined text-base absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">search</span>
          <input
            class="w-full bg-neutral-800 border border-neutral-700 text-neutral-200 placeholder:text-neutral-500 text-sm rounded-lg pl-10 pr-4 py-2.5 focus:outline-none focus:border-neutral-500 transition-colors"
            type="text"
            placeholder="Search posts by content or title..."
            value={this.searchQuery}
            onInput={(e) => this.onSearchInput((e.target as HTMLInputElement).value)}
          />
        </div>

        {/* Content */}
        {this.loading ? (
          <div class="flex justify-center p-12">
            <span class="material-icons-outlined text-3xl text-indigo-500 animate-spin">progress_activity</span>
          </div>
        ) : this.posts.length === 0 ? (
          <div class="flex flex-col items-center justify-center p-16 text-center border border-dashed border-neutral-700 rounded-xl">
            <span class="text-4xl mb-3 opacity-40">📥</span>
            <p class="text-neutral-500 font-medium">
              {this.searchQuery ? "No posts match your search." : "No posts collected yet. Add sources and wait for the pipeline to run."}
            </p>
          </div>
        ) : (
          <div class="flex flex-col gap-6">
            <div class="flex flex-col gap-3">
              {this.posts.map((post) => {
                const expanded = this.expandedId === post.id;
                const isLong = post.content.length > 250;

                return (
                  <div class="rounded-xl bg-neutral-800/40 border border-neutral-700/60 hover:border-neutral-600 transition-colors overflow-hidden" key={post.id}>
                    {/* Header row */}
                    <div class="flex items-center justify-between px-5 py-3 border-b border-neutral-700/30">
                      <div class="flex items-center gap-2.5">
                        {/* Status badge */}
                        <span class={`px-2 py-0.5 rounded text-[11px] font-semibold ${post.processed ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"}`}>
                          {post.processed ? "processed" : "pending"}
                        </span>

                        {/* Channel badge */}
                        {post.source?.channel && (
                          <span class="inline-flex items-center gap-1 text-[10px] font-medium text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full">
                            📢 {post.source.channel.name}
                          </span>
                        )}

                        {/* Source badge */}
                        {post.source && (
                          <span class="inline-flex items-center gap-1 text-[10px] font-medium text-neutral-400 bg-neutral-700/50 px-2 py-0.5 rounded-full">
                            {post.source.type === "telegram" ? "📱" : "📡"} {post.source.name}
                          </span>
                        )}
                      </div>

                      <div class="flex items-center gap-3">
                        <span class="text-xs text-neutral-600 font-mono">#{post.id}</span>
                        <span class="text-xs text-neutral-500" title={new Date(post.collectedAt).toLocaleString()}>
                          {new Date(post.collectedAt).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {/* Content area */}
                    <div
                      class={`px-5 py-4 ${isLong ? "cursor-pointer hover:bg-neutral-700/20 transition-colors" : ""}`}
                      onClick={() => { if (isLong) this.expandedId = expanded ? null : post.id; }}
                    >
                      {post.title && (
                        <h3 class="font-semibold text-white text-base leading-snug mb-2">{post.title}</h3>
                      )}

                      <p class={`text-sm text-neutral-400 leading-relaxed whitespace-pre-wrap ${!expanded && isLong ? "line-clamp-3" : ""}`}>
                        {post.content}
                      </p>

                      {isLong && (
                        <button
                          class="mt-2 text-[11px] font-semibold text-neutral-500 hover:text-neutral-300 tracking-wider uppercase transition-colors"
                          onClick={(e) => { e.stopPropagation(); this.expandedId = expanded ? null : post.id; }}
                        >
                          {expanded ? "▾ Show less" : "▸ Show full text"}
                        </button>
                      )}
                    </div>

                    {/* Footer */}
                    {post.url && (
                      <div class="px-5 py-2.5 border-t border-neutral-700/30">
                        <a href={post.url} target="_blank" rel="noopener" class="text-xs font-medium text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors">
                          Source link
                          <span class="material-icons-outlined text-xs">open_in_new</span>
                        </a>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div class="flex justify-center">
                <div class="flex items-center gap-1 bg-neutral-800 rounded-lg border border-neutral-700 p-1">
                  <button
                    class="rounded-md py-1.5 px-3 text-xs font-medium text-neutral-400 hover:text-white hover:bg-neutral-700 transition-colors disabled:opacity-30 disabled:pointer-events-none"
                    disabled={this.page <= 1}
                    onClick={() => this.changePage(-1)}
                  >
                    « Prev
                  </button>
                  <span class="px-3 py-1.5 text-xs font-medium text-neutral-300">
                    Page {this.page} of {totalPages}
                  </span>
                  <button
                    class="rounded-md py-1.5 px-3 text-xs font-medium text-neutral-400 hover:text-white hover:bg-neutral-700 transition-colors disabled:opacity-30 disabled:pointer-events-none"
                    disabled={this.page >= totalPages}
                    onClick={() => this.changePage(1)}
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
}
