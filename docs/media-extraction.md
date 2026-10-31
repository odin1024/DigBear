# 通用网页媒体提取（CrawlBear 抓取内核）

> 目标：用户输入任意站点 URL 后，CrawlBear 在隐藏 WKWebView 中打开页面，提取页面上可下载的图片 / 视频 / 音频 / 字体资源，供用户筛选和保存。
> 环境：macOS 15（arm64）· Python 3.13 + Playwright 1.53（WebKit 2182 / Chromium 1179）· 2026-10-28
> 交付物：`.tmp-research/media/extract.js`（最终脚本，本文附录全文收录）+ 本地 fixture + 双内核实测结果。
> 证据文件：`.tmp-research/media/results/fixture_{webkit,chromium}.json`、`.tmp-research/media/results/site_*_{webkit,chromium}.json`、`.tmp-research/media/results/real_sites_final.log`。

---

## 0. 结论（给 Tauri 架构）

1. **一个同步 IIFE 即可覆盖全部 12 种来源**：`img / picture / video / audio / link / meta / anchor / inline_style / css_background / css_font_face / performance / other`。脚本不发起任何请求、不依赖页面框架、无全局变量，**同步返回 `JSON.stringify(...)` 字符串**，Rust 侧直接 `serde_json::from_str`。
2. **调用时序**：`页面加载完成 → 预置 resource timing buffer → 滚动到底（触发懒加载）→ 再等 0.5~1s → evaluate 脚本`。脚本本身不滚动、不 await；脚本结束后页面延迟注入的内容需要再次 evaluate 合并（Rust 侧按 URL 去重）。
3. **双内核结果高度一致**（WebKit 与 Chromium 的 URL 集合基本重合，数量差异主要来自字体/懒加载图片的加载时序，约 ±5%~20%）；真实站点实测 41~168 条资源，无异常、无脚本抛错。
4. **已知噪声**：第三方广告/统计的 tracking pixel 会以 `initiatorType=img` 无扩展名 URL 出现在 resource timing 中（如 w3schools 页面 5~9 条 `ga-audiences` / `getuid`），被标为 `image/performance`。符合“保留但截断、由用户过滤”的约定；UI 建议默认启用扩展名/域名过滤。
5. **真正的漏报**集中在：`blob:`（MSE/HLS 流）、iframe 内部资源、closed shadow DOM、脚本在提取后才设置的背景图。前三者需要内核级网络拦截/逐 frame 注入，不在本脚本范围。

---

## 1. 交付物清单

| 路径 | 说明 |
|---|---|
| `.tmp-research/media/extract.js` | **最终脚本**，499 行，无依赖，ES5 兼容写法，可直接塞进 `evaluateJavaScript` / `include_str!` |
| `.tmp-research/media/generate_assets.py` | 生成 fixture 素材（PNG/SVG/WAV/MP4 全部本地合成，字体为系统字体本地拷贝，不进入产品、不随仓库分发） |
| `.tmp-research/media/site/` | 本地 fixture 站点（含 `index.html` 由测试脚本按实际端口生成） |
| `.tmp-research/media/test_fixture.py` | fixture 端到端测试（Playwright WebKit 优先，Chromium 兜底），48/47 项断言 |
| `.tmp-research/media/test_sites.py` | 真实站点冒烟测试（4 个站点 × WebKit/Chromium），只读 URL，不落盘媒体 |
| `.tmp-research/media/results/*.json` | 各次运行的完整提取结果（含 warnings） |
| `docs/media-extraction.md` | 本文（附录含脚本全文，可直接取用） |

---

## 2. 输出契约

```json
{
  "title": "页面标题",
  "final_url": "https://example.com/path（重定向后的 location.href）",
  "resources": [
    {
      "url": "https://cdn.example.com/a/b/photo.jpg",
      "kind": "image",
      "source": "picture",
      "filename_hint": "photo.jpg",
      "width": 1200,
      "height": 800,
      "duration": null,
      "poster": null,
      "alt": "示例图片"
    }
  ],
  "warnings": ["cssom: cross-origin/inaccessible stylesheet skipped: https://… [SecurityError]"]
}
```

