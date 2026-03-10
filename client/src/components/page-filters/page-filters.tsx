import { Component, h, State } from "@stencil/core";
import type { Filter, FilterType, Source } from "@curator/shared";
import { filtersApi, sourcesApi } from "../../services/api";

@Component({
  tag: "page-filters",
  shadow: false,
})
export class PageFilters {
  @State() filters: Filter[] = [];
  @State() sources: Source[] = [];
  @State() loading = true;
  @State() showForm = false;

  @State() formType: FilterType = "include_keyword";
  @State() formValue = "";
  @State() formSourceId: number | null = null;

  async componentWillLoad() {
    const [filters, sources] = await Promise.all([filtersApi.list(), sourcesApi.list()]);
    this.filters = filters;
    this.sources = sources;
    this.loading = false;
  }

  private async handleSubmit(e: Event) {
    e.preventDefault();
    try {
      await filtersApi.create({
        type: this.formType,
        value: this.formValue,
        sourceId: this.formSourceId,
      });
      this.formValue = "";
      this.filters = await filtersApi.list();
    } catch (err) {
      console.error("Failed to create filter:", err);
    }
  }

  private async deleteFilter(id: number) {
    try {
      await filtersApi.delete(id);
      this.filters = await filtersApi.list();
    } catch (err) {
      console.error("Failed to delete filter:", err);
    }
  }

  private typeColor(type: FilterType): string {
    switch (type) {
      case "include_keyword": return "bg-emerald-500/15 text-emerald-400 border-emerald-500/20";
      case "exclude_keyword": return "bg-red-500/15 text-red-400 border-red-500/20";
      case "exclude_author": return "bg-amber-500/15 text-amber-400 border-amber-500/20";
    }
  }

  render() {
    return (
      <div>
        <div class="flex items-center justify-between mb-8">
          <h1 class="text-2xl font-bold tracking-tight text-white">Filters</h1>
          <button
            class="rounded-md bg-indigo-600 py-2 px-5 text-sm font-medium text-white shadow-md hover:bg-indigo-500 transition-all"
            onClick={() => (this.showForm = !this.showForm)}
          >
            {this.showForm ? "Cancel" : "+ Add Filter"}
          </button>
        </div>

        {this.showForm && (
          <form class="rounded-xl bg-neutral-800 border border-neutral-700 p-6 mb-8" onSubmit={(e) => this.handleSubmit(e)}>
            <h3 class="text-lg font-semibold text-white mb-5">New Filter</h3>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
              <div>
                <label class="block mb-1.5 text-sm font-medium text-neutral-400">Type</label>
                <div class="relative">
                  <select
                    class="w-full appearance-none bg-neutral-900 border border-neutral-600 text-neutral-200 text-sm rounded-lg pl-3 pr-8 py-2.5 cursor-pointer focus:outline-none focus:border-neutral-400 transition-colors"
                    onChange={(e) => (this.formType = (e.target as HTMLSelectElement).value as FilterType)}
                  >
                    <option value="include_keyword" selected={this.formType === "include_keyword"}>Include Keyword</option>
                    <option value="exclude_keyword" selected={this.formType === "exclude_keyword"}>Exclude Keyword</option>
                    <option value="exclude_author" selected={this.formType === "exclude_author"}>Exclude Author</option>
                  </select>
                  <span class="material-icons-outlined text-base absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none">expand_more</span>
                </div>
              </div>
              <div>
                <label class="block mb-1.5 text-sm font-medium text-neutral-400">Value</label>
                <input
                  class="w-full bg-neutral-900 border border-neutral-600 text-neutral-200 placeholder:text-neutral-500 text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-neutral-400 transition-colors"
                  placeholder="keyword or author"
                  value={this.formValue}
                  onInput={(e) => (this.formValue = (e.target as HTMLInputElement).value)}
                />
              </div>
              <div>
                <label class="block mb-1.5 text-sm font-medium text-neutral-400">Source (optional)</label>
                <div class="relative">
                  <select
                    class="w-full appearance-none bg-neutral-900 border border-neutral-600 text-neutral-200 text-sm rounded-lg pl-3 pr-8 py-2.5 cursor-pointer focus:outline-none focus:border-neutral-400 transition-colors"
                    onChange={(e) => {
                      const v = (e.target as HTMLSelectElement).value;
                      this.formSourceId = v ? Number(v) : null;
                    }}
                  >
                    <option value="">All sources (global)</option>
                    {this.sources.map((s) => <option value={s.id}>{s.name}</option>)}
                  </select>
                  <span class="material-icons-outlined text-base absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none">expand_more</span>
                </div>
              </div>
            </div>
            <div class="flex justify-end">
              <button type="submit" class="rounded-md bg-indigo-600 py-2 px-6 text-sm font-medium text-white hover:bg-indigo-500 transition-colors shadow-sm">Add Filter</button>
            </div>
          </form>
        )}

        {this.loading ? (
          <div class="flex justify-center p-12">
            <span class="material-icons-outlined text-3xl text-indigo-500 animate-spin">progress_activity</span>
          </div>
        ) : this.filters.length === 0 ? (
          <div class="flex flex-col items-center justify-center p-16 text-center border border-dashed border-neutral-700 rounded-xl">
            <span class="text-4xl mb-3 opacity-40">🔍</span>
            <p class="text-neutral-500 font-medium">No filters yet. Add filters to control which posts make it through.</p>
          </div>
        ) : (
          <div class="flex flex-col gap-2">
            {this.filters.map((filter) => (
              <div class="rounded-xl bg-neutral-800/40 border border-neutral-700/60 hover:border-neutral-600 transition-colors p-4 flex items-center justify-between" key={filter.id}>
                <div class="flex flex-wrap items-center gap-3">
                  <span class={`px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${this.typeColor(filter.type)}`}>
                    {filter.type.replace(/_/g, " ")}
                  </span>
                  <span class="font-semibold text-neutral-200">{filter.value}</span>
                  {(filter as unknown as Record<string, unknown>).source && (
                    <span class="text-xs text-neutral-500 bg-neutral-700/50 px-2 py-0.5 rounded">
                      on {((filter as unknown as Record<string, unknown>).source as Record<string, string>).name}
                    </span>
                  )}
                </div>
                <button
                  class="rounded-md border border-transparent py-1 px-3 text-xs text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  onClick={() => this.deleteFilter(filter.id)}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
}
