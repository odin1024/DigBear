<p align="center">
  <img src="./docs/assets/banner.png" alt="DigBear — paste a URL and pull every image, video, audio file and font out of the page" width="100%" />
</p>

<p align="center">
  <img alt="Windows 10+" src="https://img.shields.io/badge/Windows-10%2B-0078D4?style=flat-square&labelColor=FFF7E8" />
  <img alt="Version" src="https://img.shields.io/badge/v0.4.0-33261D?style=flat-square&labelColor=FFF7E8" />
  <img alt="MIT License" src="https://img.shields.io/badge/License-MIT-5E9C68?style=flat-square&labelColor=FFF7E8" />
  <img alt="Runs locally" src="https://img.shields.io/badge/LOCAL-ONLY-NO-UPLOAD-F0A830?style=flat-square&labelColor=FFF7E8" />
</p>

<p align="center">
  <a href="https://odin1024.github.io/DigBear/?lang=en"><b>🌐 Website</b></a> ·
  <a href="https://github.com/odin1024/DigBear/releases/latest"><b>⬇️ Download</b></a> ·
  <a href="https://github.com/odin1024/DigBear/issues"><b>💬 Feedback</b></a>
</p>

<p align="center">
  <a href="./README.md">简体中文</a> · <b>English</b>
</p>

## What it is

**DigBear (掘掘熊) is a small Windows tool: paste a URL and it finds every image, video, audio file and font on that page — you pick what you want and save the lot to a local folder.**

No technical know-how, no plugins, no account. Install it, double-click, paste a link.

<p align="center">
  <img src="./docs/assets/home.webp" alt="DigBear main window" width="100%" />
</p>

## Why it's worth using

- **One URL, four kinds of media** — images, videos, music and fonts are scanned together, so you never juggle separate tools.
- **Quality first** — when the same image exists in several sizes, the largest one wins; videos are pulled at the highest available quality.
- **Pick first, save later** — results arrive as a list you can filter by type, preview and sort, then download in one go.
- **Works on sites behind a login** — sign in once in the built-in window; the session never leaves your machine.
- **No waiting around** — interrupted downloads resume, failures retry, and files you already saved are skipped next time.
- **Your data stays put** — pages are only read. Nothing is uploaded, there is no account, and no telemetry.

## Download and install

Grab it from the **[Releases](https://github.com/odin1024/DigBear/releases/latest)** page:

| File | Who it's for |
| --- | --- |
| `DigBear_0.4.0_x64-setup.exe` | **Recommended** — double-click installer for everyday use |
| `DigBear_0.4.0_x64_en-US.msi` | Enterprise / lab deployments that install in bulk |
| `DigBear_0.4.0_x64_zh-CN.msi` | Same, Chinese installer |
| `DigBear_extension_v0.4.0.zip` | Optional — browser extension that hands the current page to DigBear |

**Three steps and you're set:**

1. Download `setup.exe` and run it
2. If Windows says "Windows protected your PC", click **More info → Run anyway** (the app isn't code-signed — that dialog is expected)
3. Open DigBear, paste a URL, hit **Start crawling** → pick your assets → download

> Requirements: Windows 10 (1809 or newer) or Windows 11, 64-bit.
> Windows 11 ships with everything needed; on Windows 10, click through the prompt if it asks for WebView2.
> Use the bundled `SHA256SUMS` file to verify the download.

## How it works day to day

1. **Paste a URL** — straight from your clipboard, or queue several URLs at once.
2. **Let it work** — the page opens silently in the background while the UI shows progress.
3. **Pick** — browse by image / video / music / font, filter to large files only, or take everything in one click.
4. **Save** — choose a destination folder and download in bulk; custom filename patterns and per-type subfolders are supported.

Settings also cover dark themes, automatic retries, a disk-space check before downloading, history and favourites.

## Known rough edges

- Invisible **tracking pixels** (tiny images without a file extension) show up as images too — filter them out.
- **Streams that are decoded on the fly** (`blob:` and friends) can't be captured yet; that's on the roadmap.
- Background images set **by script after the page loads** may be missed.
- Pages with a huge number of resources (1000+) take a while to scan.

## Feedback

Found a bug, have an idea, or want to request a feature?

<p align="center">
  <img src="./apps/website/public/assets/author-qr.png" alt="DigBear WeChat official account QR code" width="200" />
</p>

- **WeChat**: scan the code, follow the official account and leave a message — replies come faster there
- **GitHub Issues**: bugs and feature requests are welcome, [open one here](https://github.com/odin1024/DigBear/issues)
- The same QR code lives in the app's **About** page

> Including the target URL and the steps to reproduce saves a lot of back-and-forth.

## License and credits

DigBear is released under the **MIT license** — free to use, modify and redistribute.
Credit goes to the upstream open-source project [Crawl Bear](https://github.com/xw-meow/crawl-bear) and its author [xw-meow](https://github.com/xw-meow).
Full details in [LICENSE](./LICENSE) and [NOTICE.md](./NOTICE.md).

---

<details>
<summary><b>For developers: building from source</b></summary>

Needs Windows, Node.js 20+, pnpm 12, stable Rust and the Microsoft C++ Build Tools.

```powershell
pnpm install
pnpm test:rust          # unit tests
powershell -File scripts/build_windows.ps1   # produces the NSIS + MSI installers
```

Docs: [Changelog](./CHANGELOG.md) · [Contributing guide](./docs/CONTRIBUTING.md) · [Release process](./docs/RELEASES.md) · [Roadmap](./docs/ROADMAP.md) · [Porting notes](./PORTING.md)

</details>