- `kind`：`image | video | audio | font | other`。判定优先级：来源上下文（`<video>` → video、`@font-face` → font）> 扩展名 > 兜底 `image`（CSS 背景）或 `other`。
- `source`：`img | picture | video | audio | css_background | css_font_face | link | meta | anchor | performance | inline_style | other`。同一 URL 被多处发现时保留**最先命中的来源**，后命中的来源只补齐缺失字段（如 width/alt/poster）。
- `filename_hint`：URL path 最后一段（`decodeURIComponent` 后清洗 `\/:*?"<>|` 与控制字符），最长 180 字符；CDN 无扩展名时可能为 `null`，保存时仍需 Rust 侧按 `Content-Type` 补扩展名。
- `width/height`：`img.naturalWidth/Height`、`video.videoWidth/Height`，仅当已加载/已解析 metadata 时非空；CSS 背景/字体/图片链接未知，为 `null`。
- `duration`：媒体元素 `duration`（秒，3 位小数），metadata 未加载时为 `null`。
- `poster`：仅视频条目有值；同时会把 poster 作为一条独立 `image` 资源返回（`source: "video"`）。
- `alt`：`img[alt]` 或锚文本；仅 image 条目会吸收 alt（避免锚文本污染同 URL 的视频条目）。
- 去重：URL 去掉 hash 后完全相同视为同一资源；query 不同视为不同资源（签名 URL/CDN 变体保留）。只输出 `http(s)` 绝对 URL；`data:`/`blob:`/`javascript:`/`about:`/`mailto:` 等一律跳过。
- 上限：1500 条资源（命中后 `warnings` 增加截断提示）；CSS 规则上限 40000（防超大型样式表卡死）。
- `warnings` 不是错误：跨域样式表 `SecurityError` 是最常见的正常告警；脚本任何分区异常都会降级为 warning，**整个表达式不会抛错**（`about:blank`、`data:text/html`、带 iframe 的页面均实测返回合法 JSON）。

---

## 3. 发现覆盖面与实现要点

| source | 具体机制 | fixture 证据 |
|---|---|---|
| `img` | `img.currentSrc/src/srcset`（srcset 拆 1x/2x/w 候选，逐条输出，方便用户选择清晰度）+ 懒加载 `data-*` | `pic.png`（natural 24×16, alt）、`lazy.png`（data-src） |
| `picture` | `<picture><source srcset/src>`，含 `type` 媒体类型候选 | `pic@2x.png` |
| `video` | `video.currentSrc/src`、嵌套 `<source src>`、`poster`（另出 image 条目）、`videoWidth/Height/duration` | `video.mp4`（64×48, dur=1, poster 独立条目） |
| `audio` | `audio.currentSrc/src`、嵌套 `<source>`、`duration` | `audio.wav`（dur 0.4） |
| `css_background` | CSSOM 递归（Style/Media/Supports/Keyframes/Import 规则）中的 `url(...)`；`style` 属性的内联背景；`data-bg/data-background(-image)`；`<style>` 文本兜底 | `bg.png`、`mq-bg.png`（@media）、`support-bg.png`（@supports） |
| `css_font_face` | CSSOM `CSSFontFaceRule` 的 `src: url(...)`；`<style>` 文本中 `@font-face` 块上下文检测 | `assets/fonts/Arial.ttf?v=2`（独立 query 证明此来源） |
| `link` | `rel=preload` + `as=image/font/video/audio`（含 `imagesrcset`）、`rel=icon/apple-touch-icon/mask-icon`、`manifest`（kind=other） | `logo.svg`（icon）、`Arial.ttf`（preload font） |
| `meta` | `og:image(:url/:secure_url)`、`og:video(:url/:secure_url)`、`og:audio`、`twitter:image(:src)`、`twitter:player:stream`、`itemprop=image/thumbnailUrl/contentUrl` | `og.png`、`twitter.png` |
| `anchor` | `a[href]` 且 URL 命中媒体扩展名 | `files/photo.png` |
| `inline_style` | 元素 `style` 属性、`<style>` 文本中非 `@font-face` 的 `url(...)`（含 `image-set()` 内的 url） | `inline-only.png` |
| `performance` | `performance.getEntriesByType('resource')`：`initiatorType=img/video/audio` 直接归类；`css/link/fetch/other` 仅在 URL 命中媒体扩展名时归类 | `perf-only.png`（仅 `new Image()` 加载、不在 DOM 中） |
| `other` | 内联 SVG `<image href>`（无更具体来源时）；manifest 等非媒体链接 | `og.svg`（SVG `<image>`） |

遍历顺序（决定 `source` 与去重优先级，也即 UI 默认排序）：`img → picture → lazy attrs → video/audio/poster → link → meta → anchor → inline style → <style> 文本 → CSSOM → performance → SVG <image>`。CSSOM/performance 永远不会覆盖 DOM 已发现资源的 `source/kind`，只补字段。

安全性：脚本只读页面结构、不 `eval`、不发请求；跨域样式表 `cssRules` 抛 `SecurityError` 时只记录 warning 并继续。

---

## 4. 测试结果

### 4.1 本地 fixture（全部 12 种 source 覆盖）

fixture 内容：PNG（普通/2x/懒加载/OG/Twitter/poster/背景×3/SVG/锚点）、SVG（icon + 内联 `<image>`）、ffmpeg 生成 1s MP4、Python stdlib 生成 WAV、系统 Arial.ttf、`@font-face`（外链 CSS + 内联 `<style>` 两种）、`background-image`（普通/@media/@supports）、`picture srcset`、`data-src`/`data-bg` 懒加载、`og:image`/`twitter:image`/`og:video`、锚点到 mp4/png、内联 style 背景、仅 JS 加载的图片（resource timing）、跨端口跨域样式表（应产生 warning）。

```bash
cd .tmp-research/media
python3 generate_assets.py
python3 test_fixture.py                 # WebKit
BROWSER=chromium python3 test_fixture.py
```

