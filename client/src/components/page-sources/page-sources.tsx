import { Component, h, State } from "@stencil/core";
import type { Source, SourceType, Channel } from "@curator/shared";
import { sourcesApi, channelsApi } from "../../services/api";

@Component({
  tag: "page-sources",
  shadow: false,
})
export class PageSources {
  @State() sources: (Source & { channel?: { id: number; name: string } })[] = [];
  @State() channels: Channel[] = [];
  @State() loading = true;
  @State() showForm = false;
  @State() editingId: number | null = null;

  @State() formType: SourceType = "telegram";
  @State() formName = "";
  @State() formConfig = "";
  @State() formChannelId: number | null = null;
  @State() filterChannelId: number | null = null;

  async componentWillLoad() {
    await Promise.all([this.loadSources(), this.loadChannels()]);
  }

  private async loadSources() {
    try {
      this.sources = await sourcesApi.list() as any;
    } catch (err) {
      console.error("Failed to load sources:", err);
    } finally {
      this.loading = false;
    }
  }

  private async loadChannels() {
    try {
      this.channels = await channelsApi.list();
      if (this.channels.length > 0 && !this.formChannelId) {
        this.formChannelId = this.channels[0].id;
      }
    } catch (err) {
      console.error("Failed to load channels:", err);
    }
  }

  private resetForm() {
    this.formType = "telegram";
    this.formName = "";
    this.formConfig = "";
    this.formChannelId = this.channels.length > 0 ? this.channels[0].id : null;
    this.editingId = null;
    this.showForm = false;
  }

  private async handleSubmit(e: Event) {
    e.preventDefault();
    if (!this.formChannelId) return;

    const config =
      this.formType === "telegram"
        ? { channelUsername: this.formConfig }
        : { feedUrl: this.formConfig };

    try {
      if (this.editingId) {
        await sourcesApi.update(this.editingId, { name: this.formName, config, channelId: this.formChannelId });
      } else {
        await sourcesApi.create({ type: this.formType, name: this.formName, config, channelId: this.formChannelId });
      }
      this.resetForm();
      await this.loadSources();
    } catch (err) {
      console.error("Failed to save source:", err);
    }
  }

  private editSource(source: Source & { channel?: { id: number; name: string } }) {
    this.editingId = source.id;
    this.formType = source.type;
    this.formName = source.name;
    this.formChannelId = source.channelId;
    this.formConfig =
      source.type === "telegram"
        ? (source.config as unknown as Record<string, string>).channelUsername || ""
        : (source.config as unknown as Record<string, string>).feedUrl || "";
    this.showForm = true;
  }

  private async deleteSource(id: number) {
    if (!confirm("Delete this source?")) return;
    try {
      await sourcesApi.delete(id);
      await this.loadSources();
    } catch (err) {
      console.error("Failed to delete source:", err);
    }
  }

  private async toggleSource(source: Source) {
    try {
      await sourcesApi.update(source.id, { enabled: !source.enabled });
      await this.loadSources();
    } catch (err) {
      console.error("Failed to toggle source:", err);
    }
  }

