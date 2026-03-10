// ──────────────────────────────────────────
// Domain entity interfaces
// ──────────────────────────────────────────

export type SourceType = "telegram" | "rss";

export interface Source {
  id: number;
  type: SourceType;
  name: string;
  config: TelegramSourceConfig | RssSourceConfig;
  enabled: boolean;
  channelId: number;
  createdAt: string;
  updatedAt: string;
}

export interface TelegramSourceConfig {
  channelUsername: string;
}

export interface RssSourceConfig {
  feedUrl: string;
}

// ──────────────────────────────────────────

export type FilterType = "include_keyword" | "exclude_keyword" | "exclude_author";

export interface Filter {
  id: number;
  sourceId: number | null; // null = global filter
  type: FilterType;
  value: string;
  createdAt: string;
}

// ──────────────────────────────────────────

export interface CollectedPost {
  id: number;
  sourceId: number;
  sourcePostId: string; // unique ID within the source (message ID, RSS guid)
  title: string | null;
  content: string;
  url: string | null;
  mediaUrls: string[];
  author: string | null;
  publishedAt: string | null;
  collectedAt: string;
  processed: boolean; // has been sent through AI pipeline
}

// ──────────────────────────────────────────

export type QueueStatus = "draft" | "approved" | "scheduled" | "published" | "rejected";

export interface QueueItem {
  id: number;
  postId: number;
  rewrittenContent: string;
  imageUrl: string | null;
  status: QueueStatus;
  scheduledAt: string | null;
  publishedAt: string | null;
  channelId: number | null;
  createdAt: string;
  updatedAt: string;
}

// ──────────────────────────────────────────

export interface Channel {
  id: number;
  name: string;
  telegramChatId: string; // e.g. "@mychannel" or "-100123456789"
  language: string;
  systemPrompt: string;
  filterSystemPrompt: string;
  createdAt: string;
}

// ──────────────────────────────────────────

export interface AppSettings {
  collectIntervalMinutes: number;
  aiModel: string;
  defaultChannelId: number | null;
}
