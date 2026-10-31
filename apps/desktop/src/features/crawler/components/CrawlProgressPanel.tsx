import { motion, useReducedMotion } from "framer-motion";
import type { CrawlProgress } from "../../../shared/api";
import { getLocale, t } from "../../../shared/i18n";

const STAGE_LABELS: Record<string, string> = {
  get loading() { return t("正在打开页面", "Opening page"); },
  get extracting() { return t("正在翻找资源", "Finding media"); },
  get done() { return t("翻找完成", "Crawl complete"); },
};

interface CrawlProgressPanelProps {
  progress: CrawlProgress | null;
}

export function CrawlProgressPanel({ progress }: CrawlProgressPanelProps) {
  const reduceMotion = useReducedMotion();
  const percent = Math.max(0, Math.min(100, Math.round(progress?.percent ?? 0)));
  const stage = progress?.stage ?? "loading";

  return (
    <div className="crawl-progress" role="status" aria-live="polite">
      <div className="crawl-progress__head">
        <span className="crawl-progress__stage">{STAGE_LABELS[stage] ?? t("翻找中", "Crawling")}</span>
        <span className="crawl-progress__message">
          {getLocale() === "en"
            ? t("正在打开页面并扫描媒体资源…", "Opening the page and scanning for media…")
            : progress?.message || t("正在打开页面并扫描媒体资源…", "Opening the page and scanning for media…")}
        </span>
      </div>

      <div className="crawl-progress__track">
        <motion.span
          className="crawl-progress__fill"
          initial={false}
          animate={{ width: `${percent}%` }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { type: "spring", stiffness: 120, damping: 22, mass: 0.8 }
          }
        />
        <motion.span
          key={percent}
          className="crawl-progress__percent"
          initial={reduceMotion ? false : { scale: 0.86, opacity: 0.4 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 18 }}
        >
          {percent}%
        </motion.span>
      </div>
    </div>
  );
}
