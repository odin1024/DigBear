import { Button } from "antd";
import {
  ArrowRightIcon,
  CloseIcon,
  GlobeIcon,
} from "../../../shared/components/Icons";
import { t } from "../../../shared/i18n";

interface CrawlFormProps {
  url: string;
  crawling: boolean;
  onUrlChange: (value: string) => void;
  onCrawl: () => void;
}

export function CrawlForm({ url, crawling, onUrlChange, onCrawl }: CrawlFormProps) {
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
        <button
          type="button"
          className="search-pill__clear"
          aria-label={t("清空地址", "Clear URL")}
          onClick={() => onUrlChange("")}
        >
          <CloseIcon size={15} />
        </button>
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
