import { DigBearError } from "./api";
import { getLocale, t } from "./i18n";

export interface AppError {
  code: string;
  message: string;
}

const FALLBACKS: Record<string, string> = {
  get invalid_url() { return t("链接格式不正确，只支持 http / https 页面。", "Invalid link. Only http/https pages are supported."); },
  get crawl_failed() { return t("页面爬取失败，请稍后重试或换一个地址。", "The crawl failed. Try again or use another URL."); },
  get no_resources() { return t("没有在这个页面发现可下载的媒体资源。", "No downloadable media was found on this page."); },
  get login_required() { return t("该页面需要登录。请到「设置 → 登录站点」登录后重新爬取。", "This page requires login. Sign in from Settings → Login sites, then crawl again."); },
  get download_failed() { return t("下载没有完成，请稍后重试。", "The download did not finish. Please try again."); },
  get no_selection() { return t("还没有选择要下载的资源。", "No resources selected."); },
  get canceled() { return t("下载已取消。", "Download canceled."); },
  get settings_failed() { return t("设置读写失败，请稍后重试。", "Could not read or write settings. Please try again."); },
  get session_failed() { return t("登录态读取失败，请稍后重试。", "Could not read the session. Please try again."); },
  get not_found() { return t("文件或文件夹不存在，可能已经被移动。", "The file or folder does not exist; it may have been moved."); },
  get internal_error() { return t("本机服务遇到问题，请稍后重试。", "The local service hit a problem. Please try again."); },
  get not_tauri() { return t("当前在浏览器中预览，桌面能力不可用。请用 npm run tauri dev 启动应用。", "Desktop features are unavailable in the browser preview. Start the app with pnpm dev:desktop."); },
  get unknown() { return t("遇到了一点问题，请稍后重试。", "Something went wrong. Please try again."); },
};

export function toAppError(error: unknown): AppError {
  if (error instanceof DigBearError) {
    return {
      code: error.code,
      message:
        getLocale() === "en"
          ? FALLBACKS[error.code] || FALLBACKS.unknown
          : error.message?.trim() || FALLBACKS[error.code] || FALLBACKS.unknown,
    };
  }
  if (error instanceof Error && error.message) {
    return { code: "unknown", message: error.message };
  }
  if (typeof error === "string" && error.trim()) {
    return { code: "unknown", message: error };
  }
  return { code: "unknown", message: FALLBACKS.unknown };
}

export function isLoginRequired(error: AppError | null | undefined): boolean {
  return error?.code === "login_required";
}

export function isCanceled(error: AppError | null | undefined): boolean {
  return error?.code === "canceled";
}
