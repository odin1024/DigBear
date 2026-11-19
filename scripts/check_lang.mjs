import { chromium } from "playwright-core";
import path from "node:path";

const chrome = path.join(process.env.LOCALAPPDATA || "", "ms-playwright", "chromium-1248", "chrome-win64", "chrome.exe");
const browser = await chromium.launch({ executablePath: chrome, headless: true });

async function probe(url) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1500);
  const out = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    h1: (document.querySelector("h1")?.innerText || "").replace(/\n/g, " "),
    title: document.title,
    nav: Array.from(document.querySelectorAll(".nav__links a, .nav a")).slice(0, 4).map((a) => a.textContent.trim()),
  }));
  await page.close();
  return out;
}

console.log("默认  ", JSON.stringify(await probe("https://odin1024.github.io/DigBear/")));
console.log("?lang=en", JSON.stringify(await probe("https://odin1024.github.io/DigBear/?lang=en")));
console.log("?lang=zh", JSON.stringify(await probe("https://odin1024.github.io/DigBear/?lang=zh")));
await browser.close();