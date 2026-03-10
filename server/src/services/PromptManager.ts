import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = join(__dirname, "..", "prompts");

export interface PromptMeta {
  name: string;
  model?: string;
  temperature?: number;
  description?: string;
}

export interface ParsedPrompt {
  meta: PromptMeta;
  template: string;
}

/**
 * Loads prompt .md files from the prompts/ directory.
 * Each file has YAML frontmatter (model, temperature, description)
 * and a markdown body with {{variable}} placeholders.
 */
export class PromptManager {
  private prompts = new Map<string, ParsedPrompt>();

  constructor() {
    this.loadAll();
  }

  private loadAll(): void {
    const files = readdirSync(PROMPTS_DIR).filter((f) => f.endsWith(".md"));

    for (const file of files) {
      const raw = readFileSync(join(PROMPTS_DIR, file), "utf-8");
      const { data, content } = matter(raw);
      const name = file.replace(/\.md$/, "");

      this.prompts.set(name, {
        meta: {
          name,
          model: data.model,
          temperature: data.temperature,
          description: data.description,
        },
        template: content.trim(),
      });
    }

    console.log(`[PromptManager] Loaded ${this.prompts.size} prompts: ${[...this.prompts.keys()].join(", ")}`);
  }

  /**
   * Get a parsed prompt by name (filename without .md extension).
   */
  get(name: string): ParsedPrompt {
    const prompt = this.prompts.get(name);
    if (!prompt) {
      throw new Error(`Prompt "${name}" not found. Available: ${[...this.prompts.keys()].join(", ")}`);
    }
    return prompt;
  }

  /**
   * Render a prompt template by replacing {{variable}} placeholders.
   */
  render(name: string, variables: Record<string, string>): { text: string; meta: PromptMeta } {
    const prompt = this.get(name);
    let text = prompt.template;

    for (const [key, value] of Object.entries(variables)) {
      text = text.replaceAll(`{{${key}}}`, value);
    }

    return { text, meta: prompt.meta };
  }

  /**
   * Reload all prompts from disk (useful for hot-reloading in dev).
   */
  reload(): void {
    this.prompts.clear();
    this.loadAll();
  }

  /**
   * List all prompts (for the UI).
   */
  listAll(): ParsedPrompt[] {
    return [...this.prompts.values()];
  }

  /**
   * Update a prompt's content and persist to disk.
   */
  update(name: string, body: string, meta?: Partial<PromptMeta>): void {
    const existing = this.get(name);
    const merged = { ...existing.meta, ...meta };

    // Build YAML frontmatter
    const frontmatter = [
      "---",
      `model: ${merged.model || "gemini-3-flash-preview"}`,
      `temperature: ${merged.temperature ?? 0.3}`,
      `description: ${merged.description || name}`,
      "---",
    ].join("\n");

    const content = `${frontmatter}\n\n${body.trim()}\n`;

    // Write to disk
    writeFileSync(join(PROMPTS_DIR, `${name}.md`), content, "utf-8");

    // Reload in memory
    this.prompts.set(name, {
      meta: {
        name,
        model: merged.model,
        temperature: merged.temperature,
        description: merged.description,
      },
      template: body.trim(),
    });

    console.log(`[PromptManager] Updated prompt "${name}"`);
  }
}
