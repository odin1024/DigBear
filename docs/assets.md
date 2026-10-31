# CrawlBear 图像资产清单 · 生图提示词

> 配套文档：[design.md](./design.md) §3 / §6.6 / §9
> 生成工具：gpt-image（推荐 `gpt-image-1`，1024×1024）
> 原图目录：`design-assets/`（生图原稿，不进应用包）
> 网页资产：`apps/desktop/public/assets/*.webp`（由 `python3 scripts/prepare_assets.py` 生成）
> 命名规则：`bear-<mood>.png` → 自动输出 `bear-<mood>.webp`；缺图时界面自动回退到内置 SVG 小熊。

---

## 0. 全局风格（所有插画共用）

把下面这段「风格前缀」拼在每条提示词前面，保证 6 张图是同一个角色、同一套画风：

```
Hand-drawn comic illustration for a cozy macOS app mascot. A chubby, honest-looking
brown bear with round ears, a cream muzzle, small oval eyes, thick warm-ink outlines
(2.5px equivalent), flat warm colors, soft paper texture, no gradients, no shadows,
no text, no watermark. Style: children's picture-book comic, slightly wobbly hand-drawn
linework, friendly and a bit clumsy. Background: flat solid cream #FFF7E8, isolated
character with generous margin.
```

统一角色设定（写进每条提示词）：

```
Character: "Papa" the crawler bear — chubby body, honey-brown fur (#B97B43), cream
muzzle and belly (#F0D3A7), wears a small canvas satchel with a leaf-shaped buckle,
round black-ink eyes, tiny eyebrows, no clothes other than the satchel.
```

统一禁区（negative prompt）：

```
negative: photorealistic, 3D render, glossy, neon colors, dark background, gradients,
drop shadow, text, letters, watermark, logo, human hands, extra limbs, scary, realistic
fur texture, busy background, cropped character
```

---

## 1. `bear-hero.png` — 首屏主形象

- **用途**：爬取页 Hero 右侧主插画，站立、打开采集袋欢迎用户。
- **尺寸**：1024×1024（展示约 300×300）
- **提示词**：

```
[风格前缀 + 角色设定]
Papa stands upright on two legs, facing the viewer with a warm open-mouth smile,
holding open his canvas satchel with one paw, the other paw raised in a friendly wave.
Inside the satchel: a few tiny floating icons of a photo, a play button and a music note
(flat, simple, no text). Full body, centered, three-quarter view, plenty of cream margin.
```

## 2. `bear-crawl.png` — 爬取中

- **用途**：进度状态 / 爬取中的小熊，正在网页堆里翻找。
- **尺寸**：1024×1024
- **提示词**：

```
[风格前缀 + 角色设定]
Papa kneels and enthusiastically digs through a messy pile of paper web pages,
holding a large round magnifying glass in one paw, the satchel open beside him with
a few tiny media icons spilling out. Motion lines around the magnifying glass,
a small sweat drop, determined happy expression.
```

## 3. `bear-empty.png` — 空采集袋

- **用途**：还没有结果时的空状态插画。
- **尺寸**：1024×1024
- **提示词**：

```
[风格前缀 + 角色设定]
Papa sits on the floor holding his satchel upside down, peeking inside with a puzzled
but hopeful expression, one ear flopped. A single small dust bunny floats out of the
empty bag. Cozy, quiet, endearing, no text.
```

## 4. `bear-happy.png` — 下载完成

- **用途**：批量下载完成 / 成功提示。
- **尺寸**：1024×1024
- **提示词**：

```
[风格前缀 + 角色设定]
Papa hugs his satchel which is comically bulging and overflowing with tiny photo,
video and music icons. Big joyful closed-eye smile, little star sparkles and paw-print
confetti around him. Celebratory but simple flat comic style, no text.
```

## 5. `bear-error.png` — 出错 / 需要登录

- **用途**：错误提示、需要登录的附图标。
- **尺寸**：1024×1024
- **提示词**：

