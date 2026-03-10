import cron from "node-cron";
import { PrismaClient } from "@prisma/client";
import { PipelineService } from "./PipelineService.js";
import { PublisherService } from "./PublisherService.js";
import { QueueService } from "./QueueService.js";

const DEFAULT_INTERVAL_MINUTES = 30;

/**
 * Cron-based scheduler for:
 * 1. Running the collection + AI pipeline on a configurable interval
 * 2. Publishing scheduled queue items when their time comes
 */
export class SchedulerService {
  private pipelineTask: cron.ScheduledTask | null = null;
  private publishTask: cron.ScheduledTask | null = null;
  private _intervalMinutes: number = DEFAULT_INTERVAL_MINUTES;

  constructor(
    private prisma: PrismaClient,
    private pipeline: PipelineService,
    private publisher: PublisherService,
    private queueService: QueueService,
  ) {}

  get intervalMinutes(): number {
    return this._intervalMinutes;
  }

  async start(): Promise<void> {
    // Read saved interval from DB
    const row = await this.prisma.setting.findUnique({
      where: { key: "collectIntervalMinutes" },
    });
    this._intervalMinutes = row ? Number(row.value) || DEFAULT_INTERVAL_MINUTES : DEFAULT_INTERVAL_MINUTES;

    // Schedule pipeline task (or skip if interval is 0 = manual only)
    this.schedulePipelineTask();

    // Check for scheduled posts every minute
    this.publishTask = cron.schedule("* * * * *", async () => {
      try {
        await this.publishScheduled();
      } catch (err) {
        console.error("[Scheduler] Publish scheduled error:", err);
      }
    });
  }

  /**
   * Reschedule the pipeline cron task with a new interval.
   * Called when settings are updated via the API.
   */
  reschedule(intervalMinutes: number): void {
    this._intervalMinutes = intervalMinutes;

    if (this.pipelineTask) {
      this.pipelineTask.stop();
      this.pipelineTask = null;
    }

    this.schedulePipelineTask();
  }

  stop(): void {
    if (this.pipelineTask) {
      this.pipelineTask.stop();
      this.pipelineTask = null;
    }
    if (this.publishTask) {
      this.publishTask.stop();
      this.publishTask = null;
    }
  }

  private schedulePipelineTask(): void {
    if (this._intervalMinutes <= 0) {
      console.log("[Scheduler] Pipeline auto-run disabled (interval = 0).");
      return;
    }

    const cronExpr = `*/${this._intervalMinutes} * * * *`;
    console.log(`[Scheduler] Pipeline scheduled: "${cronExpr}" (every ${this._intervalMinutes} min)`);

    this.pipelineTask = cron.schedule(cronExpr, async () => {
      try {
        await this.pipeline.run();
      } catch (err) {
        console.error("[Scheduler] Pipeline error:", err);
      }
    });
  }

  private async publishScheduled(): Promise<void> {
    const ready = await this.queueService.getScheduledReady();
    for (const item of ready) {
      if (!item.channel) {
        console.warn(`[Scheduler] Queue item #${item.id} has no channel, skipping.`);
        continue;
      }

      try {
        await this.publisher.publish(item.channel.telegramChatId, item.rewrittenContent);
        await this.queueService.updateStatus(item.id, "published", {
          publishedAt: new Date(),
        });
        console.log(`[Scheduler] Published scheduled item #${item.id}`);
      } catch (err) {
        console.error(`[Scheduler] Failed to publish item #${item.id}:`, err);
      }
    }
  }
}
