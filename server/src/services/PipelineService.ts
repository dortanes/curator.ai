import { PrismaClient } from "@prisma/client";
import type { TelegramSourceConfig, RssSourceConfig } from "@curator/shared";
import { AiService } from "./AiService.js";
import { QueueService } from "./QueueService.js";
import { TelegramCollector } from "./collectors/TelegramCollector.js";
import { RssCollector } from "./collectors/RssCollector.js";

/**
 * Orchestrates the full automated pipeline:
 * 1. Collect posts from all enabled sources
 * 2. Apply keyword filters
 * 3. Send to AI for relevance filtering
 * 4. AI rewrites each relevant post
 * 5. Create queue items (drafts)
 */
export class PipelineService {
  private _running = false;
  private _lastError: string | null = null;
  private _stage: string = "idle";
  private _lastRunAt: string | null = null;
  private _collectErrors: { source: string; error: string }[] = [];

  constructor(
    private prisma: PrismaClient,
    private aiService: AiService,
    private queueService: QueueService,
    private telegramCollector: TelegramCollector,
    private rssCollector: RssCollector,
  ) {}

  get running(): boolean {
    return this._running;
  }

  getStatus() {
    return {
      running: this._running,
      lastError: this._lastError,
      lastRunAt: this._lastRunAt,
      stage: this._stage,
      collectErrors: this._collectErrors,
    };
  }

  /**
   * Run the full pipeline for all enabled sources.
   * Returns false if already running (mutex).
   */
  async run(): Promise<boolean> {
    if (this._running) {
      console.log("[Pipeline] Already running, skipping.");
      return false;
    }

    this._running = true;
    this._lastError = null;
    this._stage = "starting";

    try {
      await this.runCycle();
      this._lastRunAt = new Date().toISOString();
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this._lastError = msg;
      console.error("[Pipeline] Cycle failed:", msg);
      return false;
    } finally {
      this._running = false;
      this._stage = "idle";
    }
  }

  private async runCycle(): Promise<void> {
    this._stage = "collecting";
    this._collectErrors = [];
    console.log("[Pipeline] Starting collection cycle...");

    // Get all channels with their sources
    const channels = await this.prisma.channel.findMany({
      include: { sources: { where: { enabled: true } } },
    });

    if (channels.length === 0) {
      console.log("[Pipeline] No channels configured, skipping.");
      return;
    }

    // Step 1: Collect from all sources across all channels
    let totalNew = 0;
    for (const channel of channels) {
      for (const source of (channel as any).sources) {
        try {
          totalNew += await this.collectFromSource({
            id: source.id,
            type: source.type,
            config: source.config as Record<string, unknown>,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[Pipeline] Error collecting from "${source.name}" (channel "${channel.name}"):`, msg);
          this._collectErrors.push({ source: source.name, error: msg });
        }
      }
    }

    console.log(`[Pipeline] Collected ${totalNew} new posts total.`);

    // Step 2: Process per channel
    for (const channel of channels) {
      const sourceIds = ((channel as any).sources as { id: number }[]).map((s) => s.id);
      if (sourceIds.length === 0) continue;

      // Get unprocessed posts for this channel's sources
      const unprocessed = await this.prisma.collectedPost.findMany({
        where: { processed: false, sourceId: { in: sourceIds } },
        orderBy: { collectedAt: "desc" },
        take: 30,
      });

      if (unprocessed.length === 0) {
        console.log(`[Pipeline] No unprocessed posts for channel "${channel.name}", skipping.`);
        continue;
      }

      this._stage = `filtering ${unprocessed.length} posts · ${channel.name}`;
      console.log(`[Pipeline] Channel "${channel.name}": filtering ${unprocessed.length} posts.`);

      // Load filters for this channel's sources (+ global filters)
      const filters = await this.prisma.filter.findMany({
        where: {
          OR: [
            { sourceId: { in: sourceIds } },
            { sourceId: null }, // global filters
          ],
        },
        include: { source: { select: { name: true } } },
      });

      const filterRules = filters.map((f) => ({
        type: f.type,
        value: f.value,
        sourceName: (f as unknown as { source: { name: string } | null }).source?.name,
      }));

      // AI filtering
      const relevantIds = await this.aiService.filterPosts(
        unprocessed.map((p) => ({ id: p.id, content: p.content, title: p.title })),
        filterRules,
        (channel as any).filterSystemPrompt || undefined,
      );

      console.log(`[Pipeline] Channel "${channel.name}": AI selected ${relevantIds.length}/${unprocessed.length} posts.`);

      const relevantPosts = unprocessed.filter((p) => relevantIds.includes(p.id));

      // Rewrite with this channel's language & system prompt
      const channelLanguage = channel.language || "en";
      const channelSystemPrompt = channel.systemPrompt || "";

      const rewrittenIds: number[] = [];

      if (relevantPosts.length > 0) {
        this._stage = `rewriting ${relevantPosts.length} posts · ${channel.name}`;
        console.log(`[Pipeline] Channel "${channel.name}": rewriting ${relevantPosts.length} posts (lang=${channelLanguage}).`);

        try {
          const rewrittenMap = await this.aiService.rewritePosts(
            relevantPosts.map((p) => ({ id: p.id, content: p.content, title: p.title })),
            channelLanguage,
            channelSystemPrompt,
          );

          for (const post of relevantPosts) {
            const rewritten = rewrittenMap.get(post.id);
            if (rewritten) {
              await this.queueService.createFromPost(post.id, rewritten, channel.id);
              rewrittenIds.push(post.id);
              console.log(`[Pipeline] Queued rewritten post #${post.id} → channel "${channel.name}"`);
            } else {
              console.warn(`[Pipeline] AI did not return rewrite for post #${post.id}, will retry next run.`);
            }
          }
        } catch (err) {
          console.error(`[Pipeline] Batch rewrite failed for channel "${channel.name}":`, err);
        }
      }

      // Mark rejected posts as processed so they are not re-collected
      const rejectedIds = unprocessed
        .filter((p) => !relevantIds.includes(p.id))
        .map((p) => p.id);

      if (rejectedIds.length > 0) {
        await this.prisma.collectedPost.updateMany({
          where: { id: { in: rejectedIds } },
          data: { processed: true },
        });
        console.log(`[Pipeline] Marked ${rejectedIds.length} rejected posts as processed.`);
      }

      // Only mark successfully rewritten posts as processed
      // Posts that failed rewriting stay unprocessed for retry on next run
      if (rewrittenIds.length > 0) {
        await this.prisma.collectedPost.updateMany({
          where: { id: { in: rewrittenIds } },
          data: { processed: true },
        });
        console.log(`[Pipeline] Marked ${rewrittenIds.length} posts as processed (${relevantIds.length - rewrittenIds.length} pending retry).`);
      }
    }

    console.log("[Pipeline] Cycle complete.");
  }

