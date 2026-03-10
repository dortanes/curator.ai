import { createHash } from "node:crypto";
import type { TelegramSourceConfig } from "@curator/shared";

interface ScrapedPost {
  id: string;
  text: string;
  date: string;
  views: string;
  mediaUrls: string[];
}

interface RawTelegramItem {
  message_text?: string;
  text?: string;
  message?: string;
  content?: string;
  data_post?: string;
  id?: string;
  messageId?: string;
  date?: string;
  datetime?: string;
  views?: string;
  data_view?: string;
  media?: string[];
}

/**
 * Create a short deterministic hash from text content.
 */
function contentHash(channel: string, text: string): string {
  return createHash("sha256")
    .update(`${channel}:${text}`)
    .digest("hex")
    .slice(0, 16);
}

/**
 * Convert HTML / plain text to readable text preserving line breaks.
 *
 * The Telegram scraper returns message_text as plain text where paragraphs
 * are separated by double-spaces ("  ") rather than \n or <br>. We convert
 * those gaps into proper newlines so the UI can render them with
 * whitespace-pre-wrap.
 */
function htmlToText(html: string): string {
  let text = html;

  // Step 1: Convert HTML break elements to newlines
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/p>/gi, "\n\n");
  text = text.replace(/<\/div>/gi, "\n");

  // Step 2: Strip remaining HTML tags
  text = text.replace(/<[^>]+>/g, "");

  // Step 3: Decode HTML entities
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&quot;/g, "\"");
  text = text.replace(/&#039;/g, "'");
  text = text.replace(/&nbsp;/g, " ");

  // Step 4: Convert double-space paragraph separators to newlines
  // (Telegram scraper uses "  " as paragraph breaks)
  text = text.replace(/ {2,}/g, "\n\n");

  // Step 5: Clean up excessive newlines and trailing spaces
  text = text.replace(/[ \t]+$/gm, "");
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}

/**
 * Scrapes public Telegram channels via the telegram-scraper npm package.
 * No authentication required — uses t.me/s/ web preview.
 */
export class TelegramCollector {
  /**
   * Scrape recent posts from a public Telegram channel.
   * @param config — channel config with username
   */
  async collect(config: TelegramSourceConfig): Promise<ScrapedPost[]> {
    try {
      // telegram-scraper exports `telegram_scraper(channel)` → returns raw HTML/JSON string
      const { telegram_scraper } = await import("telegram-scraper");
      const raw = await telegram_scraper(config.channelUsername);

      // Attempt to parse result — the library returns a string, try JSON parse
      let items: RawTelegramItem[];
      try {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          items = parsed as RawTelegramItem[];
        } else {
          items = [parsed as RawTelegramItem];
        }
      } catch {
        // If not JSON, try to extract posts from HTML-like text
        console.warn(`[TelegramCollector] Non-JSON response from ${config.channelUsername}, parsing as text...`);
        // Split by common separators and create pseudo-posts
        const chunks = raw.split(/\n{2,}/).filter((c: string) => c.trim().length > 20);
        items = chunks.map((text: string): RawTelegramItem => ({
          id: contentHash(config.channelUsername, text),
          text: text.trim(),
          date: new Date().toISOString(),
        }));
      }

      return items.map((item: RawTelegramItem): ScrapedPost => {
        const rawText = item.message_text || item.text || item.message || item.content || "";
        const text = htmlToText(String(rawText));
        const id = String(item.data_post || item.id || item.messageId || contentHash(config.channelUsername, text));
        return {
          id,
          text,
          date: String(item.date || item.datetime || new Date().toISOString()),
          views: String(item.views || item.data_view || "0"),
          mediaUrls: Array.isArray(item.media) ? item.media : [],
        };
      });
    } catch (err) {
      console.error(`[TelegramCollector] Error scraping ${config.channelUsername}:`, err);
      return [];
    }
  }
}