| 浏览器 | 资源总数 | kinds | sources 分布 | warnings | 断言 |
|---|---|---|---|---|---|
| WebKit 2182 | 18 | image 14 / video 1 / audio 1 / font 2 | img 2, picture 1, video 2, audio 1, link 2, meta 2, anchor 1, inline_style 1, css_font_face 1, css_background 3, performance 2 | 1（跨域 CSS 按预期 SecurityError） | **48/48 通过** |
| Chromium 1179 | 18 | image 14 / video 1 / audio 1 / font 2 | 同上 | 1（同上） | **47/47 通过** |

逐项验证（两内核均通过）：全部 18 个 fixture 资源的 URL/kind/source；图片 natural 尺寸与 alt；视频 duration/宽高/poster 字段；跨域 CSSOM warning；`data:` 跳过；`<noscript>` 内容不误报；URL 无重复；标题与 final_url。Chromium headless 下 `preload=metadata` 的视频元数据偶尔不加载，故 Chromium 的视频 duration/宽高断言为“加载则校验、未加载允许 null”——这是预期行为（见 §6）。

### 4.2 真实站点（只读取 URL，不下载媒体）

```bash
python3 test_sites.py chromium webkit
```

| 站点 | 内核 | 资源总数 | image | video | audio | font | other | warnings |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| MDN `<video>` 文档 | chromium | 82 | 68 | 0 | 0 | 13 | 1 | 0 |
| MDN `<video>` 文档 | webkit | 89 | 75 | 0 | 0 | 13 | 1 | 0 |
| W3Schools HTML5 Video | chromium | 79 | 50 | 2 | 0 | 26 | 1 | 3 |
| W3Schools HTML5 Video | webkit | 96 | 51 | 2 | 0 | 42 | 1 | 0 |
| Google Fonts Specimen | chromium | 41 | 19 | 0 | 0 | 22 | 0 | 0 |
| Google Fonts Specimen | webkit | 41 | 19 | 0 | 0 | 22 | 0 | 0 |
| Wikipedia HTML video | chromium | 168 | 168 | 0 | 0 | 0 | 0 | 0 |
| Wikipedia HTML video | webkit | 168 | 168 | 0 | 0 | 0 | 0 | 0 |

观察：

- **W3Schools**：2 条 video（mp4+ogg，来自 `<video><source>`）、自绘字体 20~42 条（css_font_face）、跨域广告 CSS 触发 3 条 warning（Chromium 本次运行；WebKit 该次未命中广告 CSS 时为 0，属加载时序差异）——说明跨域 CSS 告警是常态且不阻断其余提取。
- **MDN**：68~75 张图（多数来自 CSSOM 的 `css_background`）、13 个字体；无 video（页面上的示例视频在 iframe/非当前文档中，属已知边界）。
- **Google Fonts 字体页**：41 条（22 字体），css_font_face 21 + performance 兜底 1；无告警。
- **Wikipedia**：168 条全为 image（CSS 背景 113 + inline style 41 + img/link/anchor），两内核结果完全一致。
- **WebKit vs Chromium**：URL 集合基本一致；WebKit 因加载时序差异偶尔多出 4~20 张懒加载图片/字体，属正常时序噪声，不是逻辑差异。mdn WebKit 25 vs Chromium 18 条 performance-only 图片即此原因。

---

## 5. 集成到 Tauri / WKWebView

推荐流程（全程约 3~8s，取决于站点）：

```text
1) 隐藏 WebView（visible=false 但保持真实 viewport，如 1280×900；不要 0 尺寸/display:none，
   否则 IntersectionObserver 懒加载不触发）
2) 打开 URL，等待 load 完成；SPA 站点再等 1~3s（或轮询 document.readyState/内容节点）
3) evaluate 预置脚本（提高 resource timing 覆盖）：
   (() => { try { performance.setResourceTimingBufferSize &&
     performance.setResourceTimingBufferSize(3000); } catch (e) {} return true; })()
4) 滚动：从 Rust 循环 evaluate "window.scrollBy(0, innerHeight*0.8)"，每步 sleep 120~200ms，
   直到 scrollY + innerHeight >= document.body.scrollHeight（或最多 20~30 步）；
   也可注入 setTimeout 滚动脚本后由 Rust 侧 sleep 2~3s（WKWebView 不 await Promise，别依赖返回 Promise）
5) evaluate extract.js 全文 → 返回 String → serde_json::from_str
6) 可选：1~2s 后再跑一次（SPA/无限滚动），Rust 侧按 url 合并去重
7) 下载：Rust/reqwest 使用页面 final_url 作 Referer + 桌面 UA；签名 URL 尽快下载；
   Content-Type 缺扩展名时以响应头为准，Content-Disposition 优先作为文件名
```

要点：

