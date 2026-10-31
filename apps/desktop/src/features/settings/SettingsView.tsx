import { useEffect, useMemo, useState } from "react";
import { App as AntApp, Button, Input, InputNumber, Segmented, Slider, Switch } from "antd";
import { motion, useReducedMotion } from "framer-motion";
import {
  api,
  type AppSettings,
  type MediaKind,
} from "../../shared/api";
import { toAppError, type AppError } from "../../shared/errors";
import { KIND_LABELS, MEDIA_KINDS, prettyPath } from "../../shared/format";
import {
  ArrowRightIcon,
  FolderIcon,
  kindIcon,
  PawIcon,
} from "../../shared/components/Icons";
import { LoginSites } from "./components/LoginSites";
import { t } from "../../shared/i18n";
import { THEME_LABELS, THEME_NAMES } from "../../theme";
import { ExtensionsPanel } from "./components/ExtensionsPanel";

interface SettingsViewProps {
  active: boolean;
  inTauriApp: boolean;
  settings: AppSettings | null;
  loading: boolean;
  error: AppError | null;
  prefillUrl: string;
  onPrefillConsumed: () => void;
  onSaved: (settings: AppSettings) => void;
  onRefresh: () => void;
}

function cloneSettings(settings: AppSettings): AppSettings {
  return {
    ...settings,
    default_kinds: [...settings.default_kinds],
    sites: settings.sites.map((site) => ({ ...site })),
  };
}

function fingerprint(settings: AppSettings): string {
  return JSON.stringify({
    ...settings,
    default_kinds: MEDIA_KINDS.filter((kind) => settings.default_kinds.includes(kind)),
  });
}

