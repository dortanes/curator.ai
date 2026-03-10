import { Bot } from "grammy";
import { InputFile } from "grammy";
import path from "node:path";

/**
 * MarkdownV2 special characters that must be escaped BUT are never formatting markers.
 * Characters like * _ ~ ` [ ] ( ) are left alone — they are used for bold/italic/etc.
 * We only auto-escape the "safe" set that never has formatting meaning.
 * Uses negative lookbehind to skip already-escaped characters.
 */
const MDV2_SAFE_ESCAPE = /(?<!\\)([.!\-+=|{}>#])/g;

/**
 * Publishes messages to Telegram channels via the Grammy bot.
 */
export class PublisherService {
  constructor(private bot: Bot) {}

  /**
   * Ensure all MarkdownV2 special characters in plain text are escaped.
   * Preserves already-escaped sequences (e.g. `\.` stays `\.`).
   * Works by escaping any un-escaped special char with a preceding `\`.
   */
  private sanitizeMdV2(text: string): string {
    return text.replace(MDV2_SAFE_ESCAPE, "\\$1");
  }

  /**
   * Send a message to a Telegram channel/chat.
   * Text is expected to already be in Telegram MarkdownV2 format (from the AI).
   * A sanitization pass ensures any missed escapes are fixed before sending.
   */
  async publish(chatId: string, text: string, imageUrl?: string | null): Promise<void> {
    const safeText = this.sanitizeMdV2(text);

    try {
      if (imageUrl) {
        const filePath = path.resolve("." + imageUrl);
        await this.bot.api.sendPhoto(chatId, new InputFile(filePath), {
          caption: safeText,
          parse_mode: "MarkdownV2",
        });
        console.log(`[Publisher] Sent photo + message to ${chatId}`);
      } else {
        await this.bot.api.sendMessage(chatId, safeText, { parse_mode: "MarkdownV2" });
        console.log(`[Publisher] Sent message to ${chatId}`);
      }
    } catch (err) {
      console.error(`[Publisher] Failed to send to ${chatId}:`, err);
      throw err;
    }
  }
}
