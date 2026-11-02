// 用微信 UA + 手机视口检查官网的移动端表现。
import { chromium } from "playwright-core";
import path from "node:path";

const chrome = path.join(process.env.LOCALAPPDATA || "", "ms-playwright", "chromium-1248", "chrome-win64", "chrome.exe");
const browser = await chromium.launch({ executablePath: chrome, headless: true });
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 MicroMessenger/8.0.49",
});

const issues = [];
page.on("response", (r) => {
  if (r.status() >= 400) issues.push(r.status() + " " + r.url().split("/").pop());
});

await page.goto("https://odin1024.github.io/DigBear/", { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(1500);

const info = await page.evaluate(() => {
  const de = document.documentElement;
  const overflowing = Array.from(document.querySelectorAll("body *"))
    .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 2)
    .slice(0, 6)
    .map((el) => String(el.className || el.tagName).slice(0, 34) + " right=" + Math.round(el.getBoundingClientRect().right));
  return {
    viewport: [window.innerWidth, window.innerHeight],
    docWidth: de.scrollWidth,
    horizontalScroll: de.scrollWidth > window.innerWidth + 1,
    overflowing,
    h1: (document.querySelector("h1")?.innerText || "").replace(/\n/g, " "),
    navWidth: Math.round(document.querySelector(".nav")?.getBoundingClientRect().width || 0),
  };
});

await page.screenshot({ path: path.join(process.cwd(), "_test-artifacts", "mobile.png") });
await browser.close();
console.log(JSON.stringify({ info, issues }, null, 2));
