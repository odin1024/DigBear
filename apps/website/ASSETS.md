# 官网图片资源清单

> 目标目录：`apps/website/public/assets/generated/`
> 生成工具：gpt-image（推荐 `gpt-image-1`，1024 / 1536）
> 约定：生成后按文件名放进 `generated/`，`SmartImage` 会自动探测并替换占位素材；不放也能正常构建。
> 风格前缀和角色设定与 [`docs/assets.md`](../../docs/assets.md) 保持一致，下面只写差异部分。

统一风格前缀：

```
Hand-drawn comic illustration for a cozy macOS app marketing site. A chubby,
honest-looking brown bear mascot with round ears, cream muzzle, thick warm-ink
outlines, flat warm colors, soft paper texture, no gradients, no shadows, no text,
no watermark. children's picture-book comic style, slightly wobbly hand-drawn
linework, friendly and a bit clumsy. Background: fully transparent.
```

统一角色设定：

```
Character: "Papa" the crawler bear — chubby body, honey-brown fur (#B97B43), cream
muzzle and belly (#F0D3A7), wears a small canvas satchel with a leaf-shaped buckle,
round black-ink eyes.
```

---

## 1. `hero.png` — 首屏主插画

- **用途**：官网 hero 右侧主视觉；当前占位为 `public/assets/brand/bear-hero.webp`。
- **尺寸**：1536×1536，透明背景。
- **提示词**：

```
[风格前缀 + 角色设定]
Papa stands upright on two legs, facing the viewer with a warm open-mouth smile,
holding open his canvas satchel with one paw, the other paw raised in a friendly
wave. A few tiny flat media icons float out of the satchel: photo, play button,
music note, font "A". Full body, centered, generous transparent margin.
```

## 2. `preview.png` — 预览区块插画

- **用途**：官网「点一下，先看再收」区块；当前占位为 `public/assets/brand/bear-happy.webp`。
- **尺寸**：1024×1024，透明背景。
- **提示词**：

```
[风格前缀 + 角色设定]
Papa sits on the floor holding a large empty picture frame with both paws,
peeking through it with a curious happy expression; the satchel sits beside him
with a few tiny photo/video/music icons. Playful, cozy, full body, transparent margin.
```

## 3. `og-cover.png` — 社交分享图（可选）

- **用途**：Open Graph / Twitter 分享卡片；当前使用 `public/assets/og-cover.webp`（由 README banner 生成）。
- **尺寸**：1200×630，**带奶油色背景**，不要透明。
- **提示词**：

```
Wide social share cover, 1200x630, warm cream paper background #FFF7E8 with tiny
sparse paw prints and honey dots. Papa the chubby brown bear mascot on the right,
holding an open canvas satchel with media icons, waving. Large empty space on the
left for a title, flat storybook comic style, thick warm-ink outlines, no text,
no watermark.
```

生成后：

```bash
# 若替换社交分享图，将 og-cover.png 转为 webp 并覆盖
sips -s format webp apps/website/public/assets/generated/og-cover.png --out apps/website/public/assets/og-cover.webp
```

## 4. `resolver.png` — 专属解析区块插画

- **用途**：官网「难啃的站点，交给专属解析」区块；当前占位为 `public/assets/brand/bear-crawl.webp`。
- **尺寸**：1024×1024，透明背景。
- **提示词**：

```
[风格前缀 + 角色设定]
Papa kneels beside a small open toolbox and a brass magnifying glass, adjusting a
large toy-like resolver gear/compass. A few flat media cards (photo, play button,
music note, font "A") orbit around the gear. A tiny blank sparkle badge sticker
floats nearby. Focused but happy expression, full body, centered, generous
transparent margin. No text, no logos.
```

## 5. `install.png` — 安装章节插画

- **用途**：官网「第一次打开」安装区块；当前占位为 `public/assets/brand/bear-login.webp`。
- **尺寸**：1024×1024，透明背景。
- **提示词**：

```
[风格前缀 + 角色设定]
Papa holds a small cardboard shipping box with a leaf-shaped seal, standing beside
a big friendly shield with a simple check mark. A tiny wooden door is visible
behind him. Reassuring smile, calm and trustworthy, full body, centered, generous
transparent margin. No text, no logos, no brand marks.
```

## 6. 无需生成的图

- 应用界面截图：由 `assets/readme/` 同步到 `public/assets/shots/`；
- 小熊插画、底纹、Logo：由根目录 `scripts/prepare_assets.py` 同步到 `public/assets/brand/`；
- 这些图已在仓库里，不需要重复生成。
