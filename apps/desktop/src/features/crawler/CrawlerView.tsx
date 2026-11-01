import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App as AntApp, Button, Checkbox, Select } from "antd";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { listen } from "@tauri-apps/api/event";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import {
  api,
  type AppSettings,
  type CrawlProgress,
  type CrawlResult,
  type DownloadItemEvent,
  type DownloadProgress,
  type DownloadSummary,
  type FavoriteEntry,
  type HistoryEntry,
  type MediaKind,
  type MediaResource,
} from "../../shared/api";
import { toAppError } from "../../shared/errors";
import {
  MEDIA_KINDS,
  countResources,
  extractUrl,
  hostOf,
  normalizeHttpUrl,
  prettyPath,
} from "../../shared/format";
import { Mascot, type MascotMood } from "../../shared/components/Mascot";
import { t } from "../../shared/i18n";
import {
  ArrowLeftIcon,
  CloseIcon,
  SparkIcon,
  StarIcon,
} from "../../shared/components/Icons";
import { CrawlForm } from "./components/CrawlForm";
import { HomeShortcuts } from "./components/HomeShortcuts";
import { CrawlProgressPanel } from "./components/CrawlProgressPanel";
import { KindFilter } from "./components/KindFilter";
import { ResourceCard, type ResourceStatus } from "./components/ResourceCard";
import { ResourcePreviewModal } from "./components/ResourcePreviewModal";
import { DownloadBar } from "./components/DownloadBar";
import { PawConfetti } from "../../shared/components/PawConfetti";

/** 结果排序方式。 */
type SortBy = "default" | "resolution" | "duration" | "name";

const SORT_OPTIONS: Array<{ value: SortBy; label: string }> = [
  { value: "default", label: "默认顺序" },
  { value: "resolution", label: "分辨率" },
  { value: "duration", label: "时长" },
  { value: "name", label: "文件名" },
];

/** 只看大图：按最小宽度过滤，尺寸未知的资源一律保留。 */
const SIZE_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: "全部尺寸" },
  { value: 320, label: "≥320px" },
  { value: 640, label: "≥640px" },
  { value: 1280, label: "≥1280px" },
  { value: 1920, label: "≥1920px" },
];

/** CSV 单元格转义：含逗号、引号或换行时加引号。 */
function csvCell(value: string | number | null): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** 把采集结果导出成 CSV 文本。 */
export function toCsv(resources: MediaResource[]): string {
  const header = ["url", "kind", "file", "width", "height", "duration", "host"];
  const rows = resources.map((resource) =>
    [
      resource.url,
      resource.kind,
      resource.filename_hint ?? "",
      resource.width ?? "",
      resource.height ?? "",
      resource.duration ?? "",
      resource.host,
    ]
      .map(csvCell)
      .join(",")
  );
  return [header.join(","), ...rows].join("\r\n");
}

/** 像素数，用于按分辨率排序。 */
function pixelCount(resource: MediaResource): number {
  return (resource.width ?? 0) * (resource.height ?? 0);
}

interface CrawlerViewProps {
  settings: AppSettings | null;
  settingsLoading: boolean;
  resetSignal: number;
  /** 命令行 `--crawl <url>` 指定的网址；有值时自动开始翻找。 */
  initialUrl?: string | null;
  /** 命令行 `--folder <path>` 指定的文件夹；有值时把里面的网址收进队列。 */
  initialFolder?: string | null;
  onOpenSettings: (prefillUrl?: string) => void;
}

function statusesFromSummary(summary: DownloadSummary): Record<string, ResourceStatus> {
  const next: Record<string, ResourceStatus> = {};
  for (const file of summary.files) next[file.id] = "success";
  for (const failure of summary.failures) next[failure.id] = "failed";
  return next;
}

function defaultKindSet(settings: AppSettings | null): Set<MediaKind> {
  if (settings && settings.default_kinds.length > 0) {
    const picked = settings.default_kinds.filter((kind) => MEDIA_KINDS.includes(kind));
    const mainKinds: MediaKind[] = ["image", "video", "audio", "font"];
    // Treat "all four media kinds" as the full filter set so the 全部 chip reads as active.
    if (mainKinds.every((kind) => picked.includes(kind))) return new Set(MEDIA_KINDS);
    return new Set(picked);
  }
  return new Set(MEDIA_KINDS);
}

