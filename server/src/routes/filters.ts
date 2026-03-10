import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import type { ApiResponse, FilterListResponse, FilterResponse, CreateFilterRequest, UpdateFilterRequest } from "@curator/shared";

export function createFiltersRouter(prisma: PrismaClient): Router {
  const router = Router();

  router.get("/", async (_req, res) => {
    try {
      const filters = await prisma.filter.findMany({
        include: { source: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
      });
      const body: ApiResponse<FilterListResponse> = { success: true, data: filters as any };
      res.json(body);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post("/", async (req, res) => {
    try {
      const data: CreateFilterRequest = req.body;
      const filter = await prisma.filter.create({
        data: {
          sourceId: data.sourceId ?? null,
          type: data.type,
          value: data.value,
        },
      });
      const body: ApiResponse<FilterResponse> = { success: true, data: filter as any };
      res.status(201).json(body);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.put("/:id", async (req, res) => {
    try {
      const data: UpdateFilterRequest = req.body;
      const filter = await prisma.filter.update({
        where: { id: Number(req.params.id) },
        data: {
          ...(data.type !== undefined && { type: data.type }),
          ...(data.value !== undefined && { value: data.value }),
        },
      });
      const body: ApiResponse<FilterResponse> = { success: true, data: filter as any };
      res.json(body);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.delete("/:id", async (req, res) => {
    try {
      await prisma.filter.delete({ where: { id: Number(req.params.id) } });
      res.json({ success: true, data: null });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
