import { createHash } from "node:crypto";
import https from "node:https";
import type { TelegramSourceConfig } from "@curator/shared";

interface ScrapedPost {
  id: string;
  text: string;
  date: string;
  views: string;
  mediaUrls: string[];
}

/**
 * Maximum number of pages to fetch per collection cycle.
 * Each page contains ~20 posts.
 */
const MAX_PAGES = 2;
const MAX_POSTS = 30;

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
  text = text.replace(/ {2,}/g, "\n\n");

  // Step 5: Clean up excessive newlines and trailing spaces
  text = text.replace(/[ \t]+$/gm, "");
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}

/**
 * Fetch a page from t.me/s/{channel} with optional `before` param for pagination.
 */
function fetchPage(channel: string, before?: number): Promise<string> {
  let url = `https://t.me/s/${channel}`;
  if (before) {
    url += `?before=${before}`;
  }

  return new Promise((resolve, reject) => {
    const doGet = (targetUrl: string) => {
      https.get(targetUrl, (res) => {
        if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
          return doGet(res.headers.location);
        }
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode} for ${targetUrl}`));
          return;
        }
        const data: Buffer[] = [];
        res.on("data", (chunk) => data.push(chunk));
        res.on("end", () => resolve(Buffer.concat(data).toString()));
        res.on("error", reject);
      }).on("error", reject);
    };
    doGet(url);
  });
}

/**
 * Parse raw HTML from t.me/s/ into post objects.
 * Returns parsed posts and the minimum message ID found (for pagination).
 */
function parsePostsFromHtml(html: string, channel: string): { posts: ScrapedPost[]; minId: number | null } {
  const posts: ScrapedPost[] = [];
  let minId: number | null = null;

  // Split by message wrappers — each div.tgme_widget_message has data-post="channel/123"
  const messageRegex = /data-post="([^"]+)"[\s\S]*?class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?:<div class="tgme_widget_message_footer|<\/div>\s*<\/div>)/g;

  // Simpler approach: extract each message block individually
  const blockRegex = /<div[^>]+class="tgme_widget_message_wrap[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]+class="tgme_widget_message_wrap|<\/section>)/g;
  let blockMatch: RegExpExecArray | null;

  while ((blockMatch = blockRegex.exec(html)) !== null) {
    const block = blockMatch[1];

    // Extract data-post (e.g. "channel/1234")
    const dataPostMatch = block.match(/data-post="([^"]+)"/);
    if (!dataPostMatch) continue;

    const dataPost = dataPostMatch[1]; // e.g. "channelname/1234"
    const msgIdStr = dataPost.split("/").pop() || "";
    const msgId = parseInt(msgIdStr, 10);

    if (!isNaN(msgId)) {
      if (minId === null || msgId < minId) {
        minId = msgId;
      }
    }

    // Skip service messages (pin, join, etc.)
    if (block.includes("tgme_widget_service_strong_text")) continue;

    // Extract message text
    const textMatch = block.match(/class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    const rawText = textMatch ? textMatch[1] : "";
    const text = htmlToText(rawText);

    if (text.length < 10) continue; // skip very short / empty messages

    // Extract datetime
    const datetimeMatch = block.match(/datetime="([^"]+)"/);
    const date = datetimeMatch ? datetimeMatch[1] : new Date().toISOString();

    // Extract views
    const viewsMatch = block.match(/class="tgme_widget_message_views"[^>]*>([^<]+)</);
    const views = viewsMatch ? viewsMatch[1].trim() : "0";

    // Extract media URLs (photos)
    const mediaUrls: string[] = [];
    const photoRegex = /tgme_widget_message_photo_wrap[^>]+style="[^"]*url\('([^']+)'\)/g;
    let photoMatch: RegExpExecArray | null;
    while ((photoMatch = photoRegex.exec(block)) !== null) {
      mediaUrls.push(photoMatch[1]);
    }

    // Extract video URLs
    const videoRegex = /<video[^>]+src="([^"]+)"/g;
    let videoMatch: RegExpExecArray | null;
    while ((videoMatch = videoRegex.exec(block)) !== null) {
      mediaUrls.push(videoMatch[1]);
    }

    const id = dataPost || contentHash(channel, text);

    posts.push({ id, text, date, views, mediaUrls });
  }

  return { posts, minId };
}

/**
 * Scrapes public Telegram channels via t.me/s/ web preview.
 * Supports pagination to collect more than the default ~20 posts.
 * No authentication required.
 */
export class TelegramCollector {
  /**
   * Scrape recent posts from a public Telegram channel.
   * Fetches up to MAX_PAGES pages (~20 posts each) for broader coverage.
   */
  async collect(config: TelegramSourceConfig): Promise<ScrapedPost[]> {
    const channel = config.channelUsername.replace(/^@/, "");
    const allPosts: ScrapedPost[] = [];
    const seenIds = new Set<string>();
    let before: number | undefined;

    for (let page = 0; page < MAX_PAGES; page++) {
      const html = await fetchPage(channel, before);

      // Check if this is a valid channel page
      if (html.includes("tgme_channel_history") === false) {
        if (page === 0) {
          throw new Error(`Invalid or private Telegram channel: ${channel}`);
        }
        break; // No more pages
      }

      const { posts, minId } = parsePostsFromHtml(html, channel);

      if (posts.length === 0) break; // No more posts

      for (const post of posts) {
        if (!seenIds.has(post.id)) {
          seenIds.add(post.id);
          allPosts.push(post);
        }
      }

      // Stop if we already have enough posts
      if (allPosts.length >= MAX_POSTS) break;

      // Set up pagination — load posts before the oldest one we found
      if (minId !== null && minId > 1) {
        before = minId;
      } else {
        break; // Reached the beginning of the channel
      }
    }

    console.log(`[TelegramCollector] Scraped ${allPosts.length} posts from @${channel} (${Math.min(MAX_PAGES, allPosts.length > 0 ? MAX_PAGES : 0)} pages).`);
    return allPosts;
  }
}