export function CrawlerView({
  settings,
  settingsLoading,
  resetSignal,
  initialUrl,
  initialFolder,
  onOpenSettings,
}: CrawlerViewProps) {
  const { message } = AntApp.useApp();
  const reduceMotion = useReducedMotion();

  const [page, setPage] = useState<"home" | "results">("home");
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<CrawlResult | null>(null);
  const [crawling, setCrawling] = useState(false);
  const [crawlProgress, setCrawlProgress] = useState<CrawlProgress | null>(null);
  const [activeKinds, setActiveKinds] = useState<Set<MediaKind>>(() =>
    defaultKindSet(settings)
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [statuses, setStatuses] = useState<Record<string, ResourceStatus>>({});
  const [preview, setPreview] = useState<MediaResource | null>(null);

  const [downloading, setDownloading] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [summary, setSummary] = useState<DownloadSummary | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>("default");
  /** 图片最小宽度；0 表示不过滤。 */
  const [minWidth, setMinWidth] = useState(0);
  /** 批量翻找队列里的网址。 */
  const [queue, setQueue] = useState<string[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [retrying, setRetrying] = useState(false);
  /** 收藏的站点。 */
  const [favorites, setFavorites] = useState<FavoriteEntry[]>([]);
  /** 最近翻找过的网址。 */
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const resultsScrollRef = useRef<HTMLDivElement>(null);

  /* 收藏与历史：桌面端才有，浏览器预览下静默跳过。 */
  const refreshShortcuts = useCallback(async () => {
    try {
      const [nextHistory, nextFavorites] = await Promise.all([
        api.history(),
        api.favorites(),
      ]);
      setHistory(nextHistory);
      setFavorites(nextFavorites);
    } catch {
      /* 预览模式没有桌面能力 */
    }
  }, []);

  useEffect(() => {
    void refreshShortcuts();
  }, [refreshShortcuts]);

  /* 翻完之后把这次记进历史。 */
  const rememberCrawl = useCallback(
    (entry: {
      url: string;
      title: string;
      host: string;
      total: number;
      counts: Record<string, number>;
    }) => {
      void api
        .recordHistory({
          id: "",
          url: entry.url,
          title: entry.title,
          host: entry.host,
          total: entry.total,
          counts: entry.counts,
          crawled_at: Math.floor(Date.now() / 1000),
        })
        .then(setHistory)
        .catch(() => {
          /* 历史写不进去也不影响翻找 */
        });
    },
    []
  );

  /* 托盘菜单「翻找剪贴板链接」：读剪贴板，认得出网址就直接翻。 */
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    listen("tray-crawl", () => {
      void api
        .readClipboard()
        .then((text) => {
          if (disposed || !text) return;
          const target =
            normalizeHttpUrl(text.trim()) ?? normalizeHttpUrl(extractUrl(text));
          if (!target) {
            message.warning(
              t("剪贴板里没有网址。", "No URL found in the clipboard.")
            );
            return;
          }
          setUrl(target);
          void crawlRef.current(target);
        })
        .catch(() => {
          message.warning(
            t("读不到剪贴板内容。", "Could not read the clipboard.")
          );
        });
    })
      .then((off) => {
        if (disposed) off();
        else unlisten = off;
      })
      .catch(() => {
        /* 预览模式没有事件系统 */
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [message]);

  const backHome = () => {
    if (downloading) return;
    setPage("home");
    setResult(null);
    setSelected(new Set());
    setStatuses({});
    setSummary(null);
    setDownloadProgress(null);
    setPreview(null);
    setActiveKinds(defaultKindSet(settings));
  };

  /* "翻找" in the masthead always returns to a clean home page. */
  useEffect(() => {
    backHome();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  useEffect(() => {
    if (settings && !result) setActiveKinds(defaultKindSet(settings));
  }, [settings, result]);

  /* 下载完成后发系统通知 —— 窗口不在前台时也能知道结果。 */
  const notifyFinished = useCallback(async (count: number, failed: number) => {
    try {
      let granted = await isPermissionGranted();
      if (!granted) {
        granted = (await requestPermission()) === "granted";
      }
      if (!granted) return;
      sendNotification({
        title: "掘掘熊 · DigBear",
        body:
          failed > 0
            ? `收好了 ${count} 件，还有 ${failed} 件没收到`
            : `收好了 ${count} 件，都进袋子里了`,
      });
    } catch {
      /* 通知不可用时静默跳过 */
    }
  }, []);

  /* Backend events: crawl progress and batch download lifecycle. */
  useEffect(() => {
    let cancelled = false;
    const disposers: Array<() => void> = [];

    const register = <T,>(event: string, handler: (payload: T) => void) => {
      listen<T>(event, (message) => handler(message.payload))
        .then((off) => {
          if (cancelled) off();
          else disposers.push(off);
        })
        .catch(() => {
          /* Browser preview or listener permission unavailable. */
        });
    };

    register<CrawlProgress>("crawl-progress", (payload) => {
      setCrawlProgress(payload);
    });

    register<DownloadProgress>("download-progress", (payload) => {
      setDownloadProgress(payload);
      if (payload.current_id) {
        setStatuses((previous) => ({
          ...previous,
          [payload.current_id as string]: "downloading",
        }));
      }
    });

    register<DownloadItemEvent>("download-item", (payload) => {
      setStatuses((previous) => ({
        ...previous,
        [payload.id]: payload.status,
      }));
    });

    register<DownloadSummary>("download-done", (payload) => {
      setSummary(payload);
      setStatuses((previous) => ({ ...previous, ...statusesFromSummary(payload) }));
      setDownloading(false);
      setDownloadProgress(null);
      void notifyFinished(payload.success_count, payload.failed_count);
    });

    /* 托盘菜单「翻找剪贴板链接」。 */
    register("tray-crawl", () => {
      void (async () => {
        let text = "";
        try {
          text = await navigator.clipboard.readText();
        } catch {
          message.info(t("读不到剪贴板。", "Cannot read the clipboard."));
          return;
        }
        const found =
          normalizeHttpUrl(text.trim()) ?? normalizeHttpUrl(extractUrl(text.trim()));
        if (!found) {
          message.info(t("剪贴板里没有网址。", "No URL in the clipboard."));
          return;
        }
        setUrl(found);
        setPage("home");
        void handleCrawl(found);
      })();
    });

    return () => {
      cancelled = true;
      disposers.forEach((off) => off());
    };
  }, []);

  useEffect(() => {
    if (page === "results") resultsScrollRef.current?.scrollTo({ top: 0 });
  }, [page]);

  const counts = useMemo(
    () => countResources(result?.resources ?? [], result?.counts),
    [result]
  );

  const visibleResources = useMemo(() => {
    const list = (result?.resources ?? []).filter((resource) => {
      if (!activeKinds.has(resource.kind)) return false;
      if (minWidth <= 0) return true;
      // 只对图片生效；尺寸未知的（视频、字体等）照常保留。
      if (resource.kind !== "image") return true;
      const width = resource.width ?? 0;
      if (width <= 0) return true;
      return width >= minWidth;
    });
    if (sortBy === "default") return list;
    const sorted = [...list];
    if (sortBy === "resolution") {
      sorted.sort((a, b) => pixelCount(b) - pixelCount(a));
    } else if (sortBy === "duration") {
      sorted.sort((a, b) => (b.duration ?? 0) - (a.duration ?? 0));
    } else {
      sorted.sort((a, b) =>
        (a.filename_hint ?? a.url).localeCompare(b.filename_hint ?? b.url, "zh")
      );
    }
    return sorted;
  }, [result, activeKinds, sortBy]);

  const selectedResources = useMemo(
    () => (result?.resources ?? []).filter((resource) => selected.has(resource.id)),
    [result, selected]
  );

  const allVisibleSelected =
    visibleResources.length > 0 &&
    visibleResources.every((resource) => selected.has(resource.id));
  const someVisibleSelected =
    !allVisibleSelected &&
    visibleResources.some((resource) => selected.has(resource.id));

  const mascotMood: MascotMood = crawling ? "crawl" : "hero";
  const bubbleLine = crawling ? t("我这就去翻…", "Let me take a look…") : t("今天想翻哪个网站？", "Which site should I crawl today?");

  /* 把当前输入的网址加入队列。 */
  const handleQueue = () => {
    const raw = url.trim();
    if (!raw) return;
    const normalized = normalizeHttpUrl(raw) ?? normalizeHttpUrl(extractUrl(raw));
    if (!normalized) {
      message.error(t("这个网址打不开，换一个试试。", "This URL cannot be opened. Try another one."));
      return;
    }
    setQueue((previous) =>
      previous.includes(normalized) ? previous : [...previous, normalized]
    );
    setUrl("");
    message.success(t("已加入队列。", "Added to the queue."));
  };

  const removeFromQueue = (target: string) => {
    setQueue((previous) => previous.filter((item) => item !== target));
  };

  /* 依次翻找队列里的网址，把结果合并。 */
  const runQueue = async () => {
    if (queue.length === 0) return;
    const collected: CrawlResult[] = [];
    for (let index = 0; index < queue.length; index += 1) {
      const target = queue[index];
      setCrawlProgress({
        stage: "loading",
        message: t(`正在翻找 ${index + 1}/${queue.length}`, `Crawling ${index + 1}/${queue.length}`),
        percent: Math.round((index / queue.length) * 100),
      });
      try {
        const next = await api.crawl({
          url: target,
          kinds: MEDIA_KINDS,
          scroll: settings?.scroll_page ?? true,
          max_items: settings?.max_items ?? 500,
        });
        collected.push(next);
        rememberCrawl({
          url: next.final_url || next.page_url,
          title: next.title,
          host: next.host,
          total: next.resources.length,
          counts: next.counts,
        });
      } catch (error) {
        message.error(t(`${target} 翻找失败`, `${target} failed`), 6);
      }
    }
    if (collected.length === 0) {
      setCrawlProgress(null);
      return;
    }
    const resources = collected.flatMap((item) => item.resources);
    const counts = { image: 0, video: 0, audio: 0, font: 0, other: 0 } as Record<MediaKind, number>;
    for (const resource of resources) {
      counts[resource.kind] = (counts[resource.kind] ?? 0) + 1;
    }
    const merged: CrawlResult = {
      ...collected[0],
      resources,
      counts,
      warnings: collected.flatMap((item) => item.warnings),
    };
    setResult(merged);
    setActiveKinds(defaultKindSet(settings));
    setPage("results");
    setCrawlProgress(null);
    message.success(
      t(`队列翻完了，一共 ${resources.length} 件。`, `Queue done: ${resources.length} items in total.`)
    );
  };

  const handleCrawl = async (target?: string) => {
    if (crawling) return;
    // 首页点「开始翻找」时，队列优先。
    if (!target && queue.length > 0) {
      await runQueue();
      return;
    }
    const raw = (target ?? url).trim();
    const normalized = normalizeHttpUrl(raw) ?? normalizeHttpUrl(extractUrl(raw));
    if (!normalized) {
      message.error(t("这个网址打不开，换一个试试。", "This URL cannot be opened. Try another one."));
      return;
    }

    message.destroy();
    setCrawling(true);
    setCrawlProgress({ stage: "loading", message: t("正在打开页面…", "Opening page…"), percent: 0 });
    setSummary(null);
    setDownloadProgress(null);
    setStatuses({});
    setSelected(new Set());
    setDownloading(false);

    try {
      const next = await api.crawl({
        url: normalized,
        kinds: MEDIA_KINDS,
        scroll: settings?.scroll_page ?? true,
        max_items: settings?.max_items ?? 500,
      });
      setResult(next);
      setActiveKinds(defaultKindSet(settings));
      setPage("results");
      rememberCrawl({
        url: next.final_url || next.page_url,
        title: next.title,
        host: next.host,
        total: next.resources.length,
        counts: next.counts,
      });
      setCrawlProgress({ stage: "done", message: t("翻找完成。", "Crawl complete."), percent: 100 });
      window.setTimeout(() => setCrawlProgress(null), 500);
      if (next.needs_login) {
        message.warning(t("这页要登录，去设置里登录一下。", "This page requires login. Sign in from Settings."));
      } else if (next.resources.length === 0) {
        message.info(t("这页没翻到东西。", "Nothing was found on this page."));
      }
    } catch (error) {
      const info = toAppError(error);
      message.error(info.message);
      setCrawlProgress(null);
    } finally {
      setCrawling(false);
    }
  };

  /* 命令行 `--crawl <url>`：地址一到就自动翻找。 */
  const crawlRef = useRef<(target?: string) => void>(() => {});
  const crawledInitial = useRef(false);
  useEffect(() => {
    if (!initialUrl || crawledInitial.current) return;
    crawledInitial.current = true;
    setUrl(initialUrl);
    void crawlRef.current(initialUrl);
  }, [initialUrl]);

  /* 命令行 `--folder <path>`：把文件夹里的网址收进队列并开始翻找。 */
  const scannedFolder = useRef(false);
  useEffect(() => {
    if (!initialFolder || scannedFolder.current) return;
    scannedFolder.current = true;
    void api
      .scanFolderUrls(initialFolder)
      .then((scan) => {
        if (scan.urls.length === 0) {
          message.info(
            t(
              "这个文件夹里没有找到网址。",
              "No URLs found in that folder."
            )
          );
          return;
        }
        setQueue(scan.urls);
        message.success(
          t(
            `从文件夹里找到 ${scan.urls.length} 个网址，开始翻找。`,
            `Found ${scan.urls.length} URLs in that folder. Starting…`
          )
        );
        void crawlRef.current();
      })
      .catch((error) => {
        message.error(toAppError(error).message);
      });
  }, [initialFolder, message]);

  /* 深链：浏览器扩展唤起时把网址转过来。 */
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    listen<string>("deep-link", (event) => {
      const payload = event.payload ?? "";
      const target =
        normalizeHttpUrl(payload.trim()) ?? normalizeHttpUrl(extractUrl(payload));
      if (!target) {
        message.warning(t("这个链接打不开。", "That link cannot be opened."));
        return;
      }
      setUrl(target);
      void crawlRef.current(target);
    })
      .then((off) => {
        if (disposed) off();
        else unlisten = off;
      })
      .catch(() => {
        /* 预览模式没有事件系统 */
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [message]);

  useEffect(() => {
    crawlRef.current = handleCrawl;
  });

  /* 当前页是否已收藏。 */
  const isFavorite = Boolean(
    result && favorites.some((item) => item.url === (result.final_url || result.page_url))
  );

  const handleToggleFavorite = async () => {
    if (!result) return;
    const url = result.final_url || result.page_url;
    try {
      const next = await api.toggleFavorite({
        id: "",
        url,
        title: result.title,
        host: result.host,
        added_at: Math.floor(Date.now() / 1000),
      });
      setFavorites(next);
      message.success(
        next.some((item) => item.url === url)
          ? t("已收藏这个站点。", "Added to favorites.")
          : t("已取消收藏。", "Removed from favorites.")
      );
    } catch (error) {
      message.error(toAppError(error).message);
    }
  };

  const handleRemoveFavorite = async (url: string) => {
    try {
      setFavorites(await api.removeFavorite(url));
    } catch (error) {
      message.error(toAppError(error).message);
    }
  };

  const handleClearHistory = async () => {
    try {
      setHistory(await api.clearHistory());
      message.success(t("历史记录已清空。", "History cleared."));
    } catch (error) {
      message.error(toAppError(error).message);
    }
  };

  const toggleResource = (id: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (allVisibleSelected) {
        visibleResources.forEach((resource) => next.delete(resource.id));
      } else {
        visibleResources.forEach((resource) => next.add(resource.id));
      }
      return next;
    });
  };

  /** 一键收下当前筛选出来的全部资源。 */
  const handleDownloadAll = async () => {
    if (downloading || visibleResources.length === 0 || !result) return;
    const targets = visibleResources;
    setSelected(new Set(targets.map((resource) => resource.id)));
    await handleDownload(targets);
  };

  const handleDownload = async (explicit?: MediaResource[]) => {
    const targets = explicit ?? selectedResources;
    if (downloading || targets.length === 0 || !result) return;

    setDownloading(true);
    setSummary(null);
    setStatuses({});
    setDownloadProgress({
      completed: 0,
      total: targets.length,
      current_id: null,
      current_name: null,
    });

    try {
      const next = await api.download({
        page_url: result.final_url || result.page_url,
        items: targets.map((resource) => ({
          id: resource.id,
          url: resource.url,
          kind: resource.kind,
          filename_hint: resource.filename_hint,
        })),
      });
      setSummary(next);
      setStatuses(statusesFromSummary(next));
      setSelected(new Set(next.failures.map((failure) => failure.id)));
      const skipped = next.skipped_count ?? 0;
      const skippedNote = skipped
        ? t(`（${skipped} 件之前下过，已跳过）`, `(${skipped} already downloaded, skipped)`)
        : "";
      if (next.canceled) {
        message.info(t("下载已取消。", "Download canceled."));
      } else if (next.failed_count > 0) {
        message.warning(
          t(
            `收好了 ${next.success_count} 件，${next.failed_count} 件没收到。${skippedNote}`,
            `Saved ${next.success_count}, ${next.failed_count} failed.${skippedNote}`
          )
        );
      } else {
        message.success(
          t(
            `收好了，${next.success_count} 件都在袋子里。${skippedNote}`,
            `Saved ${next.success_count} items to your collection.${skippedNote}`
          )
        );
      }
    } catch (error) {
      message.error(toAppError(error).message);
    } finally {
      setDownloading(false);
      setDownloadProgress(null);
    }
  };

  const handleCancel = async () => {
    if (!downloading || canceling) return;
    setCanceling(true);
    try {
      await api.cancelDownload();
      message.info(t("剩下的先不收了。", "Cancel remaining downloads."));
    } catch (error) {
      message.error(toAppError(error).message);
    } finally {
      setCanceling(false);
    }
  };

  /* 拖拽链接：把浏览器地址栏的链接拖进窗口即可翻找。 */
  const handleDrop = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragActive(false);
    const transfer = event.dataTransfer;
    const raw =
      transfer.getData("text/uri-list") || transfer.getData("text/plain") || "";
    const found = normalizeHttpUrl(raw.trim()) ?? normalizeHttpUrl(extractUrl(raw.trim()));
    if (!found) {
      message.error(t("这里没有可用的网址。", "No usable URL in the drop."));
      return;
    }
    setUrl(found);
    setPage("home");
    void handleCrawl(found);
  };

  /* 导出清单（CSV / JSON）。 */
  const handleExport = async (format: "csv" | "json") => {
    if (!result || result.resources.length === 0) return;
    const content =
      format === "csv"
        ? toCsv(result.resources)
        : JSON.stringify(result.resources, null, 2);
    const host = hostOf(result.final_url || result.page_url) || "digbear";
    const stamp = new Date().toISOString().slice(0, 10);
    try {
      const path = await api.exportList(content, `digbear-${host}-${stamp}.${format}`);
      if (path) {
        message.success(
          t(`清单已导出到 ${prettyPath(path)}`, `List exported to ${prettyPath(path)}`)
        );
      }
    } catch (error) {
      message.error(toAppError(error).message);
    }
  };

  /* 重新下载失败的文件。 */
  const handleRetryFailed = async () => {
    if (!result || !summary || summary.failures.length === 0 || downloading || retrying) return;
    const failedIds = new Set(summary.failures.map((failure) => failure.id));
    const items = (result.resources ?? []).filter((resource) => failedIds.has(resource.id));
    if (items.length === 0) return;

    setRetrying(true);
    setDownloading(true);
    setDownloadProgress({
      completed: 0,
      total: items.length,
      current_id: null,
      current_name: null,
    });
    try {
      const next = await api.download({
        page_url: result.final_url || result.page_url,
        items: items.map((resource) => ({
          id: resource.id,
          url: resource.url,
          kind: resource.kind,
          filename_hint: resource.filename_hint,
        })),
      });
      setSummary((previous) => {
        if (!previous) return next;
        const retried = new Set(items.map((item) => item.id));
        const files = previous.files.filter((file) => !retried.has(file.id));
        const failures = previous.failures.filter((failure) => !retried.has(failure.id));
        return {
          ...previous,
          files: [...files, ...next.files],
          failures: [...failures, ...next.failures],
          success_count: files.length + next.files.length,
          failed_count: failures.length + next.failures.length,
          total: files.length + failures.length + next.files.length + next.failures.length,
        };
      });
      setStatuses((previous) => ({ ...previous, ...statusesFromSummary(next) }));
      if (next.failed_count > 0) {
        message.warning(
          t(`还是没收到 ${next.failed_count} 件。`, `${next.failed_count} items still failed.`)
        );
      } else {
        message.success(t("这次都收到了。", "All retried items are in."));
      }
    } catch (error) {
      message.error(toAppError(error).message);
    } finally {
      setRetrying(false);
      setDownloading(false);
      setDownloadProgress(null);
    }
  };

  /* 键盘快捷键。用 ref 保存最新回调，避免每次状态变化都重绑事件。 */
  const shortcutRef = useRef<(event: KeyboardEvent) => void>(() => {});
  shortcutRef.current = (event: KeyboardEvent) => {
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();

    if (mod && key === ",") {
      event.preventDefault();
      onOpenSettings();
      return;
    }
    if (mod && key === "a" && page === "results") {
      event.preventDefault();
      toggleAllVisible();
      return;
    }
    if (mod && key === "v") {
      // 焦点不在输入框时，把光标送进去，让粘贴有地方可去。
      const active = document.activeElement;
      if (!(active instanceof HTMLInputElement) && !(active instanceof HTMLTextAreaElement)) {
        const input = document.getElementById("crawlUrl");
        if (input instanceof HTMLInputElement) {
          event.preventDefault();
          input.focus();
        }
      }
      return;
    }
    if (key === "escape") {
      if (downloading) {
        event.preventDefault();
        void handleCancel();
      } else if (page === "results") {
        event.preventDefault();
        backHome();
      } else if (url) {
        event.preventDefault();
        setUrl("");
      }
    }
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => shortcutRef.current(event);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleReveal = async (path: string) => {
    try {
      await api.revealPath(path);
    } catch (error) {
      message.error(toAppError(error).message);
    }
  };

  const showDownloadBar =
    Boolean(result) && !result?.needs_login && (result?.resources.length ?? 0) > 0;

  return (
    <section
      className={`crawler-view${dragActive ? " crawler-view--drag" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={handleDrop}
    >
      {dragActive && (
        <div className="drag-hint" aria-hidden="true">
          {t("松手就翻这里", "Drop to crawl")}
        </div>
      )}
      <AnimatePresence mode="wait" initial={false}>
        {page === "home" ? (
          <motion.div
            key="home"
            className="home-page"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={
              reduceMotion
                ? { opacity: 0 }
                : { opacity: 0, transition: { duration: 0.12, ease: "easeOut" } }
            }
            transition={{ duration: 0.3, ease: [0.22, 0.61, 0.36, 1] }}
          >
            <header className="hero">
              <div className="hero__copy">
                <h1>
                  {t("把网页里的宝贝，", "All the treasures on the web,")}
                  <br />
                  <span className="accent">{t("收进采集袋。", "into your collection bag.")}</span>
                </h1>
                <p className="hero__sub">{t("图片、视频、音乐、字体，一次翻出来。", "Images, videos, music and fonts — all in one pass.")}</p>
              </div>

              <motion.div
                className="hero__mascot"
                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              >
                <div className="hero__mascot-stage">
                  <Mascot mood={mascotMood} size={292} />
                  <div className="speech-bubble" aria-live="polite">
                    {bubbleLine}
                  </div>
                </div>
              </motion.div>
            </header>

            <div className="home-search">
              <CrawlForm
                url={url}
                crawling={crawling}
                onQueue={handleQueue}
                onUrlChange={setUrl}
                onCrawl={handleCrawl}
                onClipboardError={(reason) =>
                  message.warning(
                    reason === "empty"
                      ? t("剪贴板里没有网址。", "No URL found in the clipboard.")
                      : t("读不到剪贴板内容。", "Could not read the clipboard.")
                  )
                }
              />
              {queue.length > 0 && (
                <div className="crawl-queue" aria-live="polite">
                  <div className="crawl-queue__head">
                    <span>
                      {t(
                        `队列里有 ${queue.length} 个网址`,
                        `${queue.length} URLs in the queue`
                      )}
                    </span>
                    <button
                      type="button"
                      className="rb-text-link"
                      onClick={() => setQueue([])}
                    >
                      {t("清空队列", "Clear queue")}
                    </button>
                  </div>
                  <ul className="crawl-queue__list">
                    {queue.map((item) => (
                      <li key={item} className="crawl-queue__item">
                        <span title={item}>{item}</span>
                        <button
                          type="button"
                          aria-label={t("移出队列", "Remove from queue")}
                          onClick={() => removeFromQueue(item)}
                        >
                          <CloseIcon size={13} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <HomeShortcuts
                favorites={favorites}
                history={history}
                onPick={(target) => setUrl(target)}
                onRemoveFavorite={handleRemoveFavorite}
                onClearHistory={handleClearHistory}
              />
              <AnimatePresence initial={false}>
                {crawling && (
                  <motion.div
                    key="progress"
                    initial={reduceMotion ? false : { opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="home-search__progress"
                  >
                    <CrawlProgressPanel progress={crawlProgress} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="results"
            className="results-page"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={
              reduceMotion
                ? { opacity: 0 }
                : { opacity: 0, transition: { duration: 0.12, ease: "easeOut" } }
            }
            transition={{ duration: 0.3, ease: [0.22, 0.61, 0.36, 1] }}
          >
            <div className="results-scroll" ref={resultsScrollRef}>
              <div className="results-topbar">
                <button
                  type="button"
                  className="rb-back"
                  onClick={backHome}
                  disabled={downloading}
                  title={downloading ? t("下载完成后可以返回", "You can go back after downloads finish") : t("回到首页", "Back to home")}
                >
                  <ArrowLeftIcon size={16} />
                  {t("再翻一页", "Crawl another page")}
                </button>
                {result && (
                  <button
                    type="button"
                    className={`rb-star${isFavorite ? " rb-star--on" : ""}`}
                    onClick={handleToggleFavorite}
                    title={
                      isFavorite
                        ? t("取消收藏这个站点", "Remove from favorites")
                        : t("收藏这个站点", "Add to favorites")
                    }
                  >
                    <StarIcon size={16} filled={isFavorite} />
                    {isFavorite ? t("已收藏", "Saved") : t("收藏", "Save")}
                  </button>
                )}
                {settingsLoading && <span className="results-topbar__hint">{t("读取设置…", "Loading settings…")}</span>}
              </div>

              {result && (
                <>
                  <div className="result-head">
                    <div className="result-head__copy">
                      <h2>{result.title || result.host || t("未命名页面", "Untitled page")}</h2>
                      {result.enhanced && (
                        <span
                          className="result-badge"
                          title={t("已启用站点专属解析：优先提取原始高清晰度资源。", "Site-specific parsing is enabled: original high-quality assets are preferred.")}
                        >
                          <SparkIcon size={13} />
                          {t("专属解析已启用", "Site parsing enabled")}
                        </span>
                      )}
                    </div>
                    <div className="result-head__stats">
                      <span className="result-count">
                        <strong>{result.resources.length}</strong>
                        <span>{t("件宝贝", "items")}</span>
                      </span>
                      {result.warnings.length > 0 && (
                        <details className="warnings">
                          <summary>{t(`${result.warnings.length} 条提示`, `${result.warnings.length} notices`)}</summary>
                          <ul>
                            {result.warnings.map((warning) => (
                              <li key={warning}>{warning}</li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </div>
                  </div>

                  {result.needs_login ? (
                    <div className="login-required">
                      <div className="login-required__mascot" aria-hidden="true">
                        <Mascot mood="login" size={168} still />
                      </div>
                      <div className="login-required__body">
                        <h3>{t("这页要登录", "This page requires login")}</h3>
                        <p>{t("去设置里登录", "Sign in to")} {result.host} {t("，我再来翻。", "from Settings, then crawl again.")}</p>
                        <div className="login-required__actions">
                          <Button
                            type="primary"
                            className="rb-btn rb-btn--primary"
                            onClick={() => onOpenSettings(result.final_url || result.page_url)}
                          >
                            {t("去登录", "Sign in")}
                          </Button>
                          <Button
                            className="rb-btn rb-btn--ghost"
                            onClick={() => {
                              backHome();
                              window.setTimeout(() => void handleCrawl(), 160);
                            }}
                          >
                            {t("再试一次", "Try again")}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="result-toolbar">
                        <KindFilter counts={counts} active={activeKinds} onChange={setActiveKinds} />
                        <Select
                          className="result-toolbar__sort"
                          size="small"
                          value={minWidth}
                          onChange={(value) => setMinWidth(Number(value))}
                          options={SIZE_OPTIONS.map((option) => ({
                            value: option.value,
                            label: t(option.label, option.label),
                          }))}
                          aria-label={t("只看大图", "Filter by size")}
                        />
                        <Select
                          className="result-toolbar__sort"
                          size="small"
                          value={sortBy}
                          onChange={(value) => setSortBy(value as SortBy)}
                          options={SORT_OPTIONS.map((option) => ({
                            value: option.value,
                            label: t(option.label, option.label),
                          }))}
                          aria-label={t("结果排序", "Sort results")}
                        />
                        <div className="result-toolbar__selection">
                          <Checkbox
                            className="rb-check"
                            checked={allVisibleSelected}
                            indeterminate={someVisibleSelected}
                            disabled={visibleResources.length === 0}
                            onChange={toggleAllVisible}
                          >
                            {t(`全选当前（${visibleResources.length}）`, `Select all visible (${visibleResources.length})`)}
                          </Checkbox>
                          {selected.size > 0 && (
                            <button
                              type="button"
                              className="rb-text-link"
                              onClick={() => setSelected(new Set())}
                            >
                              {t("清空", "Clear")}
                            </button>
                          )}
                          <div className="result-toolbar__export">
                            <button
                              type="button"
                              className="rb-text-link rb-text-link--strong"
                              disabled={downloading || visibleResources.length === 0}
                              title={t(
                                "把当前筛选出来的全部资源一次收下",
                                "Save every resource matching the current filter"
                              )}
                              onClick={() => void handleDownloadAll()}
                            >
                              {t(
                                `全收下（${visibleResources.length}）`,
                                `Save all (${visibleResources.length})`
                              )}
                            </button>
                            <button
                              type="button"
                              className="rb-text-link"
                              onClick={() => void handleExport("csv")}
                            >
                              {t("导出 CSV", "Export CSV")}
                            </button>
                            <button
                              type="button"
                              className="rb-text-link"
                              onClick={() => void handleExport("json")}
                            >
                              {t("导出 JSON", "Export JSON")}
                            </button>
                          </div>
                        </div>
                      </div>

                      {summary && summary.failures.length > 0 && !downloading && (
                        <div className="result-failures">
                          <div className="result-failures__head">
                            <span>
                              {t(
                                `${summary.failures.length} 件没收到`,
                                `${summary.failures.length} failed`
                              )}
                            </span>
                            <button
                              type="button"
                              className="rb-text-link"
                              disabled={retrying}
                              onClick={() => void handleRetryFailed()}
                            >
                              {retrying ? t("重试中…", "Retrying…") : t("重试全部", "Retry all")}
                            </button>
                          </div>
                          <ul className="result-failures__list">
                            {summary.failures.slice(0, 5).map((failure) => (
                              <li key={failure.id}>
                                <span className="result-failures__url">{failure.url}</span>
                                <span className="result-failures__error">{failure.error}</span>
                              </li>
                            ))}
                          </ul>
                          {summary.failures.length > 5 && (
                            <p className="result-failures__more">
                              {t(
                                `还有 ${summary.failures.length - 5} 件没列出`,
                                `${summary.failures.length - 5} more`
                              )}
                            </p>
                          )}
                        </div>
                      )}

                      {result.resources.length === 0 ? (
                        <div className="result-empty">
                          <Mascot mood="empty" size={172} still />
                          <div>
                            <h3>{t("这页没翻到东西", "Nothing found on this page")}</h3>
                            <p>{t("换一页，或去设置里登录后再试。", "Try another page, or sign in from Settings first.")}</p>
                          </div>
                        </div>
                      ) : visibleResources.length === 0 ? (
                        <div className="result-empty">
                          <Mascot mood="empty" size={172} still />
                          <div>
                            <h3>{t("这一栏是空的", "This filter is empty")}</h3>
                            <button
                              type="button"
                              className="rb-text-link"
                              onClick={() => setActiveKinds(new Set(MEDIA_KINDS))}
                            >
                              {t("显示全部类型", "Show all types")}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="media-grid">
                          {visibleResources.map((resource, index) => (
                            <ResourceCard
                              key={resource.id}
                              resource={resource}
                              index={index}
                              selected={selected.has(resource.id)}
                              status={statuses[resource.id]}
                              onToggle={toggleResource}
                              onPreview={setPreview}
                            />
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>

            {summary && !downloading && summary.success_count > 0 && (
              <PawConfetti burstKey={`${summary.folder}-${summary.success_count}`} />
            )}

            <AnimatePresence>
              {showDownloadBar && result && (
                <DownloadBar
                  selected={selectedResources}
                  downloading={downloading}
                  canceling={canceling}
                  progress={downloadProgress}
                  summary={summary}
                  downloadDir={settings?.download_dir ?? null}
                  onDownload={() => void handleDownload()}
                  onCancel={() => void handleCancel()}
                  onReveal={(path) => void handleReveal(path)}
                />
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      <ResourcePreviewModal resource={preview} onClose={() => setPreview(null)} />
    </section>
  );
}
