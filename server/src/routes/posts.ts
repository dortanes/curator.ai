import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import type { ApiResponse, PostListResponse } from "@curator/shared";

export function createPostsRouter(prisma: PrismaClient): Router {
  const router = Router();

  // GET /api/posts — paginated, read-only
  router.get("/", async (req, res) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
      const sourceId = req.query.sourceId ? Number(req.query.sourceId) : undefined;
      const channelId = req.query.channelId ? Number(req.query.channelId) : undefined;
      const search = (req.query.search as string) || undefined;

      const where: any = {};
      if (sourceId) where.sourceId = sourceId;
      if (channelId) where.source = { ...where.source, channelId };
      if (search) {
        where.OR = [
          { content: { contains: search, mode: "insensitive" } },
          { title: { contains: search, mode: "insensitive" } },
        ];
      }

      const [items, total] = await Promise.all([
        prisma.collectedPost.findMany({
          where,
          orderBy: { collectedAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            source: {
              select: {
                id: true,
                name: true,
                type: true,
                channel: { select: { id: true, name: true } },
              },
            },
          },
        }),
        prisma.collectedPost.count({ where }),
      ]);

      const body: ApiResponse<PostListResponse> = {
        success: true,
        data: { items: items as any, total, page, pageSize },
      };
      res.json(body);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
