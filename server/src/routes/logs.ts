import { Router } from "express";
import type { ApiResponse } from "@curator/shared";
import type { LogBuffer, LogEntry } from "../services/LogBuffer.js";

export function createLogsRouter(logBuffer: LogBuffer): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    const since = _req.query.since as string | undefined;
    const entries = logBuffer.getAll(since);
    const body: ApiResponse<LogEntry[]> = { success: true, data: entries };
    res.json(body);
  });

  router.delete("/", (_req, res) => {
    logBuffer.clear();
    const body: ApiResponse<{ message: string }> = {
      success: true,
      data: { message: "Logs cleared" },
    };
    res.json(body);
  });

  return router;
}
