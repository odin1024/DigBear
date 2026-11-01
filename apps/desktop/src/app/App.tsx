import { useCallback, useEffect, useRef, useState } from "react";
import { App as AntApp } from "antd";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { api, type AppSettings } from "../shared/api";
import { toAppError, type AppError } from "../shared/errors";
import { Masthead, type AppView } from "./Masthead";
import { detectLocale, resolveLocale, setLocale, t } from "../shared/i18n";
import { cssVarsFor, DEFAULT_THEME, THEME_NAMES, type ThemeName } from "../theme";
import { REPO_URL } from "../shared/version";
import { CrawlerView } from "../features/crawler/CrawlerView";
import { SettingsView } from "../features/settings/SettingsView";
import { AboutView } from "../features/about/AboutView";

interface AppProps {
  onThemeChange: (name: ThemeName) => void;
}

export default function App({ onThemeChange }: AppProps) {
  const { message } = AntApp.useApp();
  const [inTauriApp] = useState(() => isTauri());

  const [view, setView] = useState<AppView>("crawler");
  const [resetSignal, setResetSignal] = useState(0);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsError, setSettingsError] = useState<AppError | null>(null);
  const [prefillUrl, setPrefillUrl] = useState("");
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [pendingFolder, setPendingFolder] = useState<string | null>(null);
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

  /* 命令行 `--folder <path>`：资源管理器右键菜单进来的文件夹。 */
  useEffect(() => {
    if (!inTauriApp) return;
    let cancelled = false;
    void api
      .startFolder()
      .then((folder) => {
        if (!cancelled && folder) setPendingFolder(folder);
      })
      .catch(() => {
        /* 取不到就忽略 */
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

  const openAbout = useCallback(() => setView("about"), []);

  /* 原生菜单里的「视图 → 主题」：立即生效并写回设置。 */
  const settingsRef = useRef<AppSettings | null>(null);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const applyTheme = useCallback(
    (name: string) => {
      const theme = (THEME_NAMES as readonly string[]).includes(name)
        ? (name as ThemeName)
        : DEFAULT_THEME;
      onThemeChange(theme);
      const current = settingsRef.current;
      if (!current) return;
      const next = { ...current, theme };
      setSettings(next);
      void api.saveSettings(next).catch(() => {
        message.error(t("保存主题失败。", "Could not save the theme."));
      });
    },
    [message, onThemeChange]
  );

  /* Native app menu: only 设置 / 关于. */
  useEffect(() => {
    if (!inTauriApp) return undefined;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    listen<string>("app-menu", (event) => {
      const id = event.payload;
      if (id === "settings") setView("settings");
      else if (id === "about") openAbout();
      else if (id === "crawler") {
        setResetSignal((value) => value + 1);
        setView("crawler");
      } else if (id === "repo") {
        if (REPO_URL) {
          void api.openUrl(REPO_URL);
        } else {
          message.info(t("开源仓库地址待公布。", "The repository URL is coming soon."));
        }
      } else if (id.startsWith("theme:")) {
        applyTheme(id.slice("theme:".length));
      }
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
  }, [inTauriApp, openAbout, applyTheme]);

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
            initialFolder={pendingFolder}
            onOpenSettings={openSettings}
          />
        </div>

        <div className="view-slot view-slot--about" hidden={view !== "about"}>
          <AboutView onOpenSettings={() => setView("settings")} />
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