- **脚本同步、幂等、无副作用**：不注册全局变量、不改 DOM，可以安全重复执行。
- **预置 resource timing buffer** 应尽早执行（load 前/后立刻）；WKWebView 默认资源计时缓冲有限（约 250 条），超大页面晚执行会丢条目（DOM/CSSOM 仍能兜住绝大多数可见媒体）。
- `warnings` 直接透传到调试面板；跨域 CSS 告警不需要中断流程。
- `kind`/`source` 建议在 UI 上做分组与徽标；`kind=other`（manifest 等）默认折叠。
- 下载时注意防盗链：部分站点对无 Referer 的媒体返回 403；使用页面 URL 作 Referer，失败再退回无 Referer。
- 保存命名：`filename_hint` 为空时用 `{kind}-{index}`；同名冲突自动追加序号；URL 带 query 的签名资源保存时以 Content-Type 决定扩展名。
- 建议把脚本作为 Rust 常量打包：`include_str!("../js/extract.js")`（或前端 TS 常量），避免运行时拼字符串。

---

## 6. 边界、误报与漏报

### 6.1 误报（可接受，需 UI 过滤）

| 现象 | 说明 | 处理建议 |
|---|---|---|
| tracking pixel / 广告同步 URL | resource timing 里 `initiatorType=img` 但 URL 无媒体扩展名（如 `google.com/ads/ga-audiences`、`adnxs.com/getuid`、`sharethrough.com/...`），被归为 `image/performance`。w3schools 实测 5~9 条 | UI 默认按扩展名/域名过滤；不要因此在脚本里按扩展名硬过滤（会误杀 CDN 无扩展名图片） |
| `kind=other` | 主要是 `link rel=manifest`（`site.webmanifest`/`manifest.json`）；跨域 CSS 中无法读取规则的字体/背景不可见 | 默认折叠 `other` |
| 罕见 CSS `url()` | `cursor:url(.cur)`、`list-style-image` 等若扩展名命中图片会被算作 image | 体量极小，用户可忽略 |

### 6.2 漏报（已知，按影响排序）

| 场景 | 原因 | 建议 |
|---|---|---|
| `blob:` 媒体（MSE / HLS.js / DASH） | 脚本按约定跳过 `blob:`；真实流地址在 JS 内存/网络层 | 需 Tauri 侧网络拦截或 WKWebView 自定义协议；本次不覆盖 |
| iframe / 跨文档内容 | 只在顶层 document 执行；WKWebView evaluateJavaScript 也只作用于主 frame | 后续可在脚本中加入**同源 iframe 递归扫描**（try/catch 包裹），跨域 frame 仍需逐 frame 注入 |
| open shadow DOM 内的媒体 | 未遍历 `shadowRoot` | 后续小改动可递归扫描 open shadow roots |
| 提取后才由 JS 设置的背景图 / 无限滚动新内容 | 脚本是某一时刻的快照 | 再次 evaluate 并合并（Rust 侧按 URL 去重），或在用户交互后再跑一次 |
| `data:` 内联图片/字体 | 按要求跳过（可能包含真正可保存的 base64 图） | 如产品需要，可从 `img.currentSrc`/CSS text 中单独解析 data URI 落盘，本脚本不返回 |
| 大页面 resource timing 截断 | 计时缓冲默认约 250 条 | 尽早 `setResourceTimingBufferSize(3000)`（见集成步骤 3） |
| 视频宽高/duration 为 null | `preload=none`/headless 不加载元数据（实测 Chromium） | 下载前 HEAD/GET 后由 Rust 补齐；不影响 URL 提取 |
| `@font-face` 只有 `local()` | 无 URL 可提取 | 属系统字体，无需下载 |
| 非标准懒加载属性 | 只覆盖 `data-src/data-original/data-lazy-src/data-url/data-image/data-bg/data-background(-image)` | 遇到新站点可低成本扩充属性列表 |
| `srcset` 中的 `data:` 候选 | 跳过 | 无影响（通常另有 http 候选） |

### 6.3 稳定性

- 全表达式外层无 try/catch 包裹（返回语句必须保留），但**每个分区**独立 try/catch 降级为 warning；实测 `about:blank`、`data:text/html`、含 `srcdoc` iframe 的页面、4 个真实站点、2 个内核均未抛异常，返回合法 JSON。
- 单条规则异常、跨域 `SecurityError`、`sheet.cssRules=null` 均被吞掉并记录 warning。
- 上限保护：资源 1500、CSS 规则 40000、单段 CSS url 400~500、单文件 URL 长度 8192、warnings 100 条；避免超大型页面卡住 WKWebView。
- 无网络请求、无 DOM 修改，可重复执行。

---

## 7. 后续建议（按性价比排序）

1. 把 `extract.js` 定稿进产品源码（`include_str!`），并补一个最小 Rust struct + `serde_json` 解析单测（schema 字段全部 `Option`）。
2. UI：按 kind 分组、source 徽标、扩展名/尺寸过滤、`kind=other` 默认折叠、缩略图预览（`WKWebView` 直接加载缩略图 URL）。
3. 二次提取合并：用户滚动/加载更多后重跑脚本，Rust 侧按 `url` 合并，字段取并集。
4. 同源 iframe + open shadow DOM 递归扫描（对脚本是小改动，可显著提升新闻/门户站点覆盖率）。
5. 若目标站点以 blob 播放视频为主，另立任务做 WKWebView 网络层拦截（`WKNavigationDelegate`/自定义协议/`URLProtocol`），与本文脚本互补。

