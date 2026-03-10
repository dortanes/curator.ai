import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import type { ApiResponse, SourceListResponse, SourceResponse, CreateSourceRequest, UpdateSourceRequest } from "@curator/shared";

export function createSourcesRouter(prisma: PrismaClient): Router {
  const router = Router();

  // GET /api/sources
  router.get("/", async (_req, res) => {
    try {
      const sources = await prisma.source.findMany({
        orderBy: { createdAt: "desc" },
        include: { channel: { select: { id: true, name: true } } },
      });
      const body: ApiResponse<SourceListResponse> = { success: true, data: sources as any };
      res.json(body);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/sources/:id
  router.get("/:id", async (req, res) => {
    try {
      const source = await prisma.source.findUnique({ where: { id: Number(req.params.id) } });
      if (!source) {
        res.status(404).json({ success: false, error: "Source not found" });
        return;
      }
      const body: ApiResponse<SourceResponse> = { success: true, data: source as any };
      res.json(body);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/sources
  router.post("/", async (req, res) => {
    try {
      const data: CreateSourceRequest = req.body;
      const source = await prisma.source.create({
        data: {
          type: data.type,
          name: data.name,
          config: data.config as any,
          channelId: data.channelId,
          enabled: data.enabled ?? true,
        },
      });
      const body: ApiResponse<SourceResponse> = { success: true, data: source as any };
      res.status(201).json(body);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // PUT /api/sources/:id
  router.put("/:id", async (req, res) => {
    try {
      const data: UpdateSourceRequest = req.body;
      const source = await prisma.source.update({
        where: { id: Number(req.params.id) },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.config !== undefined && { config: data.config as any }),
          ...(data.channelId !== undefined && { channelId: data.channelId }),
          ...(data.enabled !== undefined && { enabled: data.enabled }),
        },
      });
      const body: ApiResponse<SourceResponse> = { success: true, data: source as any };
      res.json(body);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // DELETE /api/sources/:id
  router.delete("/:id", async (req, res) => {
    try {
      await prisma.source.delete({ where: { id: Number(req.params.id) } });
      res.json({ success: true, data: null });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
