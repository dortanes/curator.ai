import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import type { ApiResponse, ChannelListResponse, ChannelResponse, CreateChannelRequest, UpdateChannelRequest, Channel } from "@curator/shared";

function mapChannel(ch: { id: number; name: string; telegramChatId: string; language: string; systemPrompt: string; filterSystemPrompt: string; createdAt: Date }): Channel {
  return {
    id: ch.id,
    name: ch.name,
    telegramChatId: ch.telegramChatId,
    language: ch.language,
    systemPrompt: ch.systemPrompt,
    filterSystemPrompt: ch.filterSystemPrompt,
    createdAt: ch.createdAt.toISOString(),
  };
}

export function createChannelsRouter(prisma: PrismaClient): Router {
  const router = Router();

  router.get("/", async (_req: Request, res: Response) => {
    try {
      const channels = await prisma.channel.findMany({ orderBy: { createdAt: "desc" } });
      const body: ApiResponse<ChannelListResponse> = { success: true, data: channels.map(mapChannel) };
      res.json(body);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ success: false, error: message });
    }
  });

  router.post("/", async (req: Request, res: Response) => {
    try {
      const data: CreateChannelRequest = req.body;
      const channel = await prisma.channel.create({
        data: {
          name: data.name,
          telegramChatId: data.telegramChatId,
          language: data.language || "en",
          systemPrompt: data.systemPrompt || "",
          filterSystemPrompt: data.filterSystemPrompt || "",
        },
      });
      const body: ApiResponse<ChannelResponse> = { success: true, data: mapChannel(channel) };
      res.status(201).json(body);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ success: false, error: message });
    }
  });

  router.put("/:id", async (req: Request, res: Response) => {
    try {
      const data: UpdateChannelRequest = req.body;
      const channel = await prisma.channel.update({
        where: { id: Number(req.params.id) },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.telegramChatId !== undefined && { telegramChatId: data.telegramChatId }),
          ...(data.language !== undefined && { language: data.language }),
          ...(data.systemPrompt !== undefined && { systemPrompt: data.systemPrompt }),
          ...(data.filterSystemPrompt !== undefined && { filterSystemPrompt: data.filterSystemPrompt }),
        },
      });
      const body: ApiResponse<ChannelResponse> = { success: true, data: mapChannel(channel) };
      res.json(body);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ success: false, error: message });
    }
  });

  router.delete("/:id", async (req: Request, res: Response) => {
    try {
      await prisma.channel.delete({ where: { id: Number(req.params.id) } });
      res.json({ success: true, data: null });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ success: false, error: message });
    }
  });

  return router;
}
