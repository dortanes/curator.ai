import { Component, h, State } from "@stencil/core";
import type { Channel } from "@curator/shared";
import { channelsApi } from "../../services/api";

@Component({
  tag: "page-channels",
  shadow: false,
})
export class PageChannels {
  @State() channels: Channel[] = [];
  @State() loading = true;
  @State() showForm = false;
  @State() formName = "";
  @State() formChatId = "";
  @State() formLanguage = "en";
  @State() formSystemPrompt = "";
  @State() formFilterSystemPrompt = "";
  @State() editingId: number | null = null;

  async componentWillLoad() {
    await this.loadChannels();
  }

  private async loadChannels() {
    try {
      this.channels = await channelsApi.list();
    } catch (err) {
      console.error("Failed to load channels:", err);
    } finally {
      this.loading = false;
    }
  }

  private resetForm() {
    this.formName = "";
    this.formChatId = "";
    this.formLanguage = "en";
    this.formSystemPrompt = "";
    this.formFilterSystemPrompt = "";
    this.editingId = null;
    this.showForm = false;
  }

  private async handleSubmit(e: Event) {
    e.preventDefault();
    try {
      if (this.editingId) {
        await channelsApi.update(this.editingId, {
          name: this.formName,
          telegramChatId: this.formChatId,
          language: this.formLanguage,
          systemPrompt: this.formSystemPrompt,
          filterSystemPrompt: this.formFilterSystemPrompt,
        });
      } else {
        await channelsApi.create({
          name: this.formName,
          telegramChatId: this.formChatId,
          language: this.formLanguage,
          systemPrompt: this.formSystemPrompt,
          filterSystemPrompt: this.formFilterSystemPrompt,
        });
      }
      this.resetForm();
      await this.loadChannels();
    } catch (err) {
      console.error("Failed to save channel:", err);
    }
  }

  private startEditing(ch: Channel) {
    this.editingId = ch.id;
    this.formName = ch.name;
    this.formChatId = ch.telegramChatId;
    this.formLanguage = ch.language || "en";
    this.formSystemPrompt = ch.systemPrompt || "";
    this.formFilterSystemPrompt = ch.filterSystemPrompt || "";
    this.showForm = true;
  }

