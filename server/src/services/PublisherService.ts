import { Bot } from "grammy";
import { InputFile } from "grammy";
import path from "node:path";

/**
 * Publishes messages to Telegram channels via the Grammy bot.
 */
export class PublisherService {
  constructor(private bot: Bot) {}

  /**
   * Send a message to a Telegram channel/chat.
   * Text is expected to already be in Telegram MarkdownV2 format (from the AI).
   */
  async publish(chatId: string, text: string, imageUrl?: string | null): Promise<void> {

    try {
      if (imageUrl) {
        const filePath = path.resolve("." + imageUrl);
        await this.bot.api.sendPhoto(chatId, new InputFile(filePath), {
          caption: text,
          parse_mode: "MarkdownV2",
        });
        console.log(`[Publisher] Sent photo + message to ${chatId}`);
      } else {
        await this.bot.api.sendMessage(chatId, text, { parse_mode: "MarkdownV2" });
        console.log(`[Publisher] Sent message to ${chatId}`);
      }
    } catch (err) {
      console.error(`[Publisher] Failed to send to ${chatId}:`, err);
      throw err;
    }
  }
}