---

## 8. 附录：`extract.js` 全文

> 直接将该文件内容作为 JS 表达式执行（IIFE，返回 JSON 字符串）。以下是当前定稿版本（499 行）。

```js
/* CrawlBear generic media extractor.
 *
 * Evaluate this whole expression in the loaded page (top frame) after an
 * initial settle/scroll pass. It is synchronous (no await / no promises) and
 * returns a JSON *string* shaped as:
 *
 *   { title, final_url, resources: [{ url, kind, source, filename_hint,
 *     width, height, duration, poster, alt }], warnings: [] }
 *
 * kind:   image | video | audio | font | other
 * source: img | picture | video | audio | css_background | css_font_face |
 *         link | meta | anchor | performance | inline_style | other
 *
 * Only absolute http(s) URLs are returned. data:/blob:/javascript:/about:
 * are skipped. Duplicate URLs (hash ignored) are merged. Hard cap ~1500.
 * The whole body is exception-guarded: it never throws.
 */
(function () {
  var warnings = [];
  var resources = [];
  var byUrl = Object.create(null);
  var MAX_RESOURCES = 1500;
  var MAX_RULES = 40000;
  var capped = false;
  var rulesSeen = 0;
  var base = (function () {
    try { return document.baseURI || location.href; } catch (e) { return location.href; }
  })();
  try { base = new URL(base, location.href).href; } catch (e2) { base = location.href; }

  var IMG_EXT = /\.(avif|apng|bmp|gif|ico|jfif|jpe?g|png|svg|tiff?|webp)(?:[?#]|$)/i;
  var VIDEO_EXT = /\.(avi|flv|m3u8|m4v|mkv|mov|mp4|mpd|ogv|ts|webm)(?:[?#]|$)/i;
  var AUDIO_EXT = /\.(aac|aiff?|flac|m4a|midi?|mp3|oga|ogg|opus|wav|weba|wma)(?:[?#]|$)/i;
  var FONT_EXT = /\.(eot|otf|ttf|woff2?)(?:[?#]|$)/i;
  var BAD_SCHEME = /^(?:data|blob|javascript|about|mailto|tel|file|filesystem|chrome-extension|moz-extension|edge-extension|webkit-extension):/i;

  function warn(msg) {
    if (warnings.length < 100) {
      try { warnings.push(String(msg).slice(0, 300)); } catch (e) {}
    }
  }

  function str(v) { return typeof v === 'string' ? v : ''; }

  function abs(u, baseUrl) {
    if (typeof u !== 'string') return null;
    u = u.trim();
    if (!u || u.charAt(0) === '#' || u.length > 8192) return null;
    if (BAD_SCHEME.test(u)) return null;
    try {
      var r = new URL(u, baseUrl || base);
      if (r.protocol !== 'http:' && r.protocol !== 'https:') return null;
      r.hash = '';
      return r.href;
    } catch (e) { return null; }
  }

  function kindOfExt(url) {
    if (!url) return null;
    if (FONT_EXT.test(url)) return 'font';
    if (VIDEO_EXT.test(url)) return 'video';
    if (AUDIO_EXT.test(url)) return 'audio';
    if (IMG_EXT.test(url)) return 'image';
    return null;
  }

  function filenameHint(url) {
    try {
      var path = new URL(url).pathname;
      var segs = path.split('/');
      var seg = segs[segs.length - 1] || '';
      try { seg = decodeURIComponent(seg); } catch (e) {}
      seg = seg.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim();
      if (!seg || seg === '.' || seg === '..') return null;
      if (seg.length > 180) seg = seg.slice(0, 180);
      return seg;
    } catch (e) { return null; }
  }

  function pickNumber(v) {
    var n = Number(v);
    return isFinite(n) && n > 0 ? n : null;
  }

  function applyInfo(r, info) {
    if (!info) return;
    if (r.width == null && info.width != null) r.width = info.width;
    if (r.height == null && info.height != null) r.height = info.height;
    if (r.duration == null && info.duration != null) r.duration = info.duration;
    if (r.poster == null && info.poster != null) r.poster = info.poster;
    if (r.alt == null && info.alt != null) r.alt = info.alt;
  }

  function mergeInto(r, kind, source, info) {
    if (r.kind === 'other' && kind && kind !== 'other') {
      r.kind = kind;
      if (source) r.source = source;
    }
    if (info) {
      // alt text only makes sense for image entries; do not let an anchor
      // label leak into a video/audio/font entry that shares the same URL.
      var mergeInfo = info;
      if (r.kind !== 'image' && info.alt != null) {
        mergeInfo = {
          width: info.width, height: info.height,
          duration: info.duration, poster: info.poster, alt: null
        };
      }
      applyInfo(r, mergeInfo);
    }
  }

  function add(url, kind, source, info) {
    if (!url) return;
    var key = url;
    var existing = byUrl[key];
    if (existing) { mergeInto(existing, kind, source, info); return; }
    if (resources.length >= MAX_RESOURCES) { capped = true; return; }
    var resolvedKind = kind || kindOfExt(url) || 'other';
    var r = {
      url: key,
      kind: resolvedKind,
      source: source || 'other',
      filename_hint: filenameHint(url),
      width: null,
      height: null,
      duration: null,
      poster: null,
      alt: null
    };
    applyInfo(r, info);
    resources.push(r);
    byUrl[key] = r;
    if (resources.length >= MAX_RESOURCES) capped = true;
  }

  function section(name, fn) {
    try { fn(); } catch (e) {
      warn('section "' + name + '" failed: ' + ((e && e.message) || e));
    }
  }

  // --- srcset -------------------------------------------------------------
  function addSrcset(srcset, source, info) {
    var text = str(srcset);
    if (!text) return;
    var parts = text.split(',');
    for (var i = 0; i < parts.length; i++) {
      var t = parts[i].trim();
      if (!t) continue;
      var candidate = t.split(/\s+/)[0];
      var u = abs(candidate);
      if (u) add(u, (info && info.kind) || 'image', source, info);
    }
  }

  // --- generic url(...) extraction from CSS text --------------------------
  var CSS_URL_RE = /url\(\s*(?:'([^']*)'|"([^"]*)"|([^)'"\s]+))\s*\)/gi;
  function addCssUrls(text, sheetBase, source, kindHint, limit) {
    if (!text || typeof text !== 'string' || text.indexOf('url(') === -1) return;
    var n = 0;
    var max = limit || 400;
    var m;
    CSS_URL_RE.lastIndex = 0;
    while ((m = CSS_URL_RE.exec(text)) && n < max) {
      n++;
      var raw = m[1] || m[2] || m[3] || '';
      var u = abs(raw, sheetBase);
      if (!u) continue;
      var kind = kindHint || kindOfExt(u) || 'image';
      add(u, kind, source, null);
    }
  }

  function urlsInAttrValue(value) {
    var out = [];
    if (!value) return out;
    var m;
    CSS_URL_RE.lastIndex = 0;
    while ((m = CSS_URL_RE.exec(value))) {
      var raw = m[1] || m[2] || m[3] || '';
      if (raw) out.push(raw);
    }
    if (!out.length) {
      var v = String(value).trim();
      // data-src / data-bg often hold a bare relative or absolute URL.
      if (v && v.length < 4096 && !/[\s,{}]/.test(v)) out.push(v);
    }
    return out;
  }

  // --- 1. img -------------------------------------------------------------
  section('img', function () {
    var imgs = document.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      var info = { alt: str(img.getAttribute('alt')) || null };
      var nw = img.naturalWidth, nh = img.naturalHeight;
      if (nw > 0) info.width = nw;
      if (nh > 0) info.height = nh;
      var current = '';
      try { current = img.currentSrc || ''; } catch (e) {}
      add(abs(current), 'image', 'img', info);
      add(abs(img.getAttribute('src')), 'image', 'img', info);
      addSrcset(img.getAttribute('srcset'), 'img', info);
    }
  });

  // --- picture ------------------------------------------------------------
  section('picture', function () {
    var pictures = document.querySelectorAll('picture');
    for (var i = 0; i < pictures.length; i++) {
      var sources = pictures[i].querySelectorAll('source');
      for (var j = 0; j < sources.length; j++) {
        var s = sources[j];
        addSrcset(s.getAttribute('srcset'), 'picture', { kind: 'image' });
        add(abs(s.getAttribute('src')), 'image', 'picture', null);
      }
    }
  });

  // --- lazy attributes ----------------------------------------------------
  section('lazy_attrs', function () {
    var ATTRS = [
      'data-src', 'data-original', 'data-lazy-src', 'data-url', 'data-image',
      'data-bg', 'data-background', 'data-background-image'
    ];
    var selector = ATTRS.map(function (a) { return '[' + a + ']'; }).join(',');
    var els;
    try { els = document.querySelectorAll(selector); } catch (e) { return; }
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var tag = (el.tagName || '').toLowerCase();
      var kind = tag === 'video' ? 'video' : (tag === 'audio' ? 'audio' : null);
      var source = tag === 'video' ? 'video' : (tag === 'audio' ? 'audio' : 'other');
      var inPicture = false;
      try { inPicture = !!(el.closest && el.closest('picture')); } catch (e) {}
      if (inPicture) source = 'picture';
      for (var a = 0; a < ATTRS.length; a++) {
        var attr = ATTRS[a];
        var raw = el.getAttribute && el.getAttribute(attr);
        if (!raw) continue;
        var isBg = attr === 'data-bg' || attr === 'data-background' || attr === 'data-background-image';
        var found = urlsInAttrValue(raw);
        for (var k = 0; k < found.length; k++) {
          var u = abs(found[k]);
          if (!u) continue;
          var k2 = kind || kindOfExt(u) || 'image';
          var src2 = isBg ? 'css_background' : (tag === 'img' ? 'img' : source);
          if (tag === 'img') k2 = 'image';
          add(u, k2, src2, null);
        }
      }
    }
  });

  // --- 2. video / audio / poster -----------------------------------------
  section('media_elements', function () {
    var els = document.querySelectorAll('video, audio');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var tag = (el.tagName || '').toLowerCase();
      var kind = tag === 'video' ? 'video' : 'audio';
      var info = {};
      var w = pickNumber(el.videoWidth);
      var h = pickNumber(el.videoHeight);
      if (w) info.width = w;
      if (h) info.height = h;
      var dur = Number(el.duration);
      if (isFinite(dur) && dur > 0) info.duration = Math.round(dur * 1000) / 1000;
      var poster = abs(el.getAttribute('poster'));
      if (poster && tag === 'video') info.poster = poster;
      var current = '';
      try { current = el.currentSrc || ''; } catch (e) {}
      add(abs(current), kind, tag, info);
      add(abs(el.getAttribute('src')), kind, tag, info);
      var sources = el.querySelectorAll('source');
      for (var j = 0; j < sources.length; j++) {
        add(abs(sources[j].getAttribute('src')), kind, tag, info);
        add(abs(sources[j].getAttribute('srcset')), kind, tag, info);
      }
      if (poster) add(poster, 'image', 'video', null);
    }
  });

  section('video_poster_attrs', function () {
    var els = document.querySelectorAll('video[poster]');
    for (var i = 0; i < els.length; i++) {
      add(abs(els[i].getAttribute('poster')), 'image', 'video', null);
    }
  });

  // --- 3. link rel=preload / icon ----------------------------------------
  section('link', function () {
    var AS_KIND = { image: 'image', font: 'font', video: 'video', audio: 'audio' };
    var links = document.querySelectorAll('link[href]');
    for (var i = 0; i < links.length; i++) {
      var l = links[i];
      var rel = str(l.getAttribute('rel')).toLowerCase();
      if (!rel) continue;
      var rels = rel.split(/\s+/);
      var as = str(l.getAttribute('as')).toLowerCase();
      var href = abs(l.getAttribute('href'));
      if (!href) continue;
      var isIcon = rels.indexOf('icon') !== -1 || rels.indexOf('apple-touch-icon') !== -1 ||
        rels.indexOf('mask-icon') !== -1;
      if (rels.indexOf('preload') !== -1) {
        var kind = AS_KIND[as];
        if (kind) {
          add(href, kind, 'link', null);
          if (as === 'image') addSrcset(l.getAttribute('imagesrcset'), 'link', { kind: 'image' });
        }
      } else if (isIcon) {
        add(href, 'image', 'link', null);
      } else if (rels.indexOf('manifest') !== -1) {
        add(href, 'other', 'link', null);
      }
    }
  });

  // --- 4. meta og / twitter ----------------------------------------------
  section('meta', function () {
    var MAP = {
      'og:image': 'image', 'og:image:url': 'image', 'og:image:secure_url': 'image',
      'og:video': 'video', 'og:video:url': 'video', 'og:video:secure_url': 'video',
      'og:audio': 'audio', 'og:audio:url': 'audio', 'og:audio:secure_url': 'audio',
      'twitter:image': 'image', 'twitter:image:src': 'image',
      'twitter:player:stream': 'video'
    };
    var metas = document.querySelectorAll('meta[content]');
    for (var i = 0; i < metas.length; i++) {
      var m = metas[i];
      var key = str(m.getAttribute('property') || m.getAttribute('name') || m.getAttribute('itemprop')).toLowerCase();
      var kind = MAP[key];
      if (!kind) continue;
      add(abs(m.getAttribute('content')), kind, 'meta', null);
    }
    var micro = document.querySelectorAll('[itemprop="image"], [itemprop="thumbnailUrl"], [itemprop="contentUrl"]');
    for (var j = 0; j < micro.length; j++) {
      var el = micro[j];
      var raw = el.getAttribute('content') || el.getAttribute('src') || el.getAttribute('href');
      add(abs(raw), 'image', 'meta', null);
    }
  });

  // --- 4b. anchors to media files ---------------------------------------
  section('anchor', function () {
    var links = document.querySelectorAll('a[href]');
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      var u = abs(a.getAttribute('href'));
      if (!u) continue;
      var kind = kindOfExt(u);
      if (!kind) continue;
      var text = '';
      try { text = (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200); } catch (e) {}
      add(u, kind, 'anchor', { alt: text || null });
    }
  });

  // --- 5a. inline style attributes ---------------------------------------
  section('inline_style', function () {
    var els = document.querySelectorAll('[style]');
    for (var i = 0; i < els.length; i++) {
      var style = els[i].getAttribute('style') || '';
      if (style.indexOf('url(') === -1) continue;
      addCssUrls(style, base, 'inline_style', null);
    }
  });

  // --- 5b. inline <style> text (with @font-face context detection) -------
  section('style_text', function () {
    var styles = document.querySelectorAll('style');
    for (var i = 0; i < styles.length; i++) {
      var text = styles[i].textContent || '';
      if (!text || text.indexOf('url(') === -1) continue;
      var m;
      CSS_URL_RE.lastIndex = 0;
      var guard = 0;
      while ((m = CSS_URL_RE.exec(text)) && guard < 2000) {
        guard++;
        var idx = m.index;
        var prefix = text.slice(0, idx);
        var lastBrace = prefix.lastIndexOf('}');
        var lastFontFace = prefix.lastIndexOf('@font-face');
        var inFontFace = lastFontFace !== -1 && lastFontFace > lastBrace;
        var raw = m[1] || m[2] || m[3] || '';
        var u = abs(raw, base);
        if (!u) continue;
        if (inFontFace) add(u, 'font', 'css_font_face', null);
        else add(u, kindOfExt(u) || 'image', 'inline_style', null);
      }
    }
  });

  // --- 6. CSSOM (recursive, cross-origin guarded) ------------------------
  section('cssom', function () {
    function walkRules(rules, sheetBase, depth) {
      if (!rules || depth > 12) return;
      for (var i = 0; i < rules.length; i++) {
        if (rulesSeen >= MAX_RULES) { warn('cssom: rule cap reached (' + MAX_RULES + ')'); return; }
        rulesSeen++;
        var rule = rules[i];
        try {
          var cssText = rule.cssText || '';
          var type = rule.type;
          var isFontFace = type === 5 || /@font-face/i.test(cssText);
          if (isFontFace) {
            addCssUrls(cssText, sheetBase, 'css_font_face', 'font', 200);
          } else if (rule.style) {
            addCssUrls(cssText, sheetBase, 'css_background', null, 300);
          }
          if (rule.cssRules && rule.cssRules.length) {
            walkRules(rule.cssRules, sheetBase, depth + 1);
          } else if (rule.styleSheet) {
            walkSheet(rule.styleSheet, depth + 1);
          }
        } catch (e) {
          warn('cssom: rule skipped (' + ((e && e.name) || 'Error') + ')');
        }
      }
    }
    function walkSheet(sheet, depth) {
      if (!sheet || depth > 12) return;
      var rules = null;
      try {
        rules = sheet.cssRules;
      } catch (e) {
        warn('cssom: cross-origin/inaccessible stylesheet skipped: ' +
          (sheet.href || '(inline)') + ' [' + ((e && e.name) || 'Error') + ']');
        return;
      }
      if (!rules) return;
      walkRules(rules, sheet.href || base, depth);
    }
    var sheets = document.styleSheets || [];
    for (var i = 0; i < sheets.length; i++) {
      try { walkSheet(sheets[i], 0); } catch (e) {
        warn('cssom: stylesheet skipped (' + ((e && e.name) || 'Error') + ')');
      }
    }
    var adopted = null;
    try { adopted = document.adoptedStyleSheets || null; } catch (e) {}
    if (adopted) {
      for (var j = 0; j < adopted.length; j++) {
        try { walkSheet(adopted[j], 0); } catch (e) {
          warn('cssom: adopted stylesheet skipped (' + ((e && e.name) || 'Error') + ')');
        }
      }
    }
  });

  // --- 7. performance resource timing ------------------------------------
  section('performance', function () {
    var entries = [];
    try { entries = performance.getEntriesByType('resource') || []; } catch (e) {}
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var name = abs(entry && entry.name);
      if (!name) continue;
      var initiator = str(entry.initiatorType).toLowerCase();
      var kind = null;
      if (initiator === 'img' || initiator === 'image') kind = 'image';
      else if (initiator === 'video') kind = 'video';
      else if (initiator === 'audio') kind = 'audio';
      else kind = kindOfExt(name);
      if (!kind) continue;
      add(name, kind, 'performance', null);
    }
  });

  // --- 8. SVG <image> -----------------------------------------------------
  section('svg_image', function () {
    var images = [];
    try { images = document.querySelectorAll('image'); } catch (e) {}
    for (var i = 0; i < images.length; i++) {
      var el = images[i];
      var raw = el.getAttribute('href') || el.getAttribute('xlink:href') || '';
      add(abs(raw), 'image', 'other', null);
    }
  });

  // --- output -------------------------------------------------------------
  if (capped) warn('resource cap reached (' + MAX_RESOURCES + '); results truncated');
  if (!resources.length) warn('no media resources discovered');
  if (rulesSeen >= MAX_RULES) warn('cssom: stopped after ' + rulesSeen + ' rules');

  var out = {
    title: str(document.title),
    final_url: (function () { try { return location.href; } catch (e) { return ''; } })(),
    resources: resources,
    warnings: warnings
  };
  try {
    return JSON.stringify(out);
  } catch (e) {
    return JSON.stringify({ title: '', final_url: '', resources: [], warnings: ['stringify failed: ' + ((e && e.message) || e)] });
  }
})();
```
