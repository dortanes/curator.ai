import { PrismaClient, Prisma } from "@prisma/client";
import type { QueueStatus, QueueStatusCounts } from "@curator/shared";

/**
 * CRUD and status transitions for queue items.
 */
export class QueueService {
  constructor(private prisma: PrismaClient) {}

  async getAll(status?: string, search?: string, sourceId?: number, channelId?: number) {
    const where: Prisma.QueueItemWhereInput = {};
    if (status) where.status = status;
    if (search) {
      where.rewrittenContent = { contains: search, mode: "insensitive" };
    }
    if (sourceId) {
      where.post = { sourceId };
    }
    if (channelId) {
      where.channelId = channelId;
    }

    return this.prisma.queueItem.findMany({
      where,
      include: { post: true, channel: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async getById(id: number) {
    return this.prisma.queueItem.findUnique({
      where: { id },
      include: { post: true, channel: true },
    });
  }

  async getStatusCounts(): Promise<QueueStatusCounts> {
    const [all, draft, approved, scheduled, published, rejected] = await Promise.all([
      this.prisma.queueItem.count(),
      this.prisma.queueItem.count({ where: { status: "draft" } }),
      this.prisma.queueItem.count({ where: { status: "approved" } }),
      this.prisma.queueItem.count({ where: { status: "scheduled" } }),
      this.prisma.queueItem.count({ where: { status: "published" } }),
      this.prisma.queueItem.count({ where: { status: "rejected" } }),
    ]);
    return { all, draft, approved, scheduled, published, rejected };
  }

  async createFromPost(postId: number, rewrittenContent: string, channelId?: number) {
    return this.prisma.queueItem.create({
      data: {
        postId,
        rewrittenContent,
        status: "draft",
        channelId: channelId ?? null,
      },
    });
  }

  async updateContent(id: number, rewrittenContent: string) {
    return this.prisma.queueItem.update({
      where: { id },
      data: { rewrittenContent },
    });
  }

  async updateImageUrl(id: number, imageUrl: string | null) {
    return this.prisma.queueItem.update({
      where: { id },
      data: { imageUrl },
    });
  }

  async updateStatus(id: number, status: QueueStatus, extra?: { scheduledAt?: Date; publishedAt?: Date; channelId?: number }) {
    return this.prisma.queueItem.update({
      where: { id },
      data: {
        status,
        ...extra,
      },
    });
  }

  async bulkUpdateStatus(ids: number[], status: QueueStatus) {
    return this.prisma.queueItem.updateMany({
      where: { id: { in: ids } },
      data: { status },
    });
  }

  async getScheduledReady() {
    return this.prisma.queueItem.findMany({
      where: {
        status: "scheduled",
        scheduledAt: { lte: new Date() },
      },
      include: { post: true, channel: true },
    });
  }

  async delete(id: number) {
    return this.prisma.queueItem.delete({ where: { id } });
  }
}
