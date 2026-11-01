// 为官网拍摄「首页 / 结果页 / 设置页」三张演示截图。
//
// 做法：起一个本地静态服务器放演示配图，再用 Playwright 打开前端预览，
// 注入一份假的 Tauri IPC 实现，让界面认为自己在桌面端跑。
// 所有数据都是演示用的，不含任何真实站点、账号或个人信息。
//
// 用法：
//   node scripts/shoot_site_shots.mjs
import { chromium } from "playwright-core";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const assetsDir = path.join(root, "_test-artifacts", "demo-assets");
const outDir = path.join(root, "apps", "website", "public", "assets", "shots");
const chrome = path.join(process.env.LOCALAPPDATA || "", "ms-playwright", "chromium-1248", "chrome-win64", "chrome.exe");
const APP_URL = process.env.DIGBEAR_PREVIEW_URL || "http://localhost:4173";
const PORT = 8899;

fs.mkdirSync(outDir, { recursive: true });

// ---------- 1. 演示素材服务器 ----------
const MIME = { ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".mp4": "video/mp4", ".mp3": "audio/mpeg", ".woff2": "font/woff2" };
const server = http.createServer((req, res) => {
  const name = decodeURIComponent((req.url || "/").split("?")[0]).replace(/^\/+/, "");
  const file = path.join(assetsDir, name);
  if (!file.startsWith(assetsDir) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404).end("not found");
    return;
  }
  res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(PORT, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${PORT}`;

// ---------- 2. 演示数据 ----------
const img = (i, w, h) => ({
  id: `image-${i}`,
  url: `${base}/photo-0${i}.jpg`,
  kind: "image",
  source: "img",
  filename_hint: `photo-0${i}.jpg`,
  width: w, height: h, duration: null, poster: null,
  alt: null, host: "demo.example.com",
});

const resources = [
  img(1, 1200, 900), img(2, 1600, 900), img(3, 1000, 1000), img(4, 1200, 900),
  img(5, 1600, 900), img(6, 1000, 1000), img(7, 1200, 900), img(8, 1600, 900),
  {
    id: "video-1", url: `${base}/demo-clip-1.mp4`, kind: "video", source: "video",
    filename_hint: "demo-clip-1.mp4", width: 1920, height: 1080, duration: 42.6,
    poster: `${base}/clip-01.jpg`, alt: null, host: "demo.example.com",
  },
  {
    id: "video-2", url: `${base}/demo-clip-2.mp4`, kind: "video", source: "video",
    filename_hint: "demo-clip-2.mp4", width: 1280, height: 720, duration: 18.4,
    poster: `${base}/clip-02.jpg`, alt: null, host: "demo.example.com",
  },
  {
    id: "audio-1", url: `${base}/demo-track-1.mp3`, kind: "audio", source: "audio",
    filename_hint: "demo-track-1.mp3", width: null, height: null, duration: 214.0,
    poster: null, alt: null, host: "demo.example.com",
  },
  {
    id: "audio-2", url: `${base}/demo-track-2.mp3`, kind: "audio", source: "audio",
    filename_hint: "demo-track-2.mp3", width: null, height: null, duration: 97.0,
    poster: null, alt: null, host: "demo.example.com",
  },
  {
    id: "font-1", url: `${base}/demo-font.woff2`, kind: "font", source: "css_font_face",
    filename_hint: "demo-font.woff2", width: null, height: null, duration: null,
    poster: null, alt: null, host: "demo.example.com",
  },
];

const settings = {
  download_dir: "C:\\Users\\Demo\\Downloads\\DigBear",
  default_kinds: ["image", "video", "audio", "font"],
  concurrency: 3,
  scroll_page: true,
  max_items: 500,
  sites: [],
  language: "zh",
  retry_count: 2,
  theme: "lantern",
  filename_template: "{name}",
  organize_by_kind: false,
};

const crawlResult = {
  page_url: "https://demo.example.com/gallery",
  final_url: "https://demo.example.com/gallery",
  title: "示例图库 · Demo Gallery",
  host: "demo.example.com",
  resources,
  counts: { image: 8, video: 2, audio: 2, font: 1, other: 0 },
  warnings: [],
  needs_login: false,
  enhanced: false,
};

// ---------- 3. 注入假 IPC ----------
function installMock(payload) {
  const settings = payload.settings;
  const crawlResult = payload.crawlResult;
  const answers = {
    get_settings: () => settings,
    save_settings: (args) => args.settings,
    app_start_url: () => null,
    app_start_folder: () => null,
    list_history: () => [],
    list_favorites: () => [],
    record_history: () => [],
    clear_history: () => [],
    toggle_favorite: () => [],
    remove_favorite: () => [],
    list_extensions: () => [{
      id: "ffmpeg",
      name: "FFmpeg",
      description: "下载 HLS / DASH 流、合并音视频时要用的组件。",
      version: "6.1.1",
      installed: false,
      installed_version: null,
      path: null,
      size_bytes: null,
      download_size: 29581307,
      license: "GPL",
      can_install: true,
    }],
    read_clipboard: () => "",
    disk_space: () => ({ available: 214748364800, total: 1099511627776 }),
    crawl_site: () => crawlResult,
    download_media: () => ({ folder: "C:\\Users\\Demo\\Downloads\\DigBear", success_count: 0, failed_count: 0, canceled: false, files: [] }),
    set_app_language: () => null,
    cancel_download: () => false,
    scan_folder_urls: () => ({ urls: [], scanned: 0 }),
  };
  let callbackId = 0;
  const callbacks = new Map();
  window.__TAURI_INTERNALS__ = {
    invoke: async (cmd, args) => {
      if (cmd === "plugin:event|listen") return 1;
      if (cmd === "plugin:event|unlisten") return null;
      if (cmd === "plugin:event|emit") return null;
      const fn = answers[cmd];
      if (!fn) return null;
      // 模拟一点加载耗时，让进度条有动画
      if (cmd === "crawl_site") await new Promise((r) => setTimeout(r, 900));
      return fn(args || {});
    },
    transformCallback: (cb) => {
      const id = ++callbackId;
      callbacks.set(id, cb);
      return id;
    },
    unregisterCallback: (id) => callbacks.delete(id),
    convertFileSrc: (p) => p,
    metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
  };
  window.isTauri = true;
}

// ---------- 4. 截图 ----------
const browser = await chromium.launch({ executablePath: chrome, headless: true });

async function shoot(name, prepare) {
  const page = await browser.newPage({ viewport: { width: 1240, height: 780 }, deviceScaleFactor: 2 });
  await page.addInitScript(installMock, { settings, crawlResult });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("response", (r) => { if (r.status() >= 400) errors.push(r.status() + " " + r.url()); });

  await page.goto(APP_URL, { waitUntil: "networkidle" });
  if (process.env.DIGBEAR_SHOT_DEBUG) {
    const probe = await page.evaluate(() => ({
      isTauri: !!window.isTauri,
      hasInternals: !!window.__TAURI_INTERNALS__,
      nav: Array.from(document.querySelectorAll(".main-nav__item")).map((e) => e.textContent.trim()),
    }));
    console.log("[debug]", name, JSON.stringify(probe));
  }
  await page.waitForTimeout(1200);
  if (prepare) await prepare(page);
  await page.waitForTimeout(1200);

  const facts = await page.evaluate(() => {
    const imgs = Array.from(document.images);
    return {
      cards: document.querySelectorAll(".resource-card, .resource-item, [class*='resource']").length,
      images: imgs.length,
      imagesOk: imgs.filter((i) => i.complete && i.naturalWidth > 0).length,
      text: document.body.innerText.replace(/\s+/g, " ").slice(0, 220),
    };
  });
  await page.screenshot({ path: path.join(outDir, name + ".webp"), type: "webp", quality: 92 });
  await page.waitForTimeout(200);
  await page.close();
  return { errors, facts };
}

const report = {};

report.home = await shoot("home", async () => {});

report.results = await shoot("results", async (page) => {
  await page.fill("#crawlUrl", "https://demo.example.com/gallery");
  await page.press("#crawlUrl", "Enter");
  try {
    await page.waitForSelector(".results-page", { timeout: 20000 });
  } catch (error) {
    console.log("[results 失败]", JSON.stringify(errors.slice(0, 8), null, 2));
    const text = await page.evaluate(() => document.body.innerText.slice(0, 600));
    console.log("[页面文字]", text);
    throw error;
  }
  await page.waitForTimeout(1800);
  // 等缩略图加载完
  await page.evaluate(async () => {
    const imgs = Array.from(document.images).filter((i) => !i.complete);
    await Promise.all(imgs.map((i) => new Promise((r) => { i.onload = i.onerror = r; })));
  });
});

report.settings = await shoot("settings", async (page) => {
  await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll(".main-nav__item"));
    const hit = items.find((el) => (el.textContent || "").includes("设置"));
    if (hit) hit.click();
  });
  await page.waitForTimeout(900);
});

await browser.close();
server.close();

console.log(JSON.stringify({
  out: outDir,
  report,
  files: fs.readdirSync(outDir).map((f) => ({ f, kb: Math.round(fs.statSync(path.join(outDir, f)).size / 1024) })),
}, null, 2));
