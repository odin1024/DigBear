import { useEffect, useState } from "react";
import { loadLocale, setLocale, t, type Locale } from "./i18n";
import type { ComponentType, ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowRightIcon,
  CheckIcon,
  DownloadIcon,
  EyeIcon,
  GithubIcon,
  GlobeIcon,
  LayersIcon,
  LockIcon,
  PawIcon,
  ShieldIcon,
  SparkIcon,
} from "./components/Icons";
import { SmartImage } from "./components/SmartImage";
import { VERSION } from "./version";

/**
 * 源码仓库地址。
 *
 * 留空时，所有指向 GitHub 的入口都会变成「待公布」的占位按钮，
 * 不会把用户带到错误的仓库去。
 */
const REPO = "https://github.com/odin1024/DigBear";

/** 仓库地址还没公布时，把链接渲染成不可点的占位。 */
function RepoLink({
  className,
  path = "",
  children,
}: {
  className?: string;
  path?: string;
  children: ReactNode;
}) {
  if (!REPO) {
    return (
      <span className={`${className ?? ""} repo-pending`}>
        {children}
        <span className="repo-pending__tag">
          {t("仓库地址待公布", "Repo coming soon")}
        </span>
      </span>
    );
  }
  return (
    <a className={className} href={`${REPO}${path}`} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

type Feature = {
  icon: ComponentType<{ size?: number }>;
  title: [string, string];
  body: [string, string];
};

const FEATURES: Feature[] = [
  {
    icon: GlobeIcon,
    title: ["任意网站", "Any website"],
    body: ["粘贴网址或分享文字，自动补齐 https，不用记格式。", "Paste a URL or share text; https is filled in for you."],
  },
  {
    icon: LayersIcon,
    title: ["四类媒体", "Four media types"],
    body: ["图片、视频、音乐、字体一次翻出来，按类型筛选计数。", "Images, videos, music and fonts in one pass, with type filters and counts."],
  },
  {
    icon: EyeIcon,
    title: ["即点即看", "Preview first"],
    body: ["点卡片先预览：大图、视频播放、字体样张都在弹窗里。", "Click a card to preview images, video, audio and fonts before saving."],
  },
  {
    icon: LockIcon,
    title: ["登录复用", "Login reuse"],
    body: ["需要登录的站点在独立窗口手动登录，Cookie 只留在本机。", "Sign in to gated sites in a separate window; cookies stay on your Mac."],
  },
  {
    icon: DownloadIcon,
    title: ["批量收袋", "Batch collect"],
    body: ["并发下载、随时取消，HLS/DASH 自动合并 MP4，按域名归档。", "Parallel downloads, cancellable, HLS/DASH remuxed to MP4 and grouped by domain."],
  },
  {
    icon: SparkIcon,
    title: ["专站解析", "Site-specific parsing"],
    body: ["X、YouTube 等站点自动挑最高清晰度，结果页会亮起专属解析标签。", "X and YouTube pick the highest quality source and show a parser badge."],
  },
];

const STEPS = [
  {
    number: "01",
    title: ["贴上网页地址", "Paste a URL"],
    body: ["首页只有一个输入框，粘贴、回车，剩下的交给小熊。", "One input on the home screen. Paste, hit Enter, and let the bear work."],
  },
  {
    number: "02",
    title: ["小熊翻找", "The bear crawls"],
    body: ["页面在后台被滚动、扫描，图片、视频、音乐、字体一件件落进结果页。", "The page is scrolled and scanned in the background; media lands on the results page."],
  },
  {
    number: "03",
    title: ["收进采集袋", "Collect"],
    body: ["筛选、预览、勾选，批量保存到你的文件夹，按站点自动归档。", "Filter, preview, select and save in batches — grouped by site automatically."],
  },
];

const asset = (path: string) =>
  `${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`;

const SHOTS = [
  {
    id: "home",
    label: ["首页", "Home"],
    src: asset("/assets/shots/home.webp"),
    caption: ["一个输入框，一屏就够", "One input, one screen"],
  },
  {
    id: "results",
    label: ["结果", "Results"],
    src: asset("/assets/shots/results.webp"),
    caption: ["按类型筛选、排序、预览，勾选后一次性收进采集袋", "Filter by kind, sort, preview, then save the picks in one go"],
  },
  {
    id: "settings",
    label: ["设置", "Settings"],
    src: asset("/assets/shots/settings.webp"),
    caption: ["保存位置、扩展、并发、主题与登录站点", "Folder, extensions, concurrency, theme and login sites"],
  },
];

const TECH: Array<[string, string]> = [
  ["Tauri 2", "Tauri 2"],
  ["Rust", "Rust"],
  ["React 18", "React 18"],
  ["TypeScript", "TypeScript"],
  ["Vite", "Vite"],
  ["framer-motion", "framer-motion"],
  ["FFmpeg 扩展", "FFmpeg extension"],
  ["系统代理", "System proxy"],
];

export default function App() {
  const reduceMotion = useReducedMotion();
  const [locale, setLocaleState] = useState<Locale>(() => {
    const initial = loadLocale();
    setLocale(initial);
    return initial;
  });
  const [shot, setShot] = useState(SHOTS[1]);

  useEffect(() => {
    document.documentElement.lang = locale === "en" ? "en" : "zh-CN";
    document.title =
      locale === "en"
        ? "DigBear — collect media from any webpage"
        : "掘掘熊 · DigBear — 把网页里的宝贝收进采集袋";
    const description = document.querySelector('meta[name="description"]');
    description?.setAttribute(
      "content",
      locale === "en"
        ? "DigBear is a local Windows media crawler. Paste a URL and collect images, videos, music and fonts."
        : "掘掘熊 DigBear：一个跑在 Windows 本机的网页媒体翻找工具。输入网址，图片、视频、音乐、字体一次翻出来，只读、本机、无遥测。",
    );
  }, [locale]);

  const toggleLocale = () => {
    const next = locale === "zh" ? "en" : "zh";
    setLocale(next);
    setLocaleState(next);
    document.documentElement.lang = next === "en" ? "en" : "zh-CN";
  };

  return (
    <div className="site">
      <div className="paper" aria-hidden="true" />

      <header className="nav">
        <a className="nav__brand" href="#top" aria-label={t("掘掘熊 DigBear 首页", "DigBear home")}>
          <img src={asset("/assets/brand/bear-logo.webp")} alt="" />
          <span>
            <strong>{t("掘掘熊", "DigBear")}</strong>
            <em>DigBear</em>
          </span>
        </a>
        <nav className="nav__links" aria-label={t("主导航", "Main navigation")}>
          <a href="#features">{t("功能", "Features")}</a>
          <a href="#smart">{t("解析", "Parsing")}</a>
          <a href="#screens">{t("界面", "Screens")}</a>
          <a href="#tech">{t("技术", "Tech")}</a>
          <a href="#install">{t("安装", "Install")}</a>
          <a href="#download">{t("下载", "Download")}</a>
        </nav>
        <button
          type="button"
          className="nav__lang"
          onClick={toggleLocale}
          aria-label={locale === "zh" ? "Switch to English" : "切换到中文"}
        >
          {locale === "zh" ? "EN" : "中文"}
        </button>
        <RepoLink className="nav__github">
          <GithubIcon size={18} />
          GitHub
        </RepoLink>
      </header>

      <main id="top">
        <section className="hero">
          <motion.div
            className="hero__copy"
            initial={reduceMotion ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 24 }}
          >
            <span className="eyebrow">
              <PawIcon size={13} />
              {t("Windows · 本机运行 · MIT 开源", "Windows · local · MIT open source")}
            </span>
            <h1>
              {t("把网页里的宝贝，", "All the treasures on the web,")}
              <br />
              <span className="mark">{t("收进采集袋。", "into your collection bag.")}</span>
            </h1>
            <p className="hero__lede">
              {t(
                "输入一个网址，把图片、视频、音乐、字体全部分类找出来。",
                "Paste a URL and sort all its images, videos, music and fonts.",
              )}
            </p>
            <div className="hero__actions">
              <RepoLink className="btn btn--primary" path="/releases">
                <DownloadIcon size={18} />
                {t("下载 Windows 版", "Download for Windows")}
              </RepoLink>
              <RepoLink className="btn">
                <GithubIcon size={17} />
                {t("查看源码", "View source")}
              </RepoLink>
            </div>
          </motion.div>

          <motion.div
            className="hero__art"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.1 }}
          >
            <span className="hero__blob" aria-hidden="true" />
            <SmartImage
              className="hero__bear"
              primary={asset("/assets/generated/hero.png")}
              fallback={asset("/assets/brand/bear-hero.webp")}
              alt={t("小熊爬爬抱着采集袋挥手", "The bear waving with a collection bag")}
            />
            <span className="sticker sticker--jpg">JPG</span>
            <span className="sticker sticker--mp4">MP4</span>
            <span className="sticker sticker--mp3">MP3</span>
            <span className="sticker sticker--font">WOFF2</span>
            <span className="hero__spark" aria-hidden="true">
              <SparkIcon size={26} />
            </span>
          </motion.div>
        </section>

        <section className="section" id="features">
          <div className="section__head">
            <span className="eyebrow">
              <SparkIcon size={12} />
              {t("能做什么", "What it does")}
            </span>
            <h2>{t("一次翻遍网页里的媒体", "All the media on a page, in one pass")}</h2>
          </div>

          <div className="features">
            {FEATURES.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <motion.article
                  key={feature.title[0]}
                  className="feature"
                  initial={reduceMotion ? false : { opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-80px" }}
                  transition={{ duration: 0.35, delay: index * 0.04 }}
                  whileHover={reduceMotion ? undefined : { y: -4 }}
                >
                  <span className="feature__icon">
                    <Icon size={20} />
                  </span>
                  <h3>{t(feature.title[0], feature.title[1])}</h3>
                  <p>{t(feature.body[0], feature.body[1])}</p>
                </motion.article>
              );
            })}
          </div>
        </section>

        <section className="section split" id="preview">
          <motion.div
            className="split__art"
            initial={reduceMotion ? false : { opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.4 }}
          >
            <SmartImage
              primary={asset("/assets/generated/preview.png")}
              fallback={asset("/assets/brand/bear-happy.webp")}
              alt={t("小熊抱着装满媒体文件的采集袋", "The bear holding a bag full of media files")}
            />
            <span className="split__tag">{t("先看，再收", "Preview, then save")}</span>
          </motion.div>
          <motion.div
            className="split__copy"
            initial={reduceMotion ? false : { opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.4, delay: 0.08 }}
          >
            <span className="eyebrow">
              <EyeIcon size={12} />
              {t("预览", "Preview")}
            </span>
            <h2>{t("点一下，先看再收。", "Click once. Preview first, save second.")}</h2>
            <ul className="checks">
              <li>
                <CheckIcon size={15} />
                {t("图片 / 视频 / 音频 / 字体分别适配", "Images, video, audio and fonts each get a fitting preview")}
              </li>
              <li>
                <CheckIcon size={15} />
                {t("保留尺寸、时长、域名等元信息", "Dimensions, duration and host metadata are kept")}
              </li>
              <li>
                <CheckIcon size={15} />
                {t("预览不会向网站回传任何操作", "Previewing sends nothing back to the site")}
              </li>
            </ul>
          </motion.div>
        </section>

        <section className="section split" id="smart">
          <motion.div
            className="split__art"
            initial={reduceMotion ? false : { opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.4 }}
          >
            <SmartImage
              primary={asset("/assets/generated/resolver.png")}
              fallback={asset("/assets/brand/bear-crawl.webp")}
              alt={t("小熊拿着放大镜和工具，正在调校一枚媒体解析齿轮", "The bear tuning a media parsing gear with a magnifying glass")}
            />
            <span className="split__tag">{t("最高清晰度", "Highest quality")}</span>
          </motion.div>
          <motion.div
            className="split__copy"
            initial={reduceMotion ? false : { opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.4, delay: 0.08 }}
          >
            <span className="eyebrow">
              <SparkIcon size={12} />
              {t("专属解析", "Site-specific parsing")}
            </span>
            <h2>{t("难啃的站点，交给专属解析。", "Tough sites are handled by dedicated parsers.")}</h2>
            <ul className="checks">
              <li>
                <CheckIcon size={15} />
                {t("X 视频自动取最高档，避开低清 HLS 变体", "X videos pick the highest quality and skip low HLS variants")}
              </li>
              <li>
                <CheckIcon size={15} />
                {t("YouTube 走应用内解析，不依赖外部下载器", "YouTube uses in-app parsing, with no external downloader")}
              </li>
              <li>
                <CheckIcon size={15} />
                {t("遇到难抓取的站点？", "Found a site we cannot parse?")}{" "}
                <RepoLink className="checks__link" path="/issues">
                  {t("在 GitHub 提 Issue", "Open a GitHub Issue")}
                </RepoLink>
                {t("，我们会逐步支持。", " and we will add support over time.")}
              </li>
            </ul>
          </motion.div>
        </section>

        <section className="section" id="how">
          <div className="section__head">
            <span className="eyebrow">
              <PawIcon size={12} />
              {t("使用方法", "How it works")}
            </span>
            <h2>{t("三步，收工。", "Three steps, done.")}</h2>
          </div>
          <div className="steps">
            {STEPS.map((step) => (
              <article className="step" key={step.number}>
                <span className="step__number">{step.number}</span>
                <h3>{t(step.title[0], step.title[1])}</h3>
                <p>{t(step.body[0], step.body[1])}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section" id="screens">
          <div className="section__head">
            <span className="eyebrow">
              <LayersIcon size={12} />
              {t("界面", "Screens")}
            </span>
            <h2>{t("安静、干净、有点憨。", "Quiet, clean, a little clumsy.")}</h2>
            <p>{t("固定顶栏，页面不跳；结果页独立滚动，翻找与整理互不打扰。", "A fixed header, no jumping pages; results scroll independently so crawling and sorting stay out of each other’s way.")}</p>
          </div>

          <div className="shots">
            <div className="shots__tabs" role="tablist" aria-label={t("界面预览", "Screens preview")}>
              {SHOTS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={shot.id === item.id}
                  className="shots__tab"
                  onClick={() => setShot(item)}
                >
                  {t(item.label[0], item.label[1])}
                </button>
              ))}
            </div>

            <div className="shots__frame">
              <div className="shots__chrome" aria-hidden="true">
                <span />
                <span />
                <span />
                <em>{t(shot.caption[0], shot.caption[1])}</em>
              </div>
              <AnimatePresence mode="wait" initial={false}>
                <motion.img
                  key={shot.id}
                  src={shot.src}
                  alt={t(`${shot.label[0]}界面截图`, `${shot.label[1]} screenshot`)}
                  initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.24 }}
                />
              </AnimatePresence>
            </div>
          </div>
        </section>

        <section className="tech" id="tech">
          <div className="tech__inner">
            <div>
              <span className="eyebrow eyebrow--light">
                <ShieldIcon size={12} />
                {t("技术", "Tech")}
              </span>
              <h2>
                {t("桌面级的小工具，", "A proper desktop tool,")}
                <br />
                {t("不是网页套壳。", "not a website in a wrapper.")}
              </h2>
              <RepoLink className="btn btn--light" path="/tree/main/docs">
                {t("阅读架构文档", "Read the architecture docs")}
                <ArrowRightIcon size={16} />
              </RepoLink>
            </div>
            <ul className="tech__chips">
              {TECH.map((chip) => (
                <li key={chip[0]}>{t(chip[0], chip[1])}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="section install" id="install">
          <div className="install__card">
            <div className="install__copy">
              <span className="eyebrow">
                <DownloadIcon size={12} />
                {t("安装", "Install")}
              </span>
              <h2>{t("第一次打开，按这三步来。", "First launch, in three steps.")}</h2>
              <p className="install__lede">
                {t(
                  "我们没有购买代码签名证书，所以安装包没有签名。Windows SmartScreen 首次运行会拦一下。",
                  "We have not purchased a code-signing certificate, so the package is unsigned. Windows SmartScreen will warn on the first launch.",
                )}
              </p>
              <ol className="install__steps">
                <li>
                  <span>1</span>
                  <div>
                    <strong>{t("下载 NSIS 安装包并运行", "Download the NSIS installer and run it")}</strong>
                    <p>{t("在 GitHub Releases 下载 DigBear_*_x64-setup.exe，双击即可安装。", "Download DigBear_*_x64-setup.exe from GitHub Releases and run it.")}</p>
                  </div>
                </li>
                <li>
                  <span>2</span>
                  <div>
                    <strong>{t("在 SmartScreen 里放行", "Allow it in SmartScreen")}</strong>
                    <p>
                      {t(
                        "如果提示「Windows 已保护你的电脑」，点「更多信息」→「仍要运行」。",
                        "If Windows says it protected your PC, click More info → Run anyway.",
                      )}
                    </p>
                  </div>
                </li>
                <li>
                  <span>3</span>
                  <div>
                    <strong>{t("还是被拦？检查一下系统设置", "Still blocked? Check your system settings")}</strong>
                    <p>
                      {t("打开「Windows 安全中心 → 保护历史记录」，允许这个安装包运行。", "Open Windows Security → Protection history and allow the installer.")}
                      <code>DigBear_{VERSION}_x64-setup.exe</code>
                      {t("然后重新运行安装包。", "Then run the installer again.")}
                    </p>
                  </div>
                </li>
              </ol>
              <p className="install__privacy">
                <ShieldIcon size={15} />
                {t(
                  "隐私：不上传媒体、无遥测；Cookie 和设置只留在本机；只访问你选择的下载目录。不需要相机、麦克风或屏幕录制权限。",
                  "Privacy: no media uploads, no telemetry; cookies and settings stay on this computer; only the download folder you choose is accessed. No camera, microphone or screen-recording permission is needed.",
                )}
              </p>
              <div className="install__actions">
                <RepoLink className="btn" path="/blob/main/docs/PREVIEW.md">
                  {t("查看完整安装说明", "Read the full install guide")}
                  <ArrowRightIcon size={16} />
                </RepoLink>
              </div>
            </div>
            <div className="install__art">
              <SmartImage
                primary={asset("/assets/generated/install.png")}
                fallback={asset("/assets/brand/bear-login.webp")}
                alt={t("小熊抱着安装包裹，旁边是盾牌和门", "The bear holding a key beside a door")}
              />
              <span className="split__tag">{t("本机优先", "Local first")}</span>
            </div>
          </div>
        </section>

        <section className="download" id="download">
          <div className="download__card">
            <img className="download__logo" src={asset("/assets/brand/bear-logo.webp")} alt="" />
            <div>
              <span className="eyebrow">
                <DownloadIcon size={12} />
                {t("获取", "Get it")}
              </span>
              <h2>{t("准备好翻找了吗？", "Ready to start digging?")}</h2>
              <p>
                {t("从 GitHub 获取源码或下载 Windows 版本。如果 Releases 暂时没有安装包，可以按 ", "Get the source on GitHub or download the Windows build. If Releases has no package yet, follow the ")}
                <RepoLink path="#readme">README</RepoLink>
                {t(" 的步骤自行构建。", " steps to build it yourself.")}
              </p>
              <p className="download__note">
                {t("首次安装？先看", "First install? Read the")}{" "}
                <a href="#install">{t("安装步骤与隐私说明", "installation and privacy guide")}</a>{t("。", ".")}
              </p>
              <div className="download__actions">
                <RepoLink className="btn btn--primary" path="/releases">
                  <DownloadIcon size={18} />
                  {t("前往 GitHub Releases", "Go to GitHub Releases")}
                </RepoLink>
                <RepoLink className="btn">
                  <GithubIcon size={17} />
                  {t("给个 Star", "Star on GitHub")}
                </RepoLink>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="footer__brand">
          <img src={asset("/assets/brand/bear-logo.webp")} alt="" />
          <div>
            <strong>{t("掘掘熊", "DigBear")} · DigBear</strong>
            <p>{t("只读翻找，本机保存。", "Read-only crawling, saved locally.")}</p>
          </div>
        </div>
        <nav className="footer__links" aria-label={t("页脚链接", "Footer links")}>
          <RepoLink path="">{t("源码", "Source")}</RepoLink>
          <RepoLink path="/blob/main/LICENSE">MIT License</RepoLink>
          <a href="#features">{t("功能", "Features")}</a>
          <a href="#download">{t("下载", "Download")}</a>
        </nav>
        <div className="footer__contact">
          <img
            className="footer__qr"
            src={asset("/assets/author-qr.png")}
            alt={t("作者公众号二维码", "Author's WeChat official account QR code")}
          />
          <div className="footer__contact-text">
            <strong>{t("扫码联系作者", "Reach the author")}</strong>
            <p>
              {t(
                "遇到问题、有建议或想提一条需求，欢迎公众号留言，反馈会更快看到。",
                "Questions, ideas or feature requests? Leave a message on the official account — replies come faster there.",
              )}
            </p>
          </div>
        </div>
        <p className="footer__note">
          <span className="footer__version">v{VERSION}</span>
          {t("仅用于保存你有权使用的内容，请遵守目标网站条款与著作权法律。", "Only save content you have the right to use. Respect site terms and copyright law.")}
        </p>
      </footer>
    </div>
  );
}
