import type {
  ApiResponse,
  SourceListResponse,
  SourceResponse,
  CreateSourceRequest,
  UpdateSourceRequest,
  FilterListResponse,
  FilterResponse,
  CreateFilterRequest,
  UpdateFilterRequest,
  PostListResponse,
  PostsQueryParams,
  QueueListWithCountsResponse,
  QueueItemResponse,
  UpdateQueueItemRequest,
  PublishQueueItemRequest,
  ChannelListResponse,
  ChannelResponse,
  CreateChannelRequest,
  UpdateChannelRequest,
  SettingsResponse,
  UpdateSettingsRequest,
  DashboardStats,
  PipelineRunResponse,
  PipelineStatusResponse,
  LogEntry,
} from "@curator/shared";
import { Env } from "@stencil/core";

const protocol = Env.BACKEND_PROTOCOL || "http";
const host = Env.BACKEND_HOST || "localhost";
const port = Env.BACKEND_PORT || "1532";
export const API_BASE = `${protocol}://${host}:${port}/api`;
export const SERVER_BASE = `${protocol}://${host}:${port}`;

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const body: ApiResponse<T> = await res.json();
  if (!body.success) {
    throw new Error(body.error);
  }
  return body.data;
}

// ── Sources ───────────────────────────────

export const sourcesApi = {
  list: () => request<SourceListResponse>("/sources"),
  get: (id: number) => request<SourceResponse>(`/sources/${id}`),
  create: (data: CreateSourceRequest) =>
    request<SourceResponse>("/sources", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: UpdateSourceRequest) =>
    request<SourceResponse>(`/sources/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: number) =>
    request<null>(`/sources/${id}`, { method: "DELETE" }),
};

// ── Filters ───────────────────────────────

export const filtersApi = {
  list: () => request<FilterListResponse>("/filters"),
  create: (data: CreateFilterRequest) =>
    request<FilterResponse>("/filters", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: UpdateFilterRequest) =>
    request<FilterResponse>(`/filters/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: number) =>
    request<null>(`/filters/${id}`, { method: "DELETE" }),
};

// ── Posts ──────────────────────────────────

export const postsApi = {
  list: (params?: PostsQueryParams) => {
    const query = new URLSearchParams();
    if (params?.page) query.set("page", String(params.page));
    if (params?.pageSize) query.set("pageSize", String(params.pageSize));
    if (params?.sourceId) query.set("sourceId", String(params.sourceId));
    if (params?.channelId) query.set("channelId", String(params.channelId));
    if (params?.search) query.set("search", params.search);
    return request<PostListResponse>(`/posts?${query.toString()}`);
  },
};

// ── Queue ─────────────────────────────────

export const queueApi = {
  list: (status?: string, search?: string, sourceId?: number, channelId?: number) => {
    const query = new URLSearchParams();
    if (status) query.set("status", status);
    if (search) query.set("search", search);
    if (sourceId) query.set("sourceId", String(sourceId));
    if (channelId) query.set("channelId", String(channelId));
    return request<QueueListWithCountsResponse>(`/queue?${query.toString()}`);
  },
  get: (id: number) => request<QueueItemResponse>(`/queue/${id}`),
  update: (id: number, data: UpdateQueueItemRequest) =>
    request<QueueItemResponse>(`/queue/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  publish: (id: number, data: PublishQueueItemRequest) =>
    request<QueueItemResponse>(`/queue/${id}/publish`, { method: "POST", body: JSON.stringify(data) }),
  delete: (id: number) =>
    request<null>(`/queue/${id}`, { method: "DELETE" }),
  bulkUpdate: (ids: number[], status: string) =>
    request<null>("/queue/bulk", { method: "POST", body: JSON.stringify({ ids, status }) }),
};

// ── Images ────────────────────────────────

export interface ImageSearchResult {
  url: string;
  width: number;
  height: number;
}

export const imagesApi = {
  search: (query: string, page = 0) =>
    request<{ images: ImageSearchResult[] }>(`/images/search?q=${encodeURIComponent(query)}&page=${page}`),
  download: (url: string) =>
    request<{ url: string }>("/images/download", { method: "POST", body: JSON.stringify({ url }) }),
};

// ── Upload ────────────────────────────────

export const uploadApi = {
  image: async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append("image", file);
    const res = await fetch(`${API_BASE}/upload`, { method: "POST", body: formData });
    const body: ApiResponse<{ url: string }> = await res.json();
    if (!body.success) throw new Error(body.error);
    return body.data.url;
  },
};

// ── Channels ──────────────────────────────

export const channelsApi = {
  list: () => request<ChannelListResponse>("/channels"),
  create: (data: CreateChannelRequest) =>
    request<ChannelResponse>("/channels", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: UpdateChannelRequest) =>
    request<ChannelResponse>(`/channels/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: number) =>
    request<null>(`/channels/${id}`, { method: "DELETE" }),
};

// ── Settings ──────────────────────────────

export const settingsApi = {
  get: () => request<SettingsResponse>("/settings"),
  update: (data: UpdateSettingsRequest) =>
    request<SettingsResponse>("/settings", { method: "PUT", body: JSON.stringify(data) }),
};

// ── Dashboard ─────────────────────────────

export const dashboardApi = {
  stats: () => request<DashboardStats>("/dashboard"),
};

// ── Pipeline ──────────────────────────────

export const pipelineApi = {
  run: () => request<PipelineRunResponse>("/pipeline/run", { method: "POST" }),
  status: () => request<PipelineStatusResponse>("/pipeline/status"),
};

// ── Prompts ───────────────────────────────

interface PromptData {
  name: string;
  model: string;
  temperature: number;
  description: string;
  template: string;
}

export const promptsApi = {
  list: () => request<PromptData[]>("/prompts"),
  update: (name: string, data: { template: string; model?: string; temperature?: number; description?: string }) =>
    request<{ message: string }>(`/prompts/${name}`, { method: "PUT", body: JSON.stringify(data) }),
};

// ── Logs ──────────────────────────────────

export const logsApi = {
  list: (since?: string) => {
    const query = since ? `?since=${encodeURIComponent(since)}` : "";
    return request<LogEntry[]>(`/logs${query}`);
  },
  clear: () => request<{ message: string }>("/logs", { method: "DELETE" }),
};
