import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import type { ApiResponse, DashboardStats } from "@curator/shared";
import type { AiUsageTracker } from "../services/AiUsageTracker.js";

export function createDashboardRouter(prisma: PrismaClient, aiUsageTracker?: AiUsageTracker): Router {
  const router = Router();

  router.get("/", async (_req, res) => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [
        sourcesCount,
        activeSourcesCount,
        collectedPostsCount,
        queueDraftCount,
        queueScheduledCount,
        publishedTodayCount,
        lastPublished,
        nextScheduled,
      ] = await Promise.all([
        prisma.source.count(),
        prisma.source.count({ where: { enabled: true } }),
        prisma.collectedPost.count(),
        prisma.queueItem.count({ where: { status: "draft" } }),
        prisma.queueItem.count({ where: { status: "scheduled" } }),
        prisma.queueItem.count({
          where: { status: "published", publishedAt: { gte: today } },
        }),
        prisma.queueItem.findFirst({
          where: { status: "published" },
          orderBy: { publishedAt: "desc" },
          select: { publishedAt: true },
        }),
        prisma.queueItem.findFirst({
          where: { status: "scheduled", scheduledAt: { gte: new Date() } },
          orderBy: { scheduledAt: "asc" },
          select: { scheduledAt: true },
        }),
      ]);

      const stats: DashboardStats = {
        sourcesCount,
        activeSourcesCount,
        collectedPostsCount,
        queueDraftCount,
        queueScheduledCount,
        publishedTodayCount,
        lastPublishedAt: lastPublished?.publishedAt?.toISOString() ?? null,
        nextScheduledAt: nextScheduled?.scheduledAt?.toISOString() ?? null,
        aiUsage: aiUsageTracker ? aiUsageTracker.getSnapshot() : null,
      };

      const body: ApiResponse<DashboardStats> = { success: true, data: stats };
      res.json(body);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ success: false, error: message });
    }
  });

  return router;
}
