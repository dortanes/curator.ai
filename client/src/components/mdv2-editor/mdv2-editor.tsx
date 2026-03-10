import { Component, h, Prop, Event, EventEmitter, State, Element } from "@stencil/core";

/**
 * Minimal WYSIWYG editor for Telegram MarkdownV2 posts.
 * Renders formatted text via contenteditable, syncs back to MarkdownV2 string.
 */
@Component({
  tag: "mdv2-editor",
  shadow: false,
})
export class Mdv2Editor {
  @Element() el!: HTMLElement;

  /** Current value in MarkdownV2 format */
  @Prop() value = "";

  /** Emits new MarkdownV2 string on every change */
  @Event() mdv2Change!: EventEmitter<string>;

  @State() hasSelection = false;
  @State() toolbarTop = 0;
  @State() toolbarLeft = 0;
  @State() showToolbar = false;
  @State() showLinkInput = false;
  @State() linkUrl = "";

  private editorEl?: HTMLDivElement;
  private hideTimer?: ReturnType<typeof setTimeout>;

  componentDidLoad() {
    if (this.editorEl) {
      this.editorEl.innerHTML = this.mdv2ToHtml(this.value);
    }
    document.addEventListener("selectionchange", this.onSelectionChange);
  }

  disconnectedCallback() {
    document.removeEventListener("selectionchange", this.onSelectionChange);
  }

  /* ── MarkdownV2 → HTML ─────────────── */