```
[风格前缀 + 角色设定]
Papa stands tangled in a soft tangle of fishing line / thick yarn, holding a tiny key,
scratching his head with a sheepish apologetic smile, one eyebrow raised. The satchel
hangs at his side. Gentle humor, not scary, no text.
```

## 6. `bear-login.png` — 登录站点

- **用途**：设置页「登录站点」空状态插画。
- **尺寸**：1024×1024
- **提示词**：

```
[风格前缀 + 角色设定]
Papa stands next to a small rounded wooden door with a big brass keyhole, holding an
oversized old-fashioned key with both paws, looking up at the door with a patient
friendly expression. A tiny welcome mat, a leaf-shaped sign with no letters.
```

## 7. `paper-pattern.png` — 页面底纹（可选）

- **用途**：页面背景的极淡纸纹。**重点是干净、低对比**，不能和正文抢注意力。
- **尺寸**：1024×1024。页面按单张 `cover` 固定铺满视口，**不需要无缝**，也不做平铺。
- **提示词（v2 · 干净版）**：

```
Minimal decorative page background on flat cream paper #FFF7E8. Extremely subtle,
low-contrast, calm. Only a few (12–18) very small, widely spaced doodles: tiny paw
prints, small honey-yellow dots, one or two thin line swashes. About 90% empty space,
no large icons, no photo frames, no music notes, no text, no characters. Muted warm
brown at 10–15% opacity, soft paper grain, no gradients, no shadows. Designed to sit
behind UI text without reducing readability.
```

> v2 干净版已生成并接入（`design-assets/paper-pattern.png`）。如再调整，仍同名覆盖后运行 `python3 scripts/prepare_assets.py`。

## 8. `bear-app-icon.png` — 应用图标

- **用途**：桌面 App 图标与 Dock 图标。
- **尺寸**：1024×1024，正方形构图
- **提示词**：

```
App icon, square. Close-up of Papa the chubby brown bear peeking over the rim of a
canvas satchel, only head and paws visible, big friendly smile, thick warm-ink outlines,
flat warm colors, honey-yellow background (#F9C74F), centered composition, bold and
readable at small sizes, no text, no border.
```

生成后把原图放进 `design-assets/`，然后：

```bash
# 1. 生成网页用 WebP（小熊 + 底纹 + 圆角图标）
python3 scripts/prepare_assets.py

# 2. 替换 macOS / 移动端图标
pnpm --filter @crawl-bear/desktop exec tauri icon ../../design-assets/app-icon-rounded.png
```

---

## 9. 接入约定

1. 生图原稿按上表命名放进 `design-assets/`。
2. 运行 `python3 scripts/prepare_assets.py`：
   - 小熊图按 alpha 裁边、缩到 960px，输出 `apps/desktop/public/assets/bear-<mood>.webp`（单张约 130–170KB，保留透明背景）；
   - 底纹输出 `apps/desktop/public/assets/paper-pattern.webp`；
   - 生成顶栏圆角小图标 `apps/desktop/public/assets/bear-logo.webp`；
   - 生成符合 macOS 圆角规范的 `design-assets/app-icon-rounded.png`；
   - 同步一份到 `apps/website/public/assets/brand/`，官网直接复用。
3. 页面通过 `Mascot` 组件自动探测：优先 `/assets/bear-<mood>.webp`，其次 `.png`，都不存在就用内置 SVG（缺图也能正常交付）。
4. 底纹**不做平铺**：手绘纹样平铺必然出现接缝或镜像瑕疵，所以页面把它当作一张 `cover` 固定背景铺满视口，从根上避免衔接问题（见 `styles.css` 的 `.paper-dots`）。
5. 构建（`pnpm build:desktop`）会把 `apps/desktop/public/assets/` 打进应用资源；原稿目录不会进包。
6. 视觉验收：与 `docs/design.md` §3 对照，确认无阴影、无渐变、无文字。
