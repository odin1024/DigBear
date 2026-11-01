// 渲染主界面（首页）并截图，用于 README 展示。
// 用法：在仓库根目录执行 node scripts/shoot_home.mjs
import { chromium } from "playwright-core";
import path from "node:path";

const root = process.cwd();
const chrome = path.join(process.env.LOCALAPPDATA || "", "ms-playwright", "chromium-1248", "chrome-win64", "chrome.exe");
const out = path.join(root, "_test-artifacts", "home.png");

const browser = await chromium.launch({ executablePath: chrome, headless: true });
const page = await browser.newPage({ viewport: { width: 1240, height: 760 }, deviceScaleFactor: 2 });
await page.goto("http://localhost:4173", { waitUntil: "networkidle" });
await page.waitForTimeout(1600);
await page.screenshot({ path: out });
await browser.close();
console.log("out=" + out);
