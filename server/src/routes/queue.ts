import { Router, Request, Response } from "express";
import { PrismaClient, Prisma } from "@prisma/client";
import type { ApiResponse, QueueListWithCountsResponse, QueueItemResponse, UpdateQueueItemRequest, PublishQueueItemRequest, QueueStatus } from "@curator/shared";
import { QueueService } from "../services/QueueService.js";
import { PublisherService } from "../services/PublisherService.js";

type QueueItemWithRelations = Prisma.QueueItemGetPayload<{
  include: { post: true; channel: true };
}>;

function mapQueueItem(item: QueueItemWithRelations): QueueItemResponse {
  return {
    id: item.id,
    postId: item.postId,
    rewrittenContent: item.rewrittenContent,
    imageUrl: item.imageUrl,
    status: item.status as QueueStatus,
    scheduledAt: item.scheduledAt?.toISOString() ?? null,
    publishedAt: item.publishedAt?.toISOString() ?? null,
    channelId: item.channelId,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    originalPost: item.post
      ? {
          id: item.post.id,
          sourceId: item.post.sourceId,
          sourcePostId: item.post.sourcePostId,
          title: item.post.title,
          content: item.post.content,
          url: item.post.url,
          mediaUrls: item.post.mediaUrls as string[],
          author: item.post.author,
          publishedAt: item.post.publishedAt?.toISOString() ?? null,
          collectedAt: item.post.collectedAt.toISOString(),
          processed: item.post.processed,
        }
      : undefined,
    channel: item.channel
      ? {
          id: item.channel.id,
          name: item.channel.name,
          telegramChatId: item.channel.telegramChatId,
          language: item.channel.language,
          systemPrompt: item.channel.systemPrompt,
          filterSystemPrompt: (item.channel as any).filterSystemPrompt ?? "",
          createdAt: item.channel.createdAt.toISOString(),
        }
      : null,
  };
}

export function createQueueRouter(
  prisma: PrismaClient,
  queueService: QueueService,
  publisherService: PublisherService,
): Router {
  const router = Router();

  // GET /api/queue?status=draft&search=text
  router.get("/", async (_req: Request, res: Response) => {
    try {
      const status = (_req.query.status as string) || undefined;
      const search = (_req.query.search as string) || undefined;
      const sourceId = _req.query.sourceId ? Number(_req.query.sourceId) : undefined;
      const channelId = _req.query.channelId ? Number(_req.query.channelId) : undefined;

      const [items, counts] = await Promise.all([
        queueService.getAll(status, search, sourceId, channelId),
        queueService.getStatusCounts(),
      ]);

      const body: ApiResponse<QueueListWithCountsResponse> = {
        success: true,
        data: {
          items: items.map(mapQueueItem),
          counts,
        },
      };
      res.json(body);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ success: false, error: message });
    }
  });

  // GET /api/queue/:id
  router.get("/:id", async (req: Request, res: Response) => {
    try {
      const item = await queueService.getById(Number(req.params.id));
      if (!item) {
        res.status(404).json({ success: false, error: "Queue item not found" });
        return;
      }
      const body: ApiResponse<QueueItemResponse> = { success: true, data: mapQueueItem(item) };
      res.json(body);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ success: false, error: message });
    }
  });

  // PUT /api/queue/:id — update content or status
  router.put("/:id", async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const data: UpdateQueueItemRequest = req.body;

      if (data.rewrittenContent !== undefined) {
        await queueService.updateContent(id, data.rewrittenContent);
      }

      if (data.imageUrl !== undefined) {
        await queueService.updateImageUrl(id, data.imageUrl);
      }

      if (data.channelId !== undefined && data.channelId !== null && data.status === undefined) {
        await prisma.queueItem.update({
          where: { id },
          data: { channelId: data.channelId },
        });
      }

      if (data.status !== undefined) {
        await queueService.updateStatus(id, data.status, {
          scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : undefined,
          channelId: data.channelId ?? undefined,
        });
      }

      const updated = await queueService.getById(id);
      if (!updated) {
        res.status(404).json({ success: false, error: "Queue item not found" });
        return;
      }
      const body: ApiResponse<QueueItemResponse> = { success: true, data: mapQueueItem(updated) };
      res.json(body);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ success: false, error: message });
    }
  });

  // POST /api/queue/bulk — bulk status update
  router.post("/bulk", async (req: Request, res: Response) => {
    try {
      const { ids, status } = req.body as { ids: number[]; status: QueueStatus };
      if (!Array.isArray(ids) || !status) {
        res.status(400).json({ success: false, error: "ids and status are required" });
        return;
      }
      await queueService.bulkUpdateStatus(ids, status);
      res.json({ success: true, data: null });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ success: false, error: message });
    }
  });

  // POST /api/queue/:id/publish — publish immediately
  router.post("/:id/publish", async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const data: PublishQueueItemRequest = req.body;

      const item = await queueService.getById(id);
      if (!item) {
        res.status(404).json({ success: false, error: "Queue item not found" });
        return;
      }

      const channel = await prisma.channel.findUnique({ where: { id: data.channelId } });
      if (!channel) {
        res.status(404).json({ success: false, error: "Channel not found" });
        return;
      }

      await publisherService.publish(channel.telegramChatId, item.rewrittenContent, item.imageUrl);
      await queueService.updateStatus(id, "published", {
        publishedAt: new Date(),
        channelId: channel.id,
      });

      const updated = await queueService.getById(id);
      if (!updated) {
        res.status(404).json({ success: false, error: "Queue item not found" });
        return;
      }
      const body: ApiResponse<QueueItemResponse> = { success: true, data: mapQueueItem(updated) };
      res.json(body);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ success: false, error: message });
    }
  });

  // DELETE /api/queue/:id
  router.delete("/:id", async (req: Request, res: Response) => {
    try {
      await queueService.delete(Number(req.params.id));
      res.json({ success: true, data: null });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ success: false, error: message });
    }
  });

  return router;
}