  private mdv2ToHtml(md: string): string {
    let html = this.escapeHtml(md);

    // Bold: *text*
    html = html.replace(/\*([^*]+)\*/g, "<b>$1</b>");
    // Italic: _text_
    html = html.replace(/_([^_]+)_/g, "<i>$1</i>");
    // Underline: __text__
    html = html.replace(/__([^_]+)__/g, "<u>$1</u>");
    // Strikethrough: ~text~
    html = html.replace(/~([^~]+)~/g, "<s>$1</s>");
    // Links: [text](url)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-indigo-400 underline" target="_blank">$1</a>');
    // Remove MarkdownV2 escapes: \. \! etc
    html = html.replace(/\\([_*[\]()~`>#+\-=|{}.!])/g, "$1");
    // Newlines
    html = html.replace(/\n/g, "<br>");

    return html;
  }

  /* ── HTML → MarkdownV2 ──────────────── */

  private htmlToMdv2(html: string): string {
    const div = document.createElement("div");
    div.innerHTML = html;
    return this.nodeToMdv2(div);
  }

  private nodeToMdv2(node: Node): string {
    let result = "";
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        result += this.escapeMdv2(child.textContent || "");
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        const tag = el.tagName.toLowerCase();
        const inner = this.nodeToMdv2(el);

        switch (tag) {
          case "b":
          case "strong":
            result += `*${inner}*`;
            break;
          case "i":
          case "em":
            result += `_${inner}_`;
            break;
          case "u":
            result += `__${inner}__`;
            break;
          case "s":
          case "strike":
          case "del":
            result += `~${inner}~`;
            break;
          case "a": {
            const href = el.getAttribute("href") || "";
            result += `[${inner}](${href})`;
            break;
          }
          case "br":
            result += "\n";
            break;
          case "div":
          case "p":
            // Block elements add newlines
            if (result && !result.endsWith("\n")) result += "\n";
            result += inner;
            if (!inner.endsWith("\n")) result += "\n";
            break;
          default:
            result += inner;
        }
      }
    }
    return result;
  }

  private escapeMdv2(text: string): string {
    return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  /* ── Toolbar / selection ────────────── */

  private onSelectionChange = () => {
    const sel = window.getSelection();
    if (
      !sel ||
      sel.isCollapsed ||
      !sel.rangeCount ||
      !this.editorEl?.contains(sel.anchorNode)
    ) {
      // Delay hiding so toolbar clicks register
      if (this.hideTimer) clearTimeout(this.hideTimer);
      if (this.showLinkInput) return; // don't hide while entering a link URL
      this.hideTimer = setTimeout(() => {
        this.showToolbar = false;
        this.showLinkInput = false;
      }, 200);
      return;
    }

    if (this.hideTimer) clearTimeout(this.hideTimer);

    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const editorRect = this.editorEl!.getBoundingClientRect();

    this.toolbarTop = rect.top - editorRect.top - 42;
    this.toolbarLeft = Math.max(0, rect.left - editorRect.left + rect.width / 2 - 100);
    this.showToolbar = true;
  };

  private execFormat(cmd: string) {
    document.execCommand(cmd, false);
    this.emitChange();
    this.editorEl?.focus();
  }

  private insertLink() {
    if (!this.linkUrl.trim()) return;
    document.execCommand("createLink", false, this.linkUrl.trim());
    // Style the link
    const sel = window.getSelection();
    if (sel?.anchorNode) {
      const link = (sel.anchorNode as HTMLElement).closest?.("a") || 
                   (sel.anchorNode.parentElement as HTMLElement)?.closest?.("a");
      if (link) {
        link.className = "text-indigo-400 underline";
        link.setAttribute("target", "_blank");
      }
    }
    this.linkUrl = "";
    this.showLinkInput = false;
    this.emitChange();
    this.editorEl?.focus();
  }

  private emitChange() {
    if (!this.editorEl) return;
    const md = this.htmlToMdv2(this.editorEl.innerHTML);
    // Clean up trailing newlines
    this.mdv2Change.emit(md.replace(/\n+$/, ""));
  }

  private onKeyDown = (e: KeyboardEvent) => {
    // Prevent default formatting commands and handle them ourselves
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case "b":
          e.preventDefault();
          this.execFormat("bold");
          break;
        case "i":
          e.preventDefault();
          this.execFormat("italic");
          break;
        case "u":
          e.preventDefault();
          this.execFormat("underline");
          break;
      }
    }
  };

  /* ── Render ──────────────────────────── */

  render() {
    return (
      <div class="relative">
        {/* Floating toolbar */}
        {this.showToolbar && (
          <div
            class="absolute z-50 flex items-center gap-0.5 rounded-lg bg-neutral-900 border border-neutral-700 shadow-xl px-1 py-0.5"
            style={{
              top: `${this.toolbarTop}px`,
              left: `${this.toolbarLeft}px`,
            }}
            onMouseDown={(e) => e.preventDefault()}
          >
            <button
              class="p-1.5 rounded hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors"
              onClick={() => this.execFormat("bold")}
              title="Bold (Ctrl+B)"
            >
              <span class="material-icons-outlined text-base">format_bold</span>
            </button>
            <button
              class="p-1.5 rounded hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors"
              onClick={() => this.execFormat("italic")}
              title="Italic (Ctrl+I)"
            >
              <span class="material-icons-outlined text-base">format_italic</span>
            </button>
            <button
              class="p-1.5 rounded hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors"
              onClick={() => this.execFormat("underline")}
              title="Underline (Ctrl+U)"
            >
              <span class="material-icons-outlined text-base">format_underlined</span>
            </button>
            <button
              class="p-1.5 rounded hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors"
              onClick={() => this.execFormat("strikeThrough")}
              title="Strikethrough"
            >
              <span class="material-icons-outlined text-base">strikethrough_s</span>
            </button>

            <span class="w-px h-5 bg-neutral-700 mx-0.5"></span>

            {this.showLinkInput ? (
              <div class="flex items-center gap-1 px-1">
                <input
                  class="bg-neutral-800 border border-neutral-600 text-neutral-200 text-xs rounded px-2 py-1 w-44 focus:outline-none focus:border-indigo-500"
                  placeholder="https://..."
                  value={this.linkUrl}
                  onInput={(e) => (this.linkUrl = (e.target as HTMLInputElement).value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); this.insertLink(); }
                    if (e.key === "Escape") { this.showLinkInput = false; this.linkUrl = ""; }
                  }}
                  ref={(el) => el && setTimeout(() => el.focus(), 10)}
                />
                <button
                  class="p-1 rounded hover:bg-neutral-700 text-indigo-400 text-xs"
                  onClick={() => this.insertLink()}
                >
                  <span class="material-icons-outlined text-sm">check</span>
                </button>
              </div>
            ) : (
              <button
                class="p-1.5 rounded hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors"
                onClick={() => (this.showLinkInput = true)}
                title="Insert link"
              >
                <span class="material-icons-outlined text-base">link</span>
              </button>
            )}
          </div>
        )}

        {/* Editor */}
        <div
          class="w-full min-h-[200px] text-sm p-5 bg-transparent text-neutral-200 focus:outline-none leading-relaxed cursor-text mdv2-editor-content"
          contentEditable
          ref={(el) => (this.editorEl = el ?? undefined)}
          onInput={() => this.emitChange()}
          onKeyDown={this.onKeyDown}
        ></div>
      </div>
    );
  }
}
