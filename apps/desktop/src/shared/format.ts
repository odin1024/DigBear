import type { MediaKind, MediaResource } from "./api";
import { t } from "./i18n";

export const MEDIA_KINDS: MediaKind[] = [
  "image",
  "video",
  "audio",
  "font",
  "other",
];

export const KIND_LABELS: Record<MediaKind, string> = {
  get image() { return t("图片", "Images"); },
  get video() { return t("视频", "Videos"); },
  get audio() { return t("音乐", "Music"); },
  get font() { return t("字体", "Fonts"); },
  get other() { return t("其他", "Other"); },
};

export const KIND_SINGULAR: Record<MediaKind, string> = {
  get image() { return t("张图片", "image"); },
  get video() { return t("个视频", "video"); },
  get audio() { return t("段音频", "audio clip"); },
  get font() { return t("个字体", "font"); },
  get other() { return t("个文件", "file"); },
};

/** Pull the first http(s) URL out of pasted text. */
export function extractUrl(text: string): string {
  if (!text) return "";
  const matches = text.match(/https?:\/\/[^\s<>"'，。、；：！？）)】》」』]+/gi) ?? [];
  const cleaned = matches
    .map((url) => url.replace(/[.,;:!?]+$/, ""))
    .map((url) => url.replace(/[）)】》」』]+$/, ""));
  return cleaned[0] ?? "";
}

export function normalizeHttpUrl(input: string): string | null {
  let raw = extractUrl(input.trim()) || input.trim();
  if (!raw) return null;
  // Users may omit the scheme; default to https, except for local hosts.
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?([/?#]|$)/i.test(raw);
    raw = `${isLocal ? "http" : "https"}://${raw.replace(/^\/\//, "")}`;
  }
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    const host = parsed.hostname;
    const isLocalHost =
      host === "localhost" ||
      host === "[::1]" ||
      /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host);
    if (!host || (!host.includes(".") && !isLocalHost)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

export function displayUrl(url: string, max = 64): string {
  const pretty = url.replace(/^https?:\/\//, "");
  return pretty.length > max ? `${pretty.slice(0, max - 1)}…` : pretty;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return "";
  }
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(secs).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatSize(bytes: number | null | undefined): string {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) return "";
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB"];
  let size = value / 1024;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(size >= 100 ? 0 : 1)} ${units[index]}`;
}

export function formatDimensions(
  width: number | null | undefined,
  height: number | null | undefined
): string {
  if (width && height) return `${width} × ${height}`;
  return "";
}

export function shortenPath(path: string, max = 58): string {
  if (path.length <= max) return path;
  return `${path.slice(0, 3)}…${path.slice(-(max - 6))}`;
}

/** The display name for a resource: filename hint, alt text, else URL tail. */
export function resourceName(resource: MediaResource): string {
  const hint = resource.filename_hint?.trim();
  if (hint) return hint;
  const alt = resource.alt?.trim();
  if (alt) return alt;
  try {
    const parsed = new URL(resource.url);
    const tail = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() ?? "");
    return tail || parsed.host;
  } catch {
    return resource.url;
  }
}

/** Count resources by kind, preferring backend counts but filling gaps. */
export function countResources(
  resources: MediaResource[],
  counts?: Record<string, number>
): Record<MediaKind, number> {
  const result = MEDIA_KINDS.reduce(
    (acc, kind) => ({ ...acc, [kind]: 0 }),
    {} as Record<MediaKind, number>
  );
  for (const resource of resources) {
    if (resource.kind in result) result[resource.kind] += 1;
  }
  if (counts) {
    for (const kind of MEDIA_KINDS) {
      if (typeof counts[kind] === "number" && counts[kind] >= 0) {
        result[kind] = counts[kind];
      }
    }
  }
  return result;
}

export function pluralizeKind(kind: MediaKind, count: number): string {
  return `${count} ${KIND_LABELS[kind]}`;
}

export function sameKindSet(a: Set<MediaKind>, b: MediaKind[]): boolean {
  if (a.size !== b.length) return false;
  return b.every((kind) => a.has(kind));
}

/** Only allow image URLs a webview can display; remote http(s) or inline SVG. */
export function safeImageUrl(value: string | null | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^data:image\/(png|jpe?g|webp|gif|svg\+xml);/i.test(trimmed)) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return parsed.href;
    }
  } catch {
    /* relative or malformed URL, ignore */
  }
  return "";
}

/** Compress a home-directory path for display: /Users/x/Downloads -> ~/Downloads */
export function prettyPath(path: string): string {
  if (!path) return "";
  return path.replace(/^\/Users\/[^/]+/, "~").replace(/^\/home\/[^/]+/, "~");
}
