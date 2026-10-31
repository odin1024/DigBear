# 致谢与许可

本项目是基于 **[Crawl Bear（超级爬爬熊）](https://github.com/xw-meow/crawl-bear)** 的 Windows 移植版。

## 上游版权

```
MIT License

Copyright (c) 2026 xw-meow
```

上游仓库采用 MIT 许可证。MIT 允许使用、复制、修改、合并、发布、分发、再授权及销售软件副本，
唯一要求是在所有副本或实质性部分中保留版权声明和许可声明。

上游原始许可声明完整保留在本仓库根目录的 `LICENSE` 文件中。

## 本次移植所做的修改

- 平台分支补齐：WebView UA、系统代理、文件名规则、默认下载目录、`curl.exe` 定位、
  打开文件夹/链接、FFmpeg Windows 包。
- 打包配置：Windows NSIS + MSI 目标、WebView2 运行时引导、中英文 NSIS 语言包。
- 持续集成：CI 与 Release 增加 Windows 矩阵。
- 产品标识：更名 **DigBear / 掘掘熊**（`com.digbear.desktop`），并保留上游署名。

详细的技术分析与逐文件改动说明见 [`PORTING.md`](./PORTING.md)。

## 商标与素材

- 界面中的吉祥物、配色与图标资产继承自上游项目，如需商用请替换为自有素材。
- 本项目名称与标识由本仓库维护者自行拟定，与上游作者无关。