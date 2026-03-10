import { Component, h, State } from "@stencil/core";
import { promptsApi } from "../../services/api";

interface PromptItem {
  name: string;
  model: string;
  temperature: number;
  description: string;
  template: string;
}

@Component({
  tag: "page-prompts",
  shadow: false,
})
export class PagePrompts {
  @State() prompts: PromptItem[] = [];
  @State() loading = true;
  @State() editingName: string | null = null;
  @State() editContent = "";
  @State() editModel = "";
  @State() editTemperature = 0.3;
  @State() saving = false;
  @State() message = "";

  async componentWillLoad() {
    await this.reload();
  }

  private async reload() {
    try {
      this.prompts = await promptsApi.list();
    } catch (err) {
      console.error("[Prompts] Load failed:", err);
    } finally {
      this.loading = false;
    }
  }

  private startEditing(prompt: PromptItem) {
    this.editingName = prompt.name;
    this.editContent = prompt.template;
    this.editModel = prompt.model;
    this.editTemperature = prompt.temperature;
    this.message = "";
  }

  private cancelEditing() {
    this.editingName = null;
    this.editContent = "";
    this.editModel = "";
    this.editTemperature = 0.3;
  }

  private async save() {
    if (!this.editingName) return;
    this.saving = true;
    try {
      await promptsApi.update(this.editingName, {
        template: this.editContent,
        model: this.editModel,
        temperature: this.editTemperature,
      });
      this.message = `Prompt "${this.editingName}" saved successfully`;
      this.editingName = null;
      await this.reload();
      setTimeout(() => (this.message = ""), 3000);
    } catch (err) {
      this.message = `Error: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      this.saving = false;
    }
  }

  render() {
    return (
      <div>
        <div class="flex items-center justify-between mb-6">
          <h1 class="text-2xl font-bold tracking-tight text-white">Prompts</h1>
          {this.message && (
            <span class={`text-xs font-medium px-2.5 py-1 rounded-full ${this.message.startsWith("Error") ? "bg-red-500/10 text-red-400" : "bg-green-500/10 text-green-400"}`}>
              {this.message}
            </span>
          )}
        </div>

        {/* Warning */}
        <div class="flex items-start gap-3 px-4 py-3 mb-6 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <span class="material-icons-outlined text-amber-400 text-lg mt-0.5">warning</span>
          <div>
            <p class="text-sm font-medium text-amber-300">Edit with caution</p>
            <p class="text-xs text-amber-400/70 mt-0.5">
              Prompts control AI behavior. Incorrect changes can break filtering and rewriting.
              Keep <code class="bg-amber-500/10 px-1 rounded text-amber-300">{"{{variables}}"}</code> placeholders intact.
            </p>
          </div>
        </div>

        {this.loading ? (
          <div class="flex justify-center p-12">
            <span class="material-icons-outlined text-3xl text-indigo-500 animate-spin">progress_activity</span>
          </div>
        ) : (
          <div class="space-y-4">
            {this.prompts.map((prompt) => {
              const editing = this.editingName === prompt.name;
              const dimmed = this.editingName && !editing;

              return (
                <div
                  class={`rounded-xl border overflow-hidden transition-all duration-200
                    ${editing ? "border-indigo-500/50 ring-1 ring-indigo-500/20" : ""}
                    ${dimmed ? "opacity-30 pointer-events-none" : ""}
                    ${!editing ? "border-neutral-700/60 bg-neutral-800/40" : "bg-neutral-800"}`}
                >
                  {/* Header */}
                  <div class="flex items-center justify-between px-5 py-3 border-b border-neutral-700/40">
                    <div class="flex items-center gap-3">
                      <span class="material-icons-outlined text-lg text-indigo-400">description</span>
                      <div>
                        <span class="text-sm font-semibold text-white">{prompt.name}</span>
                        <span class="text-xs text-neutral-500 ml-2">{prompt.description}</span>
                      </div>
                    </div>
                    <div class="flex items-center gap-2">
                      <span class="text-[10px] font-mono text-neutral-600 bg-neutral-700/30 px-2 py-0.5 rounded">
                        {prompt.model} · temp {prompt.temperature}
                      </span>
                      {!editing && (
                        <button
                          class="rounded-md border border-neutral-600 py-1.5 px-3 text-xs font-medium text-neutral-400 hover:text-neutral-200 hover:border-neutral-500 transition-colors"
                          onClick={() => this.startEditing(prompt)}
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Content */}
                  {editing ? (
                    <div>
                      {/* Model & Temperature */}
                      <div class="grid grid-cols-2 gap-4 px-5 pt-4 pb-2">
                        <div>
                          <label class="block mb-1 text-xs font-medium text-neutral-500">Model</label>
                          <input
                            class="w-full bg-neutral-900 border border-neutral-600 text-neutral-200 text-sm rounded-lg px-3 py-2 font-mono focus:outline-none focus:border-indigo-500 transition-colors"
                            value={this.editModel}
                            onInput={(e) => (this.editModel = (e.target as HTMLInputElement).value)}
                            placeholder="gemini-3-flash-preview"
                          />
                        </div>
                        <div>
                          <label class="block mb-1 text-xs font-medium text-neutral-500">Temperature</label>
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            max="2"
                            class="w-full bg-neutral-900 border border-neutral-600 text-neutral-200 text-sm rounded-lg px-3 py-2 font-mono focus:outline-none focus:border-indigo-500 transition-colors"
                            value={this.editTemperature}
                            onInput={(e) => (this.editTemperature = parseFloat((e.target as HTMLInputElement).value) || 0)}
                          />
                        </div>
                      </div>
                      <textarea
                        class="w-full resize-none min-h-[300px] text-sm p-5 bg-transparent text-neutral-200 focus:outline-none leading-relaxed font-mono"
                        value={this.editContent}
                        onInput={(e) => (this.editContent = (e.target as HTMLTextAreaElement).value)}
                        ref={(el) => {
                          if (el) {
                            el.style.height = "auto";
                            el.style.height = el.scrollHeight + "px";
                          }
                        }}
                      />
                      <div class="flex items-center justify-end gap-2 px-5 py-3 border-t border-neutral-700/40 bg-neutral-800/50">
                        <button
                          class="rounded-md border border-neutral-600 py-2 px-5 text-sm font-medium text-neutral-400 hover:text-neutral-200 hover:border-neutral-500 transition-colors"
                          onClick={() => this.cancelEditing()}
                          disabled={this.saving}
                        >
                          Cancel
                        </button>
                        <button
                          class="rounded-md bg-indigo-600 py-2 px-6 text-sm font-medium text-white hover:bg-indigo-500 transition-colors shadow-sm disabled:opacity-50"
                          onClick={() => this.save()}
                          disabled={this.saving}
                        >
                          {this.saving ? "Saving..." : "Save Changes"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div class="px-5 py-4 cursor-pointer hover:bg-neutral-700/20 transition-colors" onClick={() => this.startEditing(prompt)}>
                      <pre class="whitespace-pre-wrap text-xs leading-relaxed text-neutral-400 font-mono max-h-48 overflow-y-auto">{prompt.template}</pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }
}