  private async deleteChannel(id: number) {
    if (!confirm("Delete this channel and all its sources?")) return;
    try {
      await channelsApi.delete(id);
      await this.loadChannels();
    } catch (err) {
      console.error("Failed to delete channel:", err);
      alert(`Failed to delete channel: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  render() {
    return (
      <div>
        <div class="flex items-center justify-between mb-8">
          <h1 class="text-2xl font-bold tracking-tight text-white">Target Channels</h1>
          <button
            class="rounded-md bg-indigo-600 py-2 px-5 text-sm font-medium text-white shadow-md hover:bg-indigo-500 transition-all"
            onClick={() => {
              if (this.showForm) {
                this.resetForm();
              } else {
                this.showForm = true;
              }
            }}
          >
            {this.showForm ? "Cancel" : "+ Add Channel"}
          </button>
        </div>

        {this.showForm && (
          <form class="rounded-xl bg-neutral-800 border border-neutral-700 p-6 mb-8" onSubmit={(e) => this.handleSubmit(e)}>
            <h3 class="text-lg font-semibold text-white mb-5">{this.editingId ? "Edit Channel" : "New Channel"}</h3>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-5 mb-5">
              <div>
                <label class="block mb-1.5 text-sm font-medium text-neutral-400">Channel Name</label>
                <input
                  class="w-full bg-neutral-900 border border-neutral-600 text-neutral-200 placeholder:text-neutral-500 text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-neutral-400 transition-colors"
                  placeholder="My Channel"
                  value={this.formName}
                  onInput={(e) => (this.formName = (e.target as HTMLInputElement).value)}
                />
              </div>
              <div>
                <label class="block mb-1.5 text-sm font-medium text-neutral-400">Telegram Chat ID</label>
                <input
                  class="w-full bg-neutral-900 border border-neutral-600 text-neutral-200 placeholder:text-neutral-500 text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-neutral-400 transition-colors"
                  placeholder="@mychannel or -10012..."
                  value={this.formChatId}
                  onInput={(e) => (this.formChatId = (e.target as HTMLInputElement).value)}
                />
              </div>
              <div>
                <label class="block mb-1.5 text-sm font-medium text-neutral-400">Language</label>
                <div class="relative">
                  <select
                    class="w-full appearance-none bg-neutral-900 border border-neutral-600 text-neutral-200 text-sm rounded-lg pl-3 pr-8 py-2.5 cursor-pointer focus:outline-none focus:border-neutral-400 transition-colors"
                    onChange={(e) => (this.formLanguage = (e.target as HTMLSelectElement).value)}
                  >
                    <option value="en" selected={this.formLanguage === "en"}>English</option>
                    <option value="ru" selected={this.formLanguage === "ru"}>Русский</option>
                    <option value="de" selected={this.formLanguage === "de"}>Deutsch</option>
                    <option value="fr" selected={this.formLanguage === "fr"}>Français</option>
                    <option value="es" selected={this.formLanguage === "es"}>Español</option>
                    <option value="uk" selected={this.formLanguage === "uk"}>Українська</option>
                    <option value="kk" selected={this.formLanguage === "kk"}>Қазақша</option>
                  </select>
                  <span class="material-icons-outlined text-base absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none">expand_more</span>
                </div>
              </div>
            </div>
            <div class="mb-5">
              <label class="block mb-1.5 text-sm font-medium text-neutral-400">Rewrite Style Prompt</label>
              <textarea
                class="w-full bg-neutral-900 border border-neutral-600 text-neutral-200 placeholder:text-neutral-500 text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-neutral-400 transition-colors h-24 resize-none"
                placeholder="E.g.: Write in a sarcastic tone, avoid technical jargon, use many emojis..."
                value={this.formSystemPrompt}
                onInput={(e) => (this.formSystemPrompt = (e.target as HTMLTextAreaElement).value)}
              />
            </div>
            <div class="mb-6">
              <label class="block mb-1.5 text-sm font-medium text-neutral-400">Filter System Prompt</label>
              <textarea
                class="w-full bg-neutral-900 border border-neutral-600 text-neutral-200 placeholder:text-neutral-500 text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-neutral-400 transition-colors h-24 resize-none"
                placeholder="E.g.: Focus only on AI/ML news, skip crypto and politics..."
                value={this.formFilterSystemPrompt}
                onInput={(e) => (this.formFilterSystemPrompt = (e.target as HTMLTextAreaElement).value)}
              />
            </div>
            <div class="flex justify-end">
              <button type="submit" class="rounded-md bg-indigo-600 py-2 px-6 text-sm font-medium text-white hover:bg-indigo-500 transition-colors shadow-sm">
                {this.editingId ? "Save Changes" : "Create Channel"}
              </button>
            </div>
          </form>
        )}

        {this.loading ? (
          <div class="flex justify-center p-12">
            <span class="material-icons-outlined text-3xl text-indigo-500 animate-spin">progress_activity</span>
          </div>
        ) : this.channels.length === 0 ? (
          <div class="flex flex-col items-center justify-center p-16 text-center border border-dashed border-neutral-700 rounded-xl">
            <span class="text-4xl mb-3 opacity-40">📢</span>
            <p class="text-neutral-500 font-medium">No target channels. Add a channel where the bot will publish posts.</p>
          </div>
        ) : (
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            {this.channels.map((ch) => (
              <div class="rounded-xl bg-neutral-800/50 border border-neutral-700/60 hover:border-neutral-600 transition-colors p-5" key={ch.id}>
                <div class="flex items-start justify-between gap-4">
                  <div class="flex items-start gap-4">
                    <div class="w-11 h-11 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center text-lg shrink-0">📢</div>
                    <div>
                      <h3 class="font-semibold text-white text-base">{ch.name}</h3>
                      <p class="text-neutral-500 text-sm font-mono mt-0.5">{ch.telegramChatId}</p>
                    </div>
                  </div>
                  <div class="flex items-center gap-2 shrink-0">
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border border-neutral-600 text-neutral-400">{ch.language || "en"}</span>
                    <button class="rounded-md border border-transparent py-1 px-2 text-xs text-neutral-500 hover:text-neutral-300 hover:bg-neutral-700 transition-colors" onClick={() => this.startEditing(ch)}>Edit</button>
                    <button class="rounded-md border border-transparent py-1 px-2 text-xs text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition-colors" onClick={() => this.deleteChannel(ch.id)}>Delete</button>
                  </div>
                </div>
                {ch.systemPrompt && (
                  <div class="mt-4 pt-3 border-t border-neutral-700/50">
                    <div class="text-[10px] font-semibold uppercase tracking-wider text-neutral-600 mb-1">System Prompt</div>
                    <p class="text-sm text-neutral-400 italic leading-relaxed line-clamp-2">"{ch.systemPrompt}"</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
}
