import Parser from "rss-parser";
import type { RssSourceConfig } from "@curator/shared";

interface CollectedRssItem {
  id: string;
  title: string;
  content: string;
  url: string;
  date: string;
  author: string | null;
}

/**
 * Collects posts from RSS feeds using rss-parser.
 */
export class RssCollector {
  private parser = new Parser();

  async collect(config: RssSourceConfig): Promise<CollectedRssItem[]> {
    try {
      const feed = await this.parser.parseURL(config.feedUrl);

      return (feed.items || []).map((item) => ({
        id: item.guid || item.link || item.title || "",
        title: item.title || "",
        content: item.contentSnippet || item.content || item.summary || "",
        url: item.link || "",
        date: item.pubDate || item.isoDate || "",
        author: item.creator || item.author || null,
      }));
    } catch (err) {
      console.error(`[RssCollector] Error fetching ${config.feedUrl}:`, err);
      throw err;
    }
  }
}
