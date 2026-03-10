import { GoogleGenAI } from "@google/genai";
import { PromptManager } from "./PromptManager.js";
import { AiUsageTracker } from "./AiUsageTracker.js";

const RATE_LIMIT_DELAY_MS = 4_000; // ~15 RPM (free tier safe)

interface FilterRule {
  type: string;
  value: string;
  sourceName?: string;
}

/**
 * AI service — wraps the LLM provider. Currently Gemini, easily swappable.
 */
export class AiService {
  /**
   * Valid JSON escape characters after backslash.
   * Everything else (like \. \! \+ from MarkdownV2) is invalid and must be double-escaped.
   */
  private static readonly VALID_JSON_ESCAPES = new Set(['"', '\\', '/', 'b', 'f', 'n', 'r', 't', 'u']);

  private client: GoogleGenAI;
  private promptManager: PromptManager;
  private lastCallTime = 0;
  readonly usageTracker: AiUsageTracker;

  constructor(promptManager: PromptManager, usageTracker?: AiUsageTracker) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set");
    }
    this.client = new GoogleGenAI({ apiKey });
    this.promptManager = promptManager;
    this.usageTracker = usageTracker ?? new AiUsageTracker();
  }

  /**
   * Enforce minimum delay between Gemini API calls.
   */
  private async throttle(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastCallTime;
    if (elapsed < RATE_LIMIT_DELAY_MS) {
      await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS - elapsed));
    }
    this.lastCallTime = Date.now();
  }

  /**
   * Sanitize raw AI response text so it can be safely JSON.parse'd.
   * - Strips markdown code fences (```json ... ```)
   * - Fixes invalid JSON escape sequences (e.g. \. \! \+ from MarkdownV2)
   */
  private sanitizeJsonResponse(raw: string): string {
    let text = raw.trim();

    // Strip markdown code fences
    text = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/, "");

    // Fix invalid JSON escape sequences inside string values.
    // We walk through the string and only fix escapes that are inside JSON strings.
    let result = "";
    let inString = false;
    let i = 0;
    while (i < text.length) {
      const ch = text[i];

      if (!inString) {
        if (ch === '"') inString = true;
        result += ch;
        i++;
      } else {
        // Inside a JSON string
        if (ch === '\\') {
          const next = text[i + 1];
          if (next === undefined) {
            result += ch;
            i++;
          } else if (AiService.VALID_JSON_ESCAPES.has(next)) {
            // Valid escape — keep as-is
            result += ch + next;
            i += 2;
            // For \uXXXX, consume the 4 hex digits too
            if (next === 'u') {
              result += text.slice(i, i + 4);
              i += 4;
            }
          } else {
            // Invalid escape like \. \! \+ — double-escape it
            result += '\\\\' + next;
            i += 2;
          }
        } else if (ch === '"') {
          inString = false;
          result += ch;
          i++;
        } else {
          result += ch;
          i++;
        }
      }
    }

    return result;
  }

  /**
   * Extract token usage from Gemini response and record it.
   */
  private recordUsage(model: string, response: { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } }): void {
    const usage = response.usageMetadata;
    const promptTokens = usage?.promptTokenCount ?? 0;
    const completionTokens = usage?.candidatesTokenCount ?? 0;
    this.usageTracker.record(model, promptTokens, completionTokens);
  }

  /**
   * Filter a batch of collected posts for relevance using AI.
   * Passes user-defined filter rules (include/exclude keywords, exclude authors)
   * directly to the LLM so it can handle semantic matching (word forms, synonyms).
   */
  async filterPosts(
    posts: { id: number; content: string; title?: string | null }[],
    filters: FilterRule[],
    systemPrompt?: string,
  ): Promise<number[]> {
    const postsText = posts
      .map((p) => `[ID: ${p.id}] ${p.title ? p.title + ": " : ""}${p.content}`)
      .join("\n---\n");

    // Format filter rules for the prompt
    let filterRulesText: string;
    if (filters.length === 0) {
      filterRulesText = "No user-defined filter rules. Select based on general relevance only.";
    } else {
      filterRulesText = filters
        .map((f) => {
          const scope = f.sourceName ? ` (only for source "${f.sourceName}")` : " (global — all sources)";
          return `- **${f.type}**: "${f.value}"${scope}`;
        })
        .join("\n");
    }

    const systemPromptText = systemPrompt
      ? `## MANDATORY Channel Topic Scope\n\n**ONLY accept posts that directly match this topic:** ${systemPrompt}\n\nPosts that are only tangentially related MUST be rejected.`
      : "";

    const { text, meta } = this.promptManager.render("filter-posts", {
      posts: postsText,
      filterRules: filterRulesText,
      systemPrompt: systemPromptText,
    });

    const model = meta.model || "gemini-3-flash-preview";
    await this.throttle();
    const response = await this.client.models.generateContent({
      model,
      contents: text,
      config: {
        temperature: meta.temperature ?? 0.3,
        responseMimeType: "application/json",
      },
    });

    this.recordUsage(model, response);
    const raw = response.text?.trim() || "[]";

    try {
      const sanitized = this.sanitizeJsonResponse(raw);
      const result = JSON.parse(sanitized);
      if (Array.isArray(result)) {
        return result.map(Number).filter((n) => !isNaN(n));
      }
      return [];
    } catch (err) {
      console.error("[AiService] Failed to parse filter response:", err instanceof Error ? err.message : err, raw.slice(0, 300));
      return [];
    }
  }

  /**
   * Rewrite a batch of posts, automatically chunking and retrying.
   * Posts are processed in chunks of BATCH_SIZE to avoid output truncation.
   * Any posts not returned are retried up to MAX_RETRIES times.
   */
  async rewritePosts(
    posts: { id: number; content: string; title?: string | null }[],
    language = "ru",
    systemPrompt = "",
  ): Promise<Map<number, string>> {
    const BATCH_SIZE = 5;
    const MAX_RETRIES = 2;
    const result = new Map<number, string>();

    // Split into chunks
    const chunks: typeof posts[] = [];
    for (let i = 0; i < posts.length; i += BATCH_SIZE) {
      chunks.push(posts.slice(i, i + BATCH_SIZE));
    }

    console.log(`[AiService] Rewriting ${posts.length} posts in ${chunks.length} chunks (batch=${BATCH_SIZE}).`);

    // Process each chunk
    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk = chunks[ci];
      const chunkResult = await this.rewriteChunk(chunk, language, systemPrompt);
      for (const [id, text] of chunkResult) {
        result.set(id, text);
      }
      console.log(`[AiService] Chunk ${ci + 1}/${chunks.length}: got ${chunkResult.size}/${chunk.length} rewrites.`);
    }

    // Retry any missing posts
    let missing = posts.filter((p) => !result.has(p.id));
    for (let retry = 1; retry <= MAX_RETRIES && missing.length > 0; retry++) {
      console.log(`[AiService] Retry ${retry}/${MAX_RETRIES}: ${missing.length} posts still missing rewrites.`);

      const retryChunks: typeof posts[] = [];
      for (let i = 0; i < missing.length; i += BATCH_SIZE) {
        retryChunks.push(missing.slice(i, i + BATCH_SIZE));
      }

      for (const chunk of retryChunks) {
        const chunkResult = await this.rewriteChunk(chunk, language, systemPrompt);
        for (const [id, text] of chunkResult) {
          result.set(id, text);
        }
      }

      missing = posts.filter((p) => !result.has(p.id));
    }

    if (missing.length > 0) {
      console.warn(`[AiService] ${missing.length} posts could not be rewritten after ${MAX_RETRIES} retries: [${missing.map((p) => p.id).join(", ")}]`);
    }

    return result;
  }

  /**
   * Rewrite a single chunk of posts via one AI call.
   */
  private async rewriteChunk(
    posts: { id: number; content: string; title?: string | null }[],
    language: string,
    systemPrompt: string,
  ): Promise<Map<number, string>> {
    const result = new Map<number, string>();

    try {
      const postsText = posts
        .map((p) => `[ID: ${p.id}]\n${p.title ? p.title + "\n" : ""}${p.content}`)
        .join("\n\n===\n\n");

      const { text, meta } = this.promptManager.render("rewrite-post", {
        posts: postsText,
        language,
        systemPrompt: systemPrompt ? `## Additional Instructions\n\n${systemPrompt}` : "",
      });

      const model = meta.model || "gemini-2.0-flash";
      await this.throttle();
      const response = await this.client.models.generateContent({
        model,
        contents: text,
        config: {
          temperature: meta.temperature ?? 0.7,
          responseMimeType: "application/json",
        },
      });

      this.recordUsage(model, response);
      const raw = response.text?.trim() || "[]";

      try {
        const sanitized = this.sanitizeJsonResponse(raw);
        const parsed = JSON.parse(sanitized);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item.id && item.text) {
              result.set(Number(item.id), String(item.text));
            }
          }
        }
      } catch (err) {
        console.error("[AiService] Failed to parse rewrite response:", err instanceof Error ? err.message : err, raw.slice(0, 300));
      }
    } catch (err) {
      console.error(`[AiService] Chunk rewrite failed (${posts.length} posts, IDs: [${posts.map((p) => p.id).join(", ")}]):`, err instanceof Error ? err.message : err);
    }

    return result;
  }
}
