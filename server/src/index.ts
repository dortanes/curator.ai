import "dotenv/config";
import express from "express";
import cors from "cors";
import { PrismaClient } from "@prisma/client";
import { Bot } from "grammy";
import { SchedulerService } from "./services/SchedulerService.js";
import { AiService } from "./services/AiService.js";
import { AiUsageTracker } from "./services/AiUsageTracker.js";
import { PromptManager } from "./services/PromptManager.js";
import { PublisherService } from "./services/PublisherService.js";
import { PipelineService } from "./services/PipelineService.js";
import { QueueService } from "./services/QueueService.js";
import { TelegramCollector } from "./services/collectors/TelegramCollector.js";
import { RssCollector } from "./services/collectors/RssCollector.js";
import { createSourcesRouter } from "./routes/sources.js";
import { createFiltersRouter } from "./routes/filters.js";
import { createPostsRouter } from "./routes/posts.js";
import { createQueueRouter } from "./routes/queue.js";
import { createChannelsRouter } from "./routes/channels.js";
import { createSettingsRouter } from "./routes/settings.js";
import { createDashboardRouter } from "./routes/dashboard.js";
import { createPipelineRouter } from "./routes/pipeline.js";
import { createUploadRouter } from "./routes/upload.js";
import { createPromptsRouter } from "./routes/prompts.js";
import { createLogsRouter } from "./routes/logs.js";
import { createImagesRouter } from "./routes/images.js";
import { LogBuffer } from "./services/LogBuffer.js";
import path from "node:path";
import fs from "node:fs";

const PORT = parseInt(process.env.PORT || "1532", 10);

async function main() {
  // ── Log buffer (must be installed first) ──
  const logBuffer = new LogBuffer();
  logBuffer.install();

  // ── Core dependencies ──────────────────────
  const prisma = new PrismaClient();
  await prisma.$connect();
  console.log("[DB] Connected to Postgres");

  const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN || "");
  const promptManager = new PromptManager();
  const aiUsageTracker = new AiUsageTracker();
  const aiService = new AiService(promptManager, aiUsageTracker);
  const queueService = new QueueService(prisma);
  const publisherService = new PublisherService(bot);
  const telegramCollector = new TelegramCollector();
  const rssCollector = new RssCollector();
  const pipelineService = new PipelineService(
    prisma,
    aiService,
    queueService,
    telegramCollector,
    rssCollector,
  );

  // ── Express ────────────────────────────────
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Ensure uploads directory exists
  const uploadsDir = path.resolve("uploads");
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  app.use("/uploads", express.static(uploadsDir));

  app.use("/api/sources", createSourcesRouter(prisma));
  app.use("/api/filters", createFiltersRouter(prisma));
  app.use("/api/posts", createPostsRouter(prisma));
  app.use("/api/queue", createQueueRouter(prisma, queueService, publisherService));
  app.use("/api/channels", createChannelsRouter(prisma));
  // Scheduler must be created before routes that reference it
  const scheduler = new SchedulerService(prisma, pipelineService, publisherService, queueService);

  app.use("/api/settings", createSettingsRouter(prisma, scheduler));
  app.use("/api/dashboard", createDashboardRouter(prisma, aiUsageTracker));
  app.use("/api/pipeline", createPipelineRouter(pipelineService, scheduler));
  app.use("/api/upload", createUploadRouter());
  app.use("/api/prompts", createPromptsRouter(promptManager));
  app.use("/api/logs", createLogsRouter(logBuffer));
  app.use("/api/images", createImagesRouter());

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Listening on http://localhost:${PORT}`);
  });

  // ── Scheduler ──────────────────────────────
  await scheduler.start();
  console.log("[Scheduler] Started");

  // ── Graceful shutdown ──────────────────────
  const shutdown = async () => {
    console.log("[Server] Shutting down...");
    scheduler.stop();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[Server] Fatal error:", err);
  process.exit(1);
});
