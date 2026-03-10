import { Router } from "express";
import type { ApiResponse, PipelineRunResponse, PipelineStatusResponse } from "@curator/shared";
import { PipelineService } from "../services/PipelineService.js";
import { SchedulerService } from "../services/SchedulerService.js";

export function createPipelineRouter(pipeline: PipelineService, scheduler: SchedulerService): Router {
  const router = Router();

  router.get("/status", (_req, res) => {
    const body: ApiResponse<PipelineStatusResponse> = {
      success: true,
      data: {
        ...pipeline.getStatus(),
        collectIntervalMinutes: scheduler.intervalMinutes,
      },
    };
    res.json(body);
  });

  router.post("/run", async (_req, res) => {
    if (pipeline.running) {
      const body: ApiResponse<PipelineRunResponse> = {
        success: true,
        data: { started: false, message: "Pipeline is already running" },
      };
      return res.json(body);
    }

    const body: ApiResponse<PipelineRunResponse> = {
      success: true,
      data: { started: true, message: "Pipeline started" },
    };
    res.json(body);

    // Run in background (mutex is in PipelineService)
    await pipeline.run();
  });

  return router;
}
