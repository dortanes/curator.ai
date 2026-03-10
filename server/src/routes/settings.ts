import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import type { ApiResponse, SettingsResponse, UpdateSettingsRequest, AppSettings } from "@curator/shared";
import { SchedulerService } from "../services/SchedulerService.js";

const DEFAULT_SETTINGS: AppSettings = {
  collectIntervalMinutes: 30,
  aiModel: "gemini-3-flash-preview",
  defaultChannelId: null,
};

export function createSettingsRouter(prisma: PrismaClient, scheduler: SchedulerService): Router {
  const router = Router();

  router.get("/", async (_req, res) => {
    try {
      const rows = await prisma.setting.findMany();
      const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));

      const settings: AppSettings = {
        collectIntervalMinutes: Number(map.collectIntervalMinutes) || DEFAULT_SETTINGS.collectIntervalMinutes,
        aiModel: map.aiModel || DEFAULT_SETTINGS.aiModel,
        defaultChannelId: map.defaultChannelId ? Number(map.defaultChannelId) : null,
      };

      const body: ApiResponse<SettingsResponse> = { success: true, data: settings };
      res.json(body);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.put("/", async (req, res) => {
    try {
      const data: UpdateSettingsRequest = req.body;

      for (const [key, value] of Object.entries(data)) {
        if (value !== undefined) {
          await prisma.setting.upsert({
            where: { key },
            update: { value: String(value) },
            create: { key, value: String(value) },
          });
        }
      }

      // Reschedule pipeline if interval changed
      if (data.collectIntervalMinutes !== undefined) {
        scheduler.reschedule(data.collectIntervalMinutes);
      }

      // Return updated settings
      const rows = await prisma.setting.findMany();
      const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));

      const settings: AppSettings = {
        collectIntervalMinutes: Number(map.collectIntervalMinutes) || DEFAULT_SETTINGS.collectIntervalMinutes,
        aiModel: map.aiModel || DEFAULT_SETTINGS.aiModel,
        defaultChannelId: map.defaultChannelId ? Number(map.defaultChannelId) : null,
      };

      const body: ApiResponse<SettingsResponse> = { success: true, data: settings };
      res.json(body);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
