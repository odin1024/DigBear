# 超级爬爬熊官网

CrawlBear 的官方介绍页，使用 **Vite + React + TypeScript + framer-motion** 构建，与桌面应用共用同一套手绘贴纸视觉。

**线上地址：** [https://we.miework.cn/crawl-bear/index.html](https://we.miework.cn/crawl-bear/index.html)

## 开发

在仓库根目录：

```bash
pnpm install          # 首次安装
pnpm dev:web          # http://localhost:5173
pnpm build:web        # 产物在 apps/website/dist
```

也可以只在本包内运行：

```bash
pnpm --filter @crawl-bear/website dev
pnpm --filter @crawl-bear/website build
```

## 目录

```text
src/
  App.tsx                 页面结构与文案
  components/Icons.tsx    内联 SVG 图标
  components/SmartImage.tsx  优先加载定制生图，失败回退到已有素材
  styles.css              官网样式
public/assets/
  brand/                  小熊插画、底纹、Logo（由根目录脚本同步）
  shots/                  应用界面截图（由根目录脚本同步）
  generated/              可选的定制生图（见 ASSETS.md）
  og-cover.webp           社交分享图
```

## 配图

需要定制的图片、尺寸与 gpt-image 提示词见 [ASSETS.md](./ASSETS.md)。

- `public/assets/generated/hero.png` 与 `preview.png` 放入后会自动替换占位素材；
- 不放也能正常构建，页面会回退到 `public/assets/brand/` 里的现有小熊插画。
