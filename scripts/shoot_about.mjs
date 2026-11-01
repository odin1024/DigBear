// 用无头浏览器渲染「关于」页并截图，用于排版自查。
// 用法：node scripts/shoot_about.mjs [输出文件]
import { chromium } from "playwright-core";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const out = process.argv[2] || path.join(root, "_test-artifacts", "about.png");
const base = process.env.DIGBEAR_PREVIEW_URL || "http://localhost:4173";
const chrome = process.env.DIGBEAR_CHROME
  || path.join(process.env.LOCALAPPDATA || "", "ms-playwright", "chromium-1248", "chrome-win64", "chrome.exe");

const browser = await chromium.launch({ executablePath: chrome, headless: true });
const page = await browser.newPage({ viewport: { width: 1240, height: 724 }, deviceScaleFactor: 1 });
await page.goto(base, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

// 切到「关于」
const clicked = await page.evaluate(() => {
  const items = Array.from(document.querySelectorAll(".main-nav__item"));
  const hit = items.find((el) => (el.textContent || "").includes("关于"))
    || items.find((el) => (el.textContent || "").toLowerCase().includes("about"));
  if (hit) hit.click();
  return !!hit;
});
await page.waitForTimeout(1200);

const metrics = await page.evaluate(() => {
  const round = (n) => Math.round(n);
  const cards = Array.from(document.querySelectorAll(".about__card")).map((el) => {
    const r = el.getBoundingClientRect();
    return {
      sel: el.className.replace("about__card ", ""),
      top: round(r.top), bottom: round(r.bottom),
      left: round(r.left), right: round(r.right),
      w: round(r.width), h: round(r.height),
    };
  });
  const about = document.querySelector(".about");
  const grid = document.querySelector(".about__grid");
  const nav = document.querySelector(".main-nav");
  const gh = document.querySelector(".main-nav__github");
  return {
    cards,
    aboutScroll: about ? { h: about.scrollHeight, client: about.clientHeight, overflow: about.scrollHeight > about.clientHeight + 1 } : null,
    gridH: grid ? round(grid.getBoundingClientRect().height) : null,
    navHasGithub: !!gh,
    githubBox: gh ? (() => { const r = gh.getBoundingClientRect(); return { l: round(r.left), t: round(r.top), w: round(r.width), h: round(r.height) }; })() : null,
    docScroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
    viewport: [window.innerWidth, window.innerHeight],
  };
});

await page.screenshot({ path: out });
await browser.close();
console.log(JSON.stringify({ clicked, metrics, out }, null, 2));
