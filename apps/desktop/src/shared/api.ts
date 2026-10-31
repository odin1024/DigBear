import { invoke } from "@tauri-apps/api/core";
import { t } from "./i18n";

/* ---------------- Domain types (mirror docs/API_CONTRACT.md) ---------------- */

export type MediaKind = "image" | "video" | "audio" | "font" | "other";

export type ResourceSource =
  | "img"
  | "picture"
  | "video"
  | "audio"
  | "css_background"
  | "css_font_face"
  | "link"
  | "meta"
  | "anchor"
  | "performance"
  | "inline_style"
  | "fallback"
  | "other";

export interface MediaResource {
  id: string;
  url: string;
  kind: MediaKind;
  source: ResourceSource;
  filename_hint: string | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  poster: string | null;
  alt: string | null;
  host: string;
}

export interface CrawlResult {
  page_url: string;
  final_url: string;
  title: string;
  host: string;
  resources: MediaResource[];
  counts: Record<string, number>;
  warnings: string[];
  needs_login: boolean;
  enhanced: boolean;
}

export interface LoginSite {
  id: string;
  label: string;
  url: string;
  domain: string;
  last_opened_at: number | null;
}

export interface AppSettings {
  download_dir: string;
  default_kinds: MediaKind[];
  concurrency: number;
  scroll_page: boolean;
  max_items: number;
  sites: LoginSite[];
  language: "auto" | "zh" | "en";
  /** How many times a failed download is retried. */
  retry_count: number;
  /** Theme name: lantern | forest | night. */
  theme: string;
}

export interface DownloadFile {
  id: string;
  url: string;
  path: string;
  filename: string;
  size: number;
  kind: MediaKind;
}

export interface DownloadFailure {
  id: string;
  url: string;
  error: string;
}

export interface DownloadSummary {
  folder: string;
  total: number;
  success_count: number;
  failed_count: number;
  files: DownloadFile[];
  failures: DownloadFailure[];
  canceled: boolean;
}

export interface ExtensionStatus {
  id: string;
  name: string;
  description: string;
  version: string;
  installed: boolean;
  installed_version: string | null;
  path: string | null;
  size_bytes: number | null;
  download_size: number;
  license: string;
  can_install: boolean;
}

export interface ExtensionProgress {
  id: string;
  stage: "downloading" | "installing" | "done";
  received: number;
  total: number | null;
}

export interface SessionInfo {
  url: string;
  domain: string;
  cookies: number;
}

export interface CrawlRequest {
  url: string;
  kinds: MediaKind[];
  scroll: boolean;
  max_items: number;
}

export interface DownloadItemRequest {
  id: string;
  url: string;
  kind: MediaKind;
  filename_hint: string | null;
}

export interface DownloadRequest {
  page_url: string;
  items: DownloadItemRequest[];
}

/* ---------------- Event payloads ---------------- */

export type CrawlStage = "loading" | "extracting" | "done";

export interface CrawlProgress {
  stage: CrawlStage;
  message: string;
  percent: number;
}

export interface DownloadProgress {
  completed: number;
  total: number;
  current_id: string | null;
  current_name: string | null;
  current_received?: number;
  current_total?: number;
}

export interface DownloadItemEvent {
  id: string;
  status: "success" | "failed";
  path: string | null;
  error: string | null;
}

/* ---------------- Errors ---------------- */

export class DigBearError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "DigBearError";
    this.code = code;
  }
}

/** Tauri rejects with serialized AppError { code, message } or a string. */
function normalizeError(error: unknown): DigBearError {
  if (error instanceof DigBearError) return error;

  if (typeof error === "string") {
    const trimmed = error.trim();
    if (!trimmed) return new DigBearError("unknown", t("发生未知错误，请稍后重试。", "Something went wrong. Please try again."));
    try {
      return normalizeError(JSON.parse(trimmed));
    } catch {
      if (trimmed.includes("__TAURI_INTERNALS__")) {
        return new DigBearError(
          "not_tauri",
          t(
            "当前在浏览器中预览，桌面能力不可用。请用 npm run tauri dev 启动应用。",
            "Desktop features are unavailable in the browser preview. Start the app with pnpm dev:desktop.",
          )
        );
      }
      return new DigBearError("unknown", trimmed);
    }
  }

  if (error && typeof error === "object") {
    const maybe = error as { code?: unknown; message?: unknown };
    if (typeof maybe.code === "string" && typeof maybe.message === "string") {
      return new DigBearError(maybe.code, maybe.message);
    }
    if (typeof maybe.message === "string") {
      return new DigBearError("unknown", maybe.message);
    }
  }

  if (error instanceof Error && error.message) {
    if (error.message.includes("__TAURI_INTERNALS__")) {
      return new DigBearError(
        "not_tauri",
        t(
          "当前在浏览器中预览，桌面能力不可用。请用 npm run tauri dev 启动应用。",
          "Desktop features are unavailable in the browser preview. Start the app with pnpm dev:desktop.",
        )
      );
    }
    return new DigBearError("unknown", error.message);
  }

  return new DigBearError("unknown", t("发生未知错误，请稍后重试。", "Something went wrong. Please try again."));
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw normalizeError(error);
  }
}

/* ---------------- Command wrappers ---------------- */

export const api = {
  settings: () => call<AppSettings>("get_settings"),
  saveSettings: (settings: AppSettings) =>
    call<AppSettings>("save_settings", { settings }),
  pickDownloadDir: () => call<string | null>("pick_download_dir"),

  crawl: (request: CrawlRequest) => call<CrawlResult>("crawl_site", { request }),
  download: (request: DownloadRequest) =>
    call<DownloadSummary>("download_media", { request }),
  cancelDownload: () => call<{ canceled: boolean }>("cancel_download"),

  openSiteLogin: (url: string) =>
    call<{ message: string }>("open_site_login", { url }),
  closeSiteLogin: () => call<null>("close_site_login"),
  getSiteSession: (url: string) => call<SessionInfo>("get_site_session", { url }),
  clearSiteSession: (url: string) =>
    call<SessionInfo>("clear_site_session", { url }),

  revealPath: (path: string) => call<null>("reveal_path", { path }),
  openUrl: (url: string) => call<null>("open_url", { url }),
  openVideoPreview: (url: string, title?: string) =>
    call<null>("open_video_preview", { url, title }),

  listExtensions: () => call<ExtensionStatus[]>("list_extensions"),
  installExtension: (id: string) =>
    call<ExtensionStatus>("install_extension", { id }),
  removeExtension: (id: string) =>
    call<ExtensionStatus[]>("remove_extension", { id }),

  setAppLanguage: (language: "zh" | "en") =>
    call<null>("set_app_language", { language }),
};
