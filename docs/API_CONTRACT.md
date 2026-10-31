# CrawlBear 前后端契约 v1

所有命令通过 `@tauri-apps/api/core` 的 `invoke` 调用。错误统一为 Tauri reject：

```ts
interface AppError { code: string; message: string }
```

## 类型

```ts
type MediaKind = "image" | "video" | "audio" | "font" | "other";

interface MediaResource {
  id: string;
  url: string;
  kind: MediaKind;
  source: "img" | "picture" | "video" | "audio" | "css_background" | "css_font_face"
        | "link" | "meta" | "anchor" | "performance" | "inline_style" | "fallback" | "other";
  filename_hint: string | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  poster: string | null;
  alt: string | null;
  host: string;
}

interface CrawlResult {
  page_url: string;
  final_url: string;
  title: string;
  host: string;
  resources: MediaResource[];
  counts: Record<MediaKind, number>;
  warnings: string[];
  needs_login: boolean;
  enhanced: boolean; // 命中了站点专属解析（结果页会展示标签）
}

interface LoginSite {
  id: string;
  label: string;
  url: string;
  domain: string;
  last_opened_at: number | null;
}

interface AppSettings {
  download_dir: string;
  default_kinds: MediaKind[];
  concurrency: number;      // 1..=5
  scroll_page: boolean;
  max_items: number;        // 50..=2000
  sites: LoginSite[];
  language: "auto" | "zh" | "en";
}

interface DownloadFile {
  id: string; url: string; path: string; filename: string; size: number; kind: MediaKind;
}
interface DownloadFailure { id: string; url: string; error: string; }
interface DownloadSummary {
  folder: string; total: number; success_count: number; failed_count: number;
  files: DownloadFile[]; failures: DownloadFailure[]; canceled: boolean;
}
interface ExtensionStatus {
  id: string; name: string; description: string; version: string;
  installed: boolean; installed_version: string | null; path: string | null;
  size_bytes: number | null; download_size: number; license: string; can_install: boolean;
}
interface ExtensionProgress {
  id: string; stage: "downloading" | "installing" | "done";
  received: number; total: number | null;
}
interface SessionInfo { url: string; domain: string; cookies: number; }
```

## Commands

| 命令 | 入参 | 返回 |
| --- | --- | --- |
| `get_settings` | — | `AppSettings` |
| `save_settings` | `{ settings: AppSettings }` | `AppSettings` |
| `pick_download_dir` | — | `string \| null` |
| `crawl_site` | `{ request: { url, kinds: MediaKind[], scroll: boolean, max_items: number } }` | `CrawlResult`。`kinds` 是 UI 默认过滤提示；后端返回全部发现项，前端在本地筛选。 |
| `download_media` | `{ request: { page_url, items: { id,url,kind,filename_hint }[] } }` | `DownloadSummary` |
| `cancel_download` | — | `{ canceled: boolean }` |
| `open_site_login` | `{ url: string }` | `{ message: string }` |
| `close_site_login` | — | `null` |
| `get_site_session` | `{ url: string }` | `SessionInfo` |
| `clear_site_session` | `{ url: string }` | `SessionInfo` |
| `reveal_path` | `{ path: string }` | `null` |
| `open_url` | `{ url: string }` | `null` |
| `open_video_preview` | `{ url: string, title?: string }` | `null`（在独立窗口打开视频页面） |
| `list_extensions` | — | `ExtensionStatus[]` |
| `install_extension` | `{ id: string }` | `ExtensionStatus`（下载并安装到应用私有目录） |
| `remove_extension` | `{ id: string }` | `ExtensionStatus[]` |

## Events

| 事件 | payload |
| --- | --- |
| `crawl-progress` | `{ stage: "loading" \| "extracting" \| "done", message: string, percent: number }` |
| `download-progress` | `{ completed: number, total: number, current_id: string \| null, current_name: string \| null, current_received?: number, current_total?: number }` |
| `extension-progress` | `{ id: string, stage: "downloading" \| "installing" \| "done", received: number, total: number \| null }` |
| `download-item` | `{ id, status: "success" \| "failed", path: string \| null, error: string \| null }` |
| `download-done` | `DownloadSummary` |

## 错误码

`invalid_url` · `crawl_failed` · `no_resources` · `login_required` · `download_failed` ·
`no_selection` · `canceled` · `settings_failed` · `session_failed` · `video_failed` · `extension_failed` · `extension_not_found` · `extension_unsupported` · `not_found` · `internal_error`