  render() {
    return (
      <div>
        <div class="flex items-center justify-between mb-8">
          <h1 class="text-2xl font-bold tracking-tight text-white">Sources</h1>
          <div class="flex items-center gap-3">
            {this.channels.length > 0 && (
              <div class="relative">
                <select
                  class="appearance-none bg-neutral-800 border border-neutral-700 text-neutral-300 text-sm rounded-lg pl-3 pr-8 py-2 focus:outline-none focus:border-neutral-500 cursor-pointer"
                  onChange={(e) => {
                    const val = (e.target as HTMLSelectElement).value;
                    this.filterChannelId = val ? Number(val) : null;
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
            <button
              class="rounded-md bg-indigo-600 py-2 px-5 text-sm font-medium text-white shadow-md hover:bg-indigo-500 transition-all"
              onClick={() => (this.showForm = !this.showForm)}
            >
              {this.showForm ? "Cancel" : "+ Add Source"}
            </button>
          </div>
        </div>

        {this.showForm && (
          <form class="rounded-xl bg-neutral-800 border border-neutral-700 p-6 mb-8" onSubmit={(e) => this.handleSubmit(e)}>
            <h3 class="text-lg font-semibold text-white mb-5">{this.editingId ? "Edit Source" : "New Source"}</h3>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-5 mb-5">
              <div>
                <label class="block mb-1.5 text-sm font-medium text-neutral-400">Channel</label>
                <div class="relative">
                  <select
                    class="w-full appearance-none bg-neutral-900 border border-neutral-600 text-neutral-200 text-sm rounded-lg pl-3 pr-8 py-2.5 cursor-pointer focus:outline-none focus:border-neutral-400 transition-colors"
                    onChange={(e) => (this.formChannelId = Number((e.target as HTMLSelectElement).value))}
                  >
                    {this.channels.map((ch) => (
                      <option value={ch.id} selected={this.formChannelId === ch.id}>{ch.name}</option>
                    ))}
                  </select>
                  <span class="material-icons-outlined text-base absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none">expand_more</span>
                </div>
              </div>
              <div>
                <label class="block mb-1.5 text-sm font-medium text-neutral-400">Type</label>
                <div class="relative">
                  <select
                    class="w-full appearance-none bg-neutral-900 border border-neutral-600 text-neutral-200 text-sm rounded-lg pl-3 pr-8 py-2.5 cursor-pointer focus:outline-none focus:border-neutral-400 transition-colors"
                    onChange={(e) => (this.formType = (e.target as HTMLSelectElement).value as SourceType)}
                  >
                    <option value="telegram" selected={this.formType === "telegram"}>Telegram Channel</option>
                    <option value="rss" selected={this.formType === "rss"}>RSS Feed</option>
                  </select>
                  <span class="material-icons-outlined text-base absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none">expand_more</span>
                </div>
              </div>
              <div>
                <label class="block mb-1.5 text-sm font-medium text-neutral-400">Name</label>
                <input class="w-full bg-neutral-900 border border-neutral-600 text-neutral-200 placeholder:text-neutral-500 text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-neutral-400 transition-colors" placeholder="My Source" value={this.formName} onInput={(e) => (this.formName = (e.target as HTMLInputElement).value)} />
              </div>
            </div>
            <div class="mb-6">
              <label class="block mb-1.5 text-sm font-medium text-neutral-400">{this.formType === "telegram" ? "Channel Username" : "Feed URL"}</label>
              <input class="w-full bg-neutral-900 border border-neutral-600 text-neutral-200 placeholder:text-neutral-500 text-sm rounded-lg px-3 py-2.5 font-mono focus:outline-none focus:border-neutral-400 transition-colors" placeholder={this.formType === "telegram" ? "durov" : "https://example.com/feed.xml"} value={this.formConfig} onInput={(e) => (this.formConfig = (e.target as HTMLInputElement).value)} />
            </div>
            <div class="flex justify-end">
              <button type="submit" class="rounded-md bg-indigo-600 py-2 px-6 text-sm font-medium text-white hover:bg-indigo-500 transition-colors shadow-sm">
                {this.editingId ? "Update Source" : "Create Source"}
              </button>
            </div>
          </form>
        )}

        {this.loading ? (
          <div class="flex justify-center p-12">
            <span class="material-icons-outlined text-3xl text-indigo-500 animate-spin">progress_activity</span>
          </div>
        ) : this.sources.length === 0 ? (
          <div class="flex flex-col items-center justify-center p-16 text-center border border-dashed border-neutral-700 rounded-xl">
            <span class="text-4xl mb-3 opacity-40">🔗</span>
            <p class="text-neutral-500 font-medium">No sources yet. Add your first source to start collecting posts.</p>
          </div>
        ) : (
          <div class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {(this.filterChannelId
              ? this.sources.filter((s) => s.channelId === this.filterChannelId)
              : this.sources
            ).map((source) => (
              <div class="rounded-xl bg-neutral-800/50 border border-neutral-700/60 hover:border-neutral-600 transition-colors p-5" key={source.id}>
                <div class="flex items-start gap-4 mb-4">
                  <div class={`w-11 h-11 rounded-lg flex items-center justify-center text-lg shrink-0 ${source.type === "telegram" ? "bg-blue-500/10 text-blue-400" : "bg-amber-500/10 text-amber-400"}`}>
                    {source.type === "telegram" ? "📱" : "📡"}
                  </div>
                  <div class="flex-1 min-w-0">
                    <h3 class="font-semibold text-white text-base truncate">{source.name}</h3>
                    <div class="text-neutral-500 text-sm font-mono mt-0.5 break-all line-clamp-1">
                      {source.type === "telegram"
                        ? `@${(source.config as unknown as Record<string, string>).channelUsername}`
                        : (source.config as unknown as Record<string, string>).feedUrl}
                    </div>
                    {source.channel && (
                      <span class="inline-flex items-center gap-1 mt-1.5 text-[10px] font-medium text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full">
                        📢 {source.channel.name}
                      </span>
                    )}
                  </div>
                </div>
                <div class="flex items-center justify-between pt-4 border-t border-neutral-700/40">
                  <button
                    class={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer transition-colors ${source.enabled ? "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25" : "bg-neutral-700/50 text-neutral-500 hover:bg-neutral-700"}`}
                    onClick={() => this.toggleSource(source)}
                  >
                    {source.enabled ? "Active" : "Disabled"}
                  </button>
                  <div class="flex gap-1">
                    <button class="rounded-md border border-transparent py-1 px-2 text-xs text-neutral-500 hover:text-neutral-300 hover:bg-neutral-700 transition-colors" onClick={() => this.editSource(source)}>Edit</button>
                    <button class="rounded-md border border-transparent py-1 px-2 text-xs text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition-colors" onClick={() => this.deleteSource(source.id)}>Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
}
