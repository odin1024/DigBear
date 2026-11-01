import { chromium } from "playwright-core";
import path from "node:path";

const chrome = path.join(process.env.LOCALAPPDATA || "", "ms-playwright", "chromium-1248", "chrome-win64", "chrome.exe");
const out = path.join(process.cwd(), "_test-artifacts", "pages.png");

const browser = await chromium.launch({ executablePath: chrome, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });

const failures = [];
page.on("response", (res) => {
  if (res.status() >= 400) failures.push(res.status() + " " + res.url());
});
page.on("console", (msg) => { if (msg.type() === "error") failures.push("console: " + msg.text().slice(0, 120)); });

await page.goto("https://odin1024.github.io/DigBear/", { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: out, fullPage: false });

const info = await page.evaluate(() => ({
  title: document.title,
  h1: (document.querySelector("h1")?.innerText || "").replace(/\n/g, " "),
  imgs: Array.from(document.images).map(i => ({ src: i.currentSrc.split("/").slice(-1)[0], ok: i.complete && i.naturalWidth > 0 })),
  links: Array.from(document.querySelectorAll("a")).map(a => a.href).slice(0, 8),
}));
await browser.close();
console.log(JSON.stringify({ info, failures }, null, 2));
