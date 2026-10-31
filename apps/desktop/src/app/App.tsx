import { useCallback, useEffect, useState } from "react";
import { App as AntApp } from "antd";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { api, type AppSettings } from "../shared/api";
import { toAppError, type AppError } from "../shared/errors";
import { Masthead, type AppView } from "./Masthead";
import { detectLocale, resolveLocale, setLocale, t } from "../shared/i18n";
import { cssVarsFor, DEFAULT_THEME, type ThemeName } from "../theme";
import { CrawlerView } from "../features/crawler/CrawlerView";
import { SettingsView } from "../features/settings/SettingsView";

interface AppProps {
  onThemeChange: (name: ThemeName) => void;
}

export default function App({ onThemeChange }: AppProps) {
  const { message, modal } = AntApp.useApp();
  const [inTauriApp] = useState(() => isTauri());

  const [view, setView] = useState<AppView>("crawler");
  const [resetSignal, setResetSignal] = useState(0);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsError, setSettingsError] = useState<AppError | null>(null);
  const [prefillUrl, setPrefillUrl] = useState("");
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [settingsWarm, setSettingsWarm] = useState(false);

  const locale = settings ? resolveLocale(settings.language) : detectLocale();
  setLocale(locale);

  /* 主题：CSS 变量与 antd token 同源，都来自 src/theme.ts。 */
  useEffect(() => {
    const name = (settings?.theme as ThemeName) ?? DEFAULT_THEME;
    onThemeChange(name);
    const vars = cssVarsFor(name);
    let style = document.getElementById("theme-vars");
    if (!style) {
      style = document.createElement("style");
      style.id = "theme-vars";
      document.head.appendChild(style);
    }
    // 用 html:root 提高特异性：构建产物里样式表的顺序不保证，
    // 只靠 :root 会输给 styles.css 的默认值。
    style.textContent = `html:root {${Object.entries(vars)
      .map(([key, value]) => `${key}:${value};`)
      .join("")}}`;
    document.documentElement.dataset.theme = name;
  }, [settings?.theme, onThemeChange]);

  useEffect(() => {
    document.documentElement.lang = locale === "en" ? "en" : "zh-CN";
    if (!inTauriApp) return;
    void api.setAppLanguage(locale).catch(() => {
      /* menu update is best-effort */
    });
  }, [inTauriApp, locale]);

  const loadSettings = useCallback(async () => {
    if (!inTauriApp) {
      setSettingsLoading(false);
      setSettingsError({
        code: "not_tauri",
        message: t("当前在浏览器中预览，桌面能力不可用。", "Desktop features are unavailable in the browser preview."),
      });
      return;
    }
    setSettingsLoading(true);
    try {
      const next = await api.settings();
      setSettings(next);
      setSettingsError(null);
    } catch (error) {
      setSettingsError(toAppError(error));
      message.error(t("读取设置失败，请重试。", "Could not load settings. Please try again."));
    } finally {
      setSettingsLoading(false);
    }
  }, [inTauriApp, message]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  /* 命令行 `--crawl <url>`：启动即翻找，直接停在结果页。 */
  useEffect(() => {
    if (!inTauriApp) return;
    let cancelled = false;
    void api
      .startUrl()
      .then((url) => {
        if (!url || cancelled) return;
        setPendingUrl(url);
      })
      .catch(() => {
        /* 命令行翻找是可选能力，取不到就忽略 */
      });
    return () => {
      cancelled = true;
    };
  }, [inTauriApp]);

  /* Pre-mount Settings after first paint so switching to it never has to
     render the whole page (sliders, extension panel, login list) in one frame. */
  useEffect(() => {
    if (settingsLoading || settingsWarm) return undefined;
    const timer = window.setTimeout(() => setSettingsWarm(true), 500);
    return () => window.clearTimeout(timer);
  }, [settingsLoading, settingsWarm]);

  const showAbout = useCallback(() => {
    modal.info({
      title: t("关于掘掘熊", "About DigBear"),
      centered: true,
      okText: t("知道了", "Got it"),
      className: "about-modal",
      content: (
        <div className="about-modal__body">
          <p className="about-modal__name">{t("掘掘熊 · DigBear", "DigBear")}</p>
          <p>
            {t(
              "一款开源的网页媒体翻找小工具，只在你的电脑上只读工作。",
              "An open-source media crawler that only reads pages locally on your computer.",
            )}
          </p>
          <p>
            {t(
              "我们鼓励把它用于学习与个人素材整理，不提倡、也不鼓励用于任何不当用途。请遵守目标网站的服务条款与著作权法律，只保存你有权使用的内容。",
              "Use it for learning and organizing your own media. Respect each site's terms and copyright; save only content you are allowed to use.",
            )}
          </p>
          <p className="about-modal__version">v0.3.2</p>
        </div>
      ),
    });
  }, [modal]);

  /* Native app menu: only 设置 / 关于. */
  useEffect(() => {
    if (!inTauriApp) return undefined;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    listen<string>("app-menu", (event) => {
      if (event.payload === "settings") setView("settings");
      else if (event.payload === "about") showAbout();
    })
      .then((off) => {
        if (disposed) off();
        else unlisten = off;
      })
      .catch(() => {
        /* listener API unavailable in preview. */
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [inTauriApp, showAbout]);

  /* The app is a tool, not a document: no browser context menu, no text selection. */
  useEffect(() => {
    const block = (event: MouseEvent) => event.preventDefault();
    document.addEventListener("contextmenu", block, { capture: true });
    return () => document.removeEventListener("contextmenu", block, { capture: true });
  }, []);

  const openSettings = (prefill?: string) => {
    if (prefill) setPrefillUrl(prefill);
    setView("settings");
  };

  const handleSaved = (next: AppSettings) => {
    setSettings(next);
    setSettingsError(null);
    message.success(t("设置已保存。", "Settings saved."));
  };

  const navigate = (next: AppView) => {
    if (next === "crawler") {
      // Re-entering 翻找 always starts from a clean home page.
      setResetSignal((value) => value + 1);
    }
    setView(next);
  };

  return (
    <div className="rb-app">
      <div className="paper-dots" aria-hidden="true" />
      <a className="skip-link" href="#main">
        {t("跳到主要内容", "Skip to main content")}
      </a>

      <Masthead view={view} onNavigate={navigate} />

      <main className="app-main" id="main">
        <div className="view-slot view-slot--crawler" hidden={view !== "crawler"}>
          <CrawlerView
            settings={settings}
            settingsLoading={settingsLoading}
            resetSignal={resetSignal}
            initialUrl={pendingUrl}
            onOpenSettings={openSettings}
          />
        </div>

        <div className="view-slot view-slot--settings" hidden={view !== "settings"}>
          {(settingsWarm || view === "settings") && (
            <SettingsView
              active={view === "settings"}
              inTauriApp={inTauriApp}
              settings={settings}
              loading={settingsLoading}
              error={settingsError}
              prefillUrl={prefillUrl}
              onPrefillConsumed={() => setPrefillUrl("")}
              onSaved={handleSaved}
              onRefresh={() => void loadSettings()}
            />
          )}
        </div>
      </main>
    </div>
  );
}
