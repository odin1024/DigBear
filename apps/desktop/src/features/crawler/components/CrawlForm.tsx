import { Button, Tooltip } from "antd";
import {
  ArrowRightIcon,
  ClipboardIcon,
  CloseIcon,
  GlobeIcon,
  PlusIcon,
} from "../../../shared/components/Icons";
import { t } from "../../../shared/i18n";
import { api } from "../../../shared/api";

interface CrawlFormProps {
  url: string;
  crawling: boolean;
  /** 把当前输入的网址加入批量队列。 */
  onQueue: () => void;
  onUrlChange: (value: string) => void;
  onCrawl: () => void;
  /** 读取剪贴板失败时的提示。 */
  onClipboardError?: (reason: "empty" | "failed") => void;
}

export function CrawlForm({
  url,
  crawling,
  onQueue,
  onUrlChange,
  onCrawl,
  onClipboardError,
}: CrawlFormProps) {
  return (
    <form
      className="search-pill"
      onSubmit={(event) => {
        event.preventDefault();
        onCrawl();
      }}
    >
      <span className="search-pill__icon" aria-hidden="true">
        <GlobeIcon size={20} />
      </span>
      <label className="visually-hidden" htmlFor="crawlUrl">
        {t("网页地址", "Page URL")}
      </label>
      <input
        id="crawlUrl"
        className="search-pill__input"
        value={url}
        placeholder={t(
          "粘贴网页地址，或带链接的分享文字",
          "Paste a page URL or share text with a link",
        )}
        spellCheck={false}
        autoComplete="off"
        disabled={crawling}
        onChange={(event) => onUrlChange(event.target.value)}
      />
      {url && !crawling && (
        <>
          <button
            type="button"
            className="search-pill__queue"
            aria-label={t("加入队列", "Add to queue")}
            title={t("加入队列，批量翻找", "Add to the queue for a batch run")}
            onClick={onQueue}
          >
            <PlusIcon size={15} />
          </button>
          <button
            type="button"
            className="search-pill__clear"
            aria-label={t("清空地址", "Clear URL")}
            onClick={() => onUrlChange("")}
          >
            <CloseIcon size={15} />
          </button>
        </>
      )}
      {!url && !crawling && (
        <Tooltip title={t("从剪贴板读取", "Read from clipboard")}>
          <button
            type="button"
            className="search-pill__clip"
            aria-label={t("从剪贴板读取", "Read from clipboard")}
            onClick={async () => {
              try {
                const text = await api.readClipboard();
                if (text && text.trim()) {
                  onUrlChange(text.trim());
                } else {
                  onClipboardError?.("empty");
                }
              } catch {
                onClipboardError?.("failed");
              }
            }}
          >
            <ClipboardIcon size={15} />
          </button>
        </Tooltip>
      )}
      <Button
        type="primary"
        htmlType="submit"
        className="search-pill__go"
        loading={crawling}
        disabled={!url.trim()}
      >
        {crawling ? t("翻找中…", "Crawling…") : t("开始翻找", "Start crawl")}
        {!crawling && <ArrowRightIcon size={17} />}
      </Button>
    </form>
  );
}
