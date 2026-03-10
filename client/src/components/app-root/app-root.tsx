import { Component, h, State } from "@stencil/core";

@Component({
  tag: "app-root",
  shadow: false,
})
export class AppRoot {
  @State() currentPath = "/";

  componentWillLoad() {
    this.currentPath = window.location.hash.slice(1) || "/";
    window.addEventListener("hashchange", () => {
      this.currentPath = window.location.hash.slice(1) || "/";
    });
  }

  private renderPage() {
    switch (this.currentPath) {
      case "/sources": return <page-sources />;
      case "/filters": return <page-filters />;
      case "/queue": return <page-queue />;
      case "/posts": return <page-posts />;
      case "/channels": return <page-channels />;
      case "/prompts": return <page-prompts />;
      default: return <page-dashboard />;
    }
  }

  render() {
    return (
      <div class="flex min-h-screen bg-neutral-900">
        <app-nav currentPath={this.currentPath} />
        <main class="flex-1 ml-60 p-8 max-w-[1400px]">
          {this.renderPage()}
        </main>
      </div>
    );
  }
}