export function SettingsView({
  active,
  inTauriApp,
  settings,
  loading,
  error,
  prefillUrl,
  onPrefillConsumed,
  onSaved,
  onRefresh,
}: SettingsViewProps) {
  const { message } = AntApp.useApp();
  const reduceMotion = useReducedMotion();
  const [draft, setDraft] = useState<AppSettings | null>(
    settings ? cloneSettings(settings) : null
  );
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    setDraft(settings ? cloneSettings(settings) : null);
  }, [settings]);

  const dirty = useMemo(() => {
    if (!draft || !settings) return false;
    return fingerprint(draft) !== fingerprint(settings);
  }, [draft, settings]);

  const update = (patch: Partial<AppSettings>) => {
    setDraft((previous) => (previous ? { ...previous, ...patch } : previous));
  };

  const toggleKind = (kind: MediaKind) => {
    if (!draft) return;
    const has = draft.default_kinds.includes(kind);
    const next = has
      ? draft.default_kinds.filter((item) => item !== kind)
      : [...draft.default_kinds, kind];
    update({ default_kinds: next });
  };

  const handlePickFolder = async () => {
    setPicking(true);
    try {
      const dir = await api.pickDownloadDir();
      if (dir) {
        update({ download_dir: dir });
        message.success(t("选好了，保存后生效。", "Selected. It takes effect after saving."));
      }
    } catch (pickerError) {
      message.error(toAppError(pickerError).message);
    } finally {
      setPicking(false);
    }
  };

  const handleOpenFolder = async () => {
    if (!draft) return;
    try {
      await api.revealPath(draft.download_dir);
    } catch (folderError) {
      message.error(toAppError(folderError).message);
    }
  };

  const handleSave = async () => {
    if (!draft || saving) return;
    if (draft.default_kinds.length === 0) {
      message.error(t("至少留一种类型，不然每次翻找都是空的。", "Keep at least one media type selected."));
      return;
    }
    if (!inTauriApp) {
      message.error(t("浏览器预览模式无法保存设置。", "Settings cannot be saved in the browser preview."));
      return;
    }

    setSaving(true);
    try {
      const next = await api.saveSettings({
        ...draft,
        concurrency: Math.min(5, Math.max(1, draft.concurrency)),
        max_items: Math.min(2000, Math.max(50, draft.max_items)),
        retry_count: Math.min(5, Math.max(0, draft.retry_count)),
      });
      setDraft(cloneSettings(next));
      onSaved(next);
    } catch (saveFailure) {
      message.error(toAppError(saveFailure).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading && !draft) {
    return (
      <section className="settings-view">
        <div className="settings-scroll">
          <header className="settings-head">
            <h1>{t("设置", "Settings")}</h1>
          </header>
          <div className="panel settings-loading" role="status" aria-live="polite">
            {t("正在读取本机设置…", "Loading local settings…")}
          </div>
        </div>
      </section>
    );
  }

  if (!draft) {
    return (
      <section className="settings-view">
        <div className="settings-scroll">
          <header className="settings-head">
            <h1>{t("设置", "Settings")}</h1>
          </header>
          <div className="panel settings-loading">
            <p>{error?.message || t("设置读取失败。", "Could not load settings.")}</p>
            <button type="button" className="rb-text-link" onClick={onRefresh}>
              {t("重新读取", "Reload")}
            </button>
          </div>
        </div>
      </section>
    );
  }

  const sectionMotion = (index: number) => ({
    initial: reduceMotion ? false : { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.3, delay: 0.04 * index },
  });

  return (
    <section className="settings-view">
      <div className="settings-scroll">
      <header className="settings-head">
        <motion.h1
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 240, damping: 24 }}
        >
          {t("设置", "Settings")}
        </motion.h1>
        <div className="settings-head__status">
          <span className="settings-head__status-dot" data-dirty={dirty || undefined} />
          {dirty ? t("有改动没保存", "Unsaved changes") : t("都存好了", "All saved")}
        </div>
      </header>

      <div className="settings-grid">
        <div className="settings-col">
          <motion.section
            className="panel settings-card"
            aria-labelledby="folderTitle"
            {...sectionMotion(0)}
          >
            <div className="panel__head">
              <h2 id="folderTitle">{t("保存位置", "Download folder")}</h2>
            </div>
            <div className="folder-field">
              <span className="folder-field__icon" aria-hidden="true">
                <FolderIcon size={18} />
              </span>
              <span className="folder-field__path" title={draft.download_dir}>
                {prettyPath(draft.download_dir)}
              </span>
              <div className="folder-field__actions">
                <Button
                  className="rb-btn rb-btn--text rb-btn--sm"
                  loading={picking}
                  onClick={() => void handlePickFolder()}
                >
                  {t("换一个", "Change")}
                </Button>
                <Button
                  className="rb-btn rb-btn--text rb-btn--sm"
                  onClick={() => void handleOpenFolder()}
                >
                  {t("打开", "Open")}
                </Button>
              </div>
            </div>
          </motion.section>

          <motion.div {...sectionMotion(1)}>
            <ExtensionsPanel active={active} inTauriApp={inTauriApp} />
          </motion.div>

          <motion.section
            className="panel settings-card"
            aria-labelledby="defaultsTitle"
            {...sectionMotion(2)}
          >
            <div className="panel__head">
              <h2 id="defaultsTitle">{t("翻找默认值", "Crawl defaults")}</h2>
            </div>

            <div className="setting-block">
              <div className="setting-block__label">
                <span>{t("默认类型", "Default types")}</span>
              </div>
              <div className="kind-picker" role="group" aria-label={t("默认采集类型", "Default media types")}>
                {MEDIA_KINDS.map((kind) => {
                  const Icon = kindIcon(kind);
                  const checked = draft.default_kinds.includes(kind);
                  return (
                    <button
                      key={kind}
                      type="button"
                      className="kind-chip kind-chip--picker"
                      data-active={checked || undefined}
                      aria-pressed={checked}
                      onClick={() => toggleKind(kind)}
                    >
                      <Icon size={15} />
                      <span className="kind-chip__label">{KIND_LABELS[kind]}</span>
                    </button>
                  );
                })}
              </div>
              {draft.default_kinds.length === 0 && (
                <p className="setting-block__error">{t("至少留一种默认类型。", "Keep at least one default type.")}</p>
              )}
            </div>

            <div className="setting-block setting-block--row">
              <div className="setting-block__label">
                <span>{t("同时下载", "Concurrent downloads")}</span>
              </div>
              <div className="slider-field">
                <Slider
                  min={1}
                  max={5}
                  step={1}
                  value={draft.concurrency}
                  onChange={(value) => update({ concurrency: Number(value) })}
                  tooltip={{ formatter: null }}
                  aria-label={t("并发下载数", "Concurrent download count")}
                />
                <span className="slider-field__value">{draft.concurrency}</span>
              </div>
            </div>

            <div className="setting-block setting-block--row">
              <div className="setting-block__label">
                <span>{t("自动滚动", "Auto scroll")}</span>
              </div>
              <Switch
                checked={draft.scroll_page}
                onChange={(checked) => update({ scroll_page: checked })}
                aria-label={t("自动滚动加载", "Auto scroll to load content")}
              />
            </div>

            <div className="setting-block setting-block--row">
              <div className="setting-block__label">
                <span>{t("界面主题", "Theme")}</span>
              </div>
              <Segmented
                value={draft.theme}
                onChange={(value) => update({ theme: String(value) })}
                options={THEME_NAMES.map((name) => ({
                  value: name,
                  label: t(THEME_LABELS[name][0], THEME_LABELS[name][1]),
                }))}
                aria-label={t("界面主题", "UI theme")}
              />
            </div>

            <div className="setting-block setting-block--row">
              <div className="setting-block__label">
                <span>{t("文件名模板", "File name template")}</span>
              </div>
              <div className="template-field">
                <Input
                  className="rb-input"
                  value={draft.filename_template}
                  placeholder="{name}"
                  onChange={(event) => update({ filename_template: event.target.value })}
                  aria-label={t("文件名模板", "File name template")}
                />
                <p className="template-field__hint">
                  {t(
                    "可用占位符：{name} {site} {kind} {index} {date}",
                    "Placeholders: {name} {site} {kind} {index} {date}"
                  )}
                </p>
              </div>
            </div>

            <div className="setting-block setting-block--row">
              <div className="setting-block__label">
                <span>{t("失败重试", "Retry failed downloads")}</span>
              </div>
              <div className="number-field">
                <InputNumber
                  className="rb-number"
                  min={0}
                  max={5}
                  step={1}
                  value={draft.retry_count}
                  onChange={(value) => {
                    if (typeof value === "number") update({ retry_count: value });
                  }}
                  aria-label={t("下载失败重试次数", "Retries per failed download")}
                />
                <span className="number-field__suffix">{t("次", "times")}</span>
              </div>
            </div>

            <div className="setting-block setting-block--row setting-block--last">
              <div className="setting-block__label">
                <span>{t("单次最多", "Max items per crawl")}</span>
              </div>
              <div className="number-field">
                <InputNumber
                  className="rb-number"
                  min={50}
                  max={2000}
                  step={50}
                  value={draft.max_items}
                  onChange={(value) => {
                    if (typeof value === "number") update({ max_items: value });
                  }}
                  aria-label={t("单次最多采集数量", "Maximum items per crawl")}
                />
                <span className="number-field__suffix">{t("件", "items")}</span>
              </div>
            </div>
          </motion.section>
        </div>

        <div className="settings-col">
          <motion.section
            className="panel settings-card"
            aria-labelledby="languageTitle"
            {...sectionMotion(2)}
          >
            <div className="panel__head">
              <h2 id="languageTitle">{t("语言", "Language")}</h2>
            </div>
            <div className="setting-block setting-block--row setting-block--last">
              <div className="setting-block__label">
                <span>{t("界面语言", "Interface language")}</span>
              </div>
              <Segmented
                value={draft.language}
                onChange={(value) => update({ language: value as "auto" | "zh" | "en" })}
                options={[
                  { label: t("跟随系统", "System"), value: "auto" },
                  { label: "中文", value: "zh" },
                  { label: "English", value: "en" },
                ]}
              />
            </div>
          </motion.section>

          <motion.div {...sectionMotion(3)}>
            <LoginSites
              sites={draft.sites}
              active={active}
              prefillUrl={prefillUrl}
              onPrefillConsumed={onPrefillConsumed}
              onChange={(sites) => update({ sites })}
            />
          </motion.div>

          <motion.section
            className="panel settings-card about-card"
            aria-labelledby="aboutTitle"
            {...sectionMotion(4)}
          >
            <div className="panel__head">
              <h2 id="aboutTitle">{t("关于", "About")}</h2>
            </div>
            <div className="about-brand">
              <span className="about-brand__mark" aria-hidden="true">
                <PawIcon size={24} />
              </span>
              <div>
                <p className="about-brand__name">{t("掘掘熊 · DigBear", "DigBear")}</p>
                <p className="about-brand__version">v0.3.2</p>
              </div>
            </div>
            <p className="about-copy">
              {t(
                "掘掘熊是一款开源学习小工具，只读翻找公开页面，不提倡也不鼓励用于任何不当用途。请遵守目标网站的服务条款与著作权法律，只保存你有权使用的内容。",
                "DigBear is an open-source learning tool that only reads public pages. Use it responsibly, follow each site's terms and copyright law, and save only content you are allowed to use.",
              )}
            </p>
            <button type="button" className="rb-text-link about-refresh" onClick={onRefresh}>
              {t("重新读取设置", "Reload settings")}
            </button>
          </motion.section>
        </div>
      </div>
      </div>

      <div className="settings-savebar">
        <div className="settings-savebar__status">
          <p>{dirty ? t("改完记得保存。", "Remember to save your changes.") : t("都存好了。", "Everything is saved.")}</p>
        </div>
        <div className="settings-savebar__actions">
          {dirty && (
            <button
              type="button"
              className="rb-text-link"
              onClick={() => setDraft(settings ? cloneSettings(settings) : null)}
            >
              {t("放弃改动", "Discard changes")}
            </button>
          )}
          <Button
            type="primary"
            className="rb-btn rb-btn--primary settings-save"
            loading={saving}
            disabled={!dirty || saving}
            onClick={() => void handleSave()}
          >
            {t("保存设置", "Save settings")}
            {!saving && <ArrowRightIcon size={15} />}
          </Button>
        </div>
      </div>
    </section>
  );
}
