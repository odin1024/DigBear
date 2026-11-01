import { useState } from "react";
import { motion } from "framer-motion";
import { t } from "../../shared/i18n";
import { APP_VERSION } from "../../shared/version";
import { InfoIcon, LockIcon, SparkIcon } from "../../shared/components/Icons";

const QR_SRC = `${import.meta.env.BASE_URL}assets/author-qr.png`;
const LOGO_SRC = `${import.meta.env.BASE_URL}assets/bear-logo.webp`;

interface AboutViewProps {
  onOpenSettings: () => void;
}

/**
 * 「关于」页。
 *
 * 这里是用户反馈问题、提建议的唯一入口，所以把公众号二维码放在最显眼
 * 的位置 —— 有问题可以直接公众号留言，不必再去 GitHub 提 issue。
 */
export function AboutView({ onOpenSettings }: AboutViewProps) {
  const [qrFailed, setQrFailed] = useState(false);

  return (
    <motion.div
      className="about"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 0.61, 0.36, 1] }}
    >
      <section className="about__hero">
        <img className="about__logo" src={LOGO_SRC} alt="" />
        <div className="about__hero-text">
          <h1 className="about__title">
            {t("掘掘熊", "DigBear")}
            <span className="about__title-en">DigBear</span>
          </h1>
          <p className="about__tagline">
            {t(
              "开源的网页媒体翻找小工具，只在你的电脑上只读工作。",
              "Open-source media crawler that reads pages locally on your computer.",
            )}
          </p>
        </div>
        <p className="about__version">
          <span className="about__version-chip">v{APP_VERSION}</span>
          <span>{t("MIT 许可证 · 完全开源免费", "MIT licensed · free and open source")}</span>
        </p>
      </section>

      <div className="about__grid">
        <article className="about__card about__card--contact">
          <header className="about__card-head">
            <SparkIcon size={18} />
            <h2>{t("问题反馈与建议", "Feedback & suggestions")}</h2>
          </header>
          <div className="about__contact">
            <div className="about__qr">
              {qrFailed ? (
                <div className="about__qr-fallback">
                  <p>{t("二维码暂未载入", "QR code unavailable")}</p>
                  <span>{t("请把公众号二维码放到 assets/author-qr.png", "Save the QR image as assets/author-qr.png")}</span>
                </div>
              ) : (
                <img
                  src={QR_SRC}
                  alt={t("公众号二维码", "WeChat official account QR code")}
                  onError={() => setQrFailed(true)}
                />
              )}
            </div>
            <div className="about__contact-text">
              <p>
                {t(
                  "遇到问题、有好想法，或者想提一条建议？",
                  "Hit a snag, have an idea, or want to suggest an improvement?",
                )}
              </p>
              <p className="about__contact-hint">
                {t(
                  "扫一扫关注公众号，直接给作者留言，反馈会更快看到。",
                  "Scan the code to follow the official account and leave a message — replies come faster there.",
                )}
              </p>
              <p className="about__contact-hint about__contact-hint--muted">
                {t(
                  "带上网址复现问题，会更容易定位。",
                  "Include the URL when reporting — it makes the bug much easier to pin down.",
                )}
              </p>
            </div>
          </div>
        </article>

        <article className="about__card">
          <header className="about__card-head">
            <InfoIcon size={18} />
            <h2>{t("关于本项目", "About this project")}</h2>
          </header>
          <ul className="about__list">
            <li>
              {t(
                "参考开源项目 Crawl Bear 的思路，重新实现的 Windows 版。",
                "A Windows remake inspired by the open-source Crawl Bear project.",
              )}
            </li>
            <li>
              {t(
                "图片、视频、音乐、字体一起翻找，挑完再批量存到本地。",
                "Finds images, videos, audio and fonts together — pick what you want, then save in one go.",
              )}
            </li>
            <li>
              {t(
                "需要登录的站点在内置窗口登录一次，凭据只留在你自己的电脑上。",
                "Sign in once in the built-in window; credentials never leave your PC.",
              )}
            </li>
          </ul>
        </article>

        <article className="about__card">
          <header className="about__card-head">
            <LockIcon size={18} />
            <h2>{t("隐私与使用须知", "Privacy & usage")}</h2>
          </header>
          <ul className="about__list">
            <li>
              {t(
                "全程只读访问网页，不上传任何素材到你看不见的地方。",
                "Pages are read locally and nothing is uploaded without your knowledge.",
              )}
            </li>
            <li>
              {t(
                "请遵守目标网站条款与著作权法律，只保存你有权使用的内容。",
                "Respect site terms and copyright; save only content you are allowed to use.",
              )}
            </li>
            <li>
              {t(
                "鼓励用于学习与个人素材整理。",
                "Encouraged for learning and organizing your own media.",
              )}
            </li>
          </ul>
        </article>
      </div>

      <footer className="about__foot">
        <span>
          {t("掘掘熊 DigBear · v", "DigBear · v")}
          {APP_VERSION}
          <span className="about__foot-dot">·</span>
          {t("MIT 开源 · 用得放心", "MIT licensed · use it freely")}
        </span>
        <button type="button" className="about__foot-link" onClick={onOpenSettings}>
          {t("去设置登录站点", "Open Settings")}
        </button>
      </footer>

      <p className="about__credits">
        {t(
          "本项目移植自开源项目 Crawl Bear（MIT 许可），感谢原作者 xw-meow 与所有贡献者。",
          "Ported from the open-source Crawl Bear project (MIT). Thanks to xw-meow and all contributors.",
        )}
      </p>
    </motion.div>
  );
}
