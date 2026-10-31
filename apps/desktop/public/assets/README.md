# 界面图像资产

| 文件 | 来源 | 说明 |
| --- | --- | --- |
| `bear-<mood>.webp` / `.png` | **本项目自产** —— 即梦 Seedream 4.6 生成 | 吉祥物插画，透明背景，1024px。`mood` ∈ `hero / crawl / empty / happy / error / login` |
| `bear-logo.webp` / `.png` | **本项目自产** —— Pillow 矢量绘制 | 顶栏品牌图标（紫底矿工帽熊） |
| `paper-pattern.webp` | 继承自上游 | 页面底纹 |

## 重新生成

```bash
# 1) 生成吉祥物（需要 JIMENG_AK / JIMENG_SK 环境变量）
python scripts/gen_mascots.py --out-dir build-preview/mascot-test

# 2) 抠白底 → 裁切 → 输出 WebP/PNG 到本目录
python scripts/install_mascots.py --src-dir build-preview/mascot-test

# 3) 生成图标（应用图标 + 顶栏 logo）
python scripts/make_icon.py
```

## 设计说明

吉祥物与图标使用同一套设计语言：**奶油色毛发 + 琥珀色矿工帽（带头灯）+ 深紫描边**，
与界面顶栏的紫色主色呼应。矿工帽是「掘掘」这一名字的直接视觉表达，
也用于和上游的「背包熊」形象做区分。

缺图时 `Mascot` 组件会自动回退到内置 SVG，不影响构建与使用。