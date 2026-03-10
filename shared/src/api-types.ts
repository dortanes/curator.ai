import type {
  Source,
  SourceType,
  Filter,
  FilterType,
  CollectedPost,
  QueueItem,
  QueueStatus,
  Channel,
  AppSettings,
  TelegramSourceConfig,
  RssSourceConfig,
} from "./entities.js";

// ──────────────────────────────────────────
// Generic API envelope
// ──────────────────────────────────────────

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export interface PaginatedData<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ──────────────────────────────────────────
// Sources
// ──────────────────────────────────────────

export interface CreateSourceRequest {
  type: SourceType;
  name: string;
  config: TelegramSourceConfig | RssSourceConfig;
  channelId: number;
  enabled?: boolean;
}

export interface UpdateSourceRequest {
  name?: string;
  config?: TelegramSourceConfig | RssSourceConfig;
  channelId?: number;
  enabled?: boolean;
}

export type SourceResponse = Source;
export type SourceListResponse = Source[];

// ──────────────────────────────────────────
// Filters
// ──────────────────────────────────────────

export interface CreateFilterRequest {
  sourceId?: number | null;
  type: FilterType;
  value: string;
}

export interface UpdateFilterRequest {
  type?: FilterType;
  value?: string;
}

export type FilterResponse = Filter;
export type FilterListResponse = Filter[];

// ──────────────────────────────────────────
// Collected Posts
// ──────────────────────────────────────────

export interface PostsQueryParams {
  page?: number;
  pageSize?: number;
  sourceId?: number;
  channelId?: number;
  search?: string;
}

export type PostListResponse = PaginatedData<CollectedPost>;

// ──────────────────────────────────────────
// Queue
// ──────────────────────────────────────────

export interface UpdateQueueItemRequest {
  rewrittenContent?: string;
  imageUrl?: string | null;
  status?: QueueStatus;
  scheduledAt?: string | null;
  channelId?: number | null;
}

export interface PublishQueueItemRequest {
  channelId: number;
}

export type QueueItemResponse = QueueItem & {
  originalPost?: CollectedPost;
  channel?: Channel | null;
};

export type QueueListResponse = QueueItemResponse[];

export interface QueueStatusCounts {
  all: number;
  draft: number;
  approved: number;
  scheduled: number;
  published: number;
  rejected: number;
}

export interface QueueListWithCountsResponse {
  items: QueueItemResponse[];
  counts: QueueStatusCounts;
}

// ──────────────────────────────────────────
// Channels
// ──────────────────────────────────────────

export interface CreateChannelRequest {
  name: string;
  telegramChatId: string;
  language?: string;
  systemPrompt?: string;
  filterSystemPrompt?: string;
}

export interface UpdateChannelRequest {
  name?: string;
  telegramChatId?: string;
  language?: string;
  systemPrompt?: string;
  filterSystemPrompt?: string;
}

export type ChannelResponse = Channel;
export type ChannelListResponse = Channel[];

// ──────────────────────────────────────────
// Settings
// ──────────────────────────────────────────

export type SettingsResponse = AppSettings;
export type UpdateSettingsRequest = Partial<AppSettings>;

// ──────────────────────────────────────────
// Dashboard
export interface AiModelUsage {
  model: string;
  rpm: number;
  tpm: number;
  rpd: number;
  tpd: number;
  totalRequests: number;
  totalTokens: number;
}

export interface AiUsageStats {
  models: AiModelUsage[];
  totalRequests: number;
  totalTokens: number;
  uptimeMinutes: number;
}

export interface DashboardStats {
  sourcesCount: number;
  activeSourcesCount: number;
  collectedPostsCount: number;
  queueDraftCount: number;
  queueScheduledCount: number;
  publishedTodayCount: number;
  lastPublishedAt: string | null;
  nextScheduledAt: string | null;
  aiUsage: AiUsageStats | null;
}

// ──────────────────────────────────────────
// Pipeline
// ──────────────────────────────────────────

export interface PipelineRunResponse {
  started: boolean;
  message: string;
}

export interface PipelineStatusResponse {
  running: boolean;
  lastError: string | null;
  lastRunAt: string | null;
  stage: string;
  collectIntervalMinutes: number;
}
