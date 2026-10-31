import { useEffect, useState } from "react";
import type { FavoriteEntry, HistoryEntry } from "../../../shared/api";
import { t } from "../../../shared/i18n";
import { CloseIcon, LinkIcon, SparkIcon } from "../../../shared/components/Icons";

interface HomeShortcutsProps {
  favorites: FavoriteEntry[];
  history: HistoryEntry[];
  /** 点击某个网址，把它填进输入框。 */
  onPick: (url: string) => void;
  /** 取消收藏。 */
  onRemoveFavorite: (url: string) => void;
  /** 清空历史记录。 */
  onClearHistory: () => void;
}

/** 相对时间：刚刚 / N 分钟前 / N 小时前 / N 天前。 */
function relativeTime(stamp: number): string {
  const now = Date.now();
  const seconds = Math.max(0, Math.floor((now - stamp * 1000) / 1000));
  if (seconds < 60) return t("刚刚", "just now");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t(`${minutes} 分钟前`, `${minutes} min ago`);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t(`${hours} 小时前`, `${hours} h ago`);
  const days = Math.floor(hours / 24);
  if (days < 30) return t(`${days} 天前`, `${days} d ago`);
  return new Date(stamp * 1000).toLocaleDateString();
}

/**
 * 首页的「收藏」与「最近翻找」。
 *
 * 收藏是手动添加的常翻站点；历史是每次翻找后自动记下的最近记录。
 */
export function HomeShortcuts({
  favorites,
  history,
  onPick,
  onRemoveFavorite,
  onClearHistory,
}: HomeShortcutsProps) {
  // 相对时间需要定期刷新，否则「3 分钟前」会一直停在那里。
  useTicker();

  if (favorites.length === 0 && history.length === 0) return null;

  return (
    <div className="home-shortcuts">
      {favorites.length > 0 && (
        <section className="shortcut-group" aria-label={t("收藏", "Favorites")}>
          <h2 className="shortcut-group__title">
            <SparkIcon size={14} />
            {t("收藏的站点", "Favorites")}
          </h2>
          <ul className="shortcut-list">
            {favorites.map((item) => (
              <li key={item.id} className="shortcut-chip shortcut-chip--favorite">
                <button
                  type="button"
                  className="shortcut-chip__main"
                  title={item.url}
                  onClick={() => onPick(item.url)}
                >
                  <LinkIcon size={13} />
                  <span>{item.host || item.title}</span>
                </button>
                <button
                  type="button"
                  className="shortcut-chip__close"
                  aria-label={t("取消收藏", "Remove from favorites")}
                  title={t("取消收藏", "Remove from favorites")}
                  onClick={() => onRemoveFavorite(item.url)}
                >
                  <CloseIcon size={12} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {history.length > 0 && (
        <section className="shortcut-group" aria-label={t("最近翻找", "Recent")}>
          <h2 className="shortcut-group__title">
            <LinkIcon size={14} />
            {t("最近翻找", "Recent")}
            <button
              type="button"
              className="rb-text-link shortcut-group__clear"
              onClick={onClearHistory}
            >
              {t("清空", "Clear")}
            </button>
          </h2>
          <ul className="shortcut-list">
            {history.slice(0, 12).map((item) => (
              <li key={item.id} className="shortcut-chip">
                <button
                  type="button"
                  className="shortcut-chip__main"
                  title={item.url}
                  onClick={() => onPick(item.url)}
                >
                  <span>{item.host || item.title}</span>
                  <em className="shortcut-chip__count">{item.total}</em>
                  <em className="shortcut-chip__time">{relativeTime(item.crawled_at)}</em>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** 每分钟触发一次重渲染，用来刷新相对时间。 */
function useTicker(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return tick;
}