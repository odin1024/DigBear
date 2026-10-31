import { useEffect, useMemo, useRef, useState } from "react";
import { App as AntApp, Button, Checkbox } from "antd";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { listen } from "@tauri-apps/api/event";
import {
  api,
  type AppSettings,
  type CrawlProgress,
  type CrawlResult,
  type DownloadItemEvent,
  type DownloadProgress,
  type DownloadSummary,
  type MediaKind,
  type MediaResource,
} from "../../shared/api";
import { toAppError } from "../../shared/errors";
import {
  MEDIA_KINDS,
  countResources,
  extractUrl,
  normalizeHttpUrl,
} from "../../shared/format";
import { Mascot, type MascotMood } from "../../shared/components/Mascot";
import { t } from "../../shared/i18n";
import { ArrowLeftIcon, SparkIcon } from "../../shared/components/Icons";
import { CrawlForm } from "./components/CrawlForm";
import { CrawlProgressPanel } from "./components/CrawlProgressPanel";
import { KindFilter } from "./components/KindFilter";
import { ResourceCard, type ResourceStatus } from "./components/ResourceCard";
import { ResourcePreviewModal } from "./components/ResourcePreviewModal";
import { DownloadBar } from "./components/DownloadBar";
import { PawConfetti } from "../../shared/components/PawConfetti";

interface CrawlerViewProps {
  settings: AppSettings | null;
  settingsLoading: boolean;
  resetSignal: number;
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

  const resultsScrollRef = useRef<HTMLDivElement>(null);

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

  const visibleResources = useMemo(
    () => (result?.resources ?? []).filter((resource) => activeKinds.has(resource.kind)),
    [result, activeKinds]
  );

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

  const handleCrawl = async () => {
    if (crawling) return;
    const normalized = normalizeHttpUrl(url.trim()) ?? normalizeHttpUrl(extractUrl(url.trim()));
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

  const handleDownload = async () => {
    if (downloading || selectedResources.length === 0 || !result) return;

    setDownloading(true);
    setSummary(null);
    setStatuses({});
    setDownloadProgress({
      completed: 0,
      total: selectedResources.length,
      current_id: null,
      current_name: null,
    });

    try {
      const next = await api.download({
        page_url: result.final_url || result.page_url,
        items: selectedResources.map((resource) => ({
          id: resource.id,
          url: resource.url,
          kind: resource.kind,
          filename_hint: resource.filename_hint,
        })),
      });
      setSummary(next);
      setStatuses(statusesFromSummary(next));
      setSelected(new Set(next.failures.map((failure) => failure.id)));
      if (next.canceled) {
        message.info(t("下载已取消。", "Download canceled."));
      } else if (next.failed_count > 0) {
        message.warning(t(`收好了 ${next.success_count} 件，${next.failed_count} 件没收到。`, `Saved ${next.success_count}, ${next.failed_count} failed.`));
      } else {
        message.success(t(`收好了，${next.success_count} 件都在袋子里。`, `Saved ${next.success_count} items to your collection.`));
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
    <section className="crawler-view">
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
                onUrlChange={setUrl}
                onCrawl={handleCrawl}
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
                        </div>
                      </div>

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
