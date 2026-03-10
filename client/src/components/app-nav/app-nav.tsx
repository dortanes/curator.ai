import { Component, h, Prop } from "@stencil/core";

@Component({
  tag: "app-nav",
  shadow: false,
})
export class AppNav {
  @Prop() currentPath = "/";

  private links = [
    { path: "/", label: "Dashboard", icon: "📊" },
    { path: "/queue", label: "Queue", icon: "📝" },
    { path: "/posts", label: "Collected Posts", icon: "📥" },
    { path: "/sources", label: "Sources", icon: "🔗" },
    { path: "/filters", label: "Filters", icon: "🔍" },
    { path: "/prompts", label: "Prompts", icon: "📄" },
    { path: "/channels", label: "Channels", icon: "📢" },
    { path: "/logs", label: "Logs", icon: "📋" },
  ];

  render() {
    return (
      <nav class="fixed left-0 top-0 bottom-0 w-60 bg-neutral-950 border-r border-neutral-800 flex flex-col z-50">
        <div class="flex items-center gap-3 px-5 py-6">
          <span class="text-xl">✨</span>
          <span class="text-lg font-bold tracking-tight text-white">Curator.ai</span>
        </div>
        
        <div class="flex-1 px-3 flex flex-col gap-0.5">
          {this.links.map((link) => {
            const isActive = this.currentPath === link.path;
            return (
              <a 
                href={`#${link.path}`} 
                class={`flex items-center gap-3 py-2.5 px-3 rounded-lg text-sm font-medium transition-all duration-150
                  ${isActive 
                    ? "bg-indigo-500/10 text-indigo-400 border-l-2 border-indigo-500 -ml-px" 
                    : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/60"}`}
              >
                <span class="text-base w-5 text-center">{link.icon}</span>
                <span>{link.label}</span>
              </a>
            );
          })}
        </div>

        <div class="px-5 py-4">
          <span class="text-[11px] font-medium text-neutral-600 tracking-wider uppercase">v0.1.0 MVP</span>
        </div>
      </nav>
    );
  }
}