  private async collectFromSource(source: { id: number; type: string; config: Record<string, unknown> }): Promise<number> {
    let items: { id: string; content: string; title?: string; url?: string; date?: string; author?: string | null; mediaUrls?: string[] }[] = [];

    if (source.type === "telegram") {
      const config = source.config as unknown as TelegramSourceConfig;
      const posts = await this.telegramCollector.collect(config);
      items = posts.map((p) => ({
        id: p.id,
        content: p.text,
        date: p.date,
        mediaUrls: p.mediaUrls,
      }));
    } else if (source.type === "rss") {
      const config = source.config as unknown as RssSourceConfig;
      const posts = await this.rssCollector.collect(config);
      items = posts.map((p) => ({
        id: p.id,
        content: p.content,
        title: p.title,
        url: p.url,
        date: p.date,
        author: p.author,
      }));
    }

    if (items.length === 0) return 0;

    // Pre-filter: find sourcePostIds we already have for this source
    const existingPosts = await this.prisma.collectedPost.findMany({
      where: {
        sourceId: source.id,
        sourcePostId: { in: items.map((i) => i.id) },
      },
      select: { sourcePostId: true },
    });
    const existingIds = new Set(existingPosts.map((p) => p.sourcePostId));
    const newItems = items.filter((i) => !existingIds.has(i.id));

    if (newItems.length === 0) return 0;

    let newCount = 0;
    for (const item of newItems) {
      try {
        await this.prisma.collectedPost.create({
          data: {
            sourceId: source.id,
            sourcePostId: item.id,
            title: item.title || null,
            content: item.content,
            url: item.url || null,
            mediaUrls: item.mediaUrls || [],
            author: item.author || null,
            publishedAt: item.date ? new Date(item.date) : null,
          },
        });
        newCount++;
      } catch (err: unknown) {
        // Unique constraint violation = already collected (race condition fallback)
        if (err instanceof Error && "code" in err && (err as { code: string }).code === "P2002") continue;
        throw err;
      }
    }

    return newCount;
  }
}

