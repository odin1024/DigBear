import { useState } from "react";
import { motion } from "framer-motion";
import { InfoIcon, PawIcon, SlidersIcon } from "../shared/components/Icons";
import { t } from "../shared/i18n";

export type AppView = "crawler" | "settings" | "about";

interface MastheadProps {
  view: AppView;
  onNavigate: (view: AppView) => void;
}

const LOGO_SRC = `${import.meta.env.BASE_URL}assets/bear-logo.webp`;

function BearMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <circle cx="12" cy="13" r="7.5" fill="#B97B43" stroke="#33261D" strokeWidth="3" />
      <circle cx="36" cy="13" r="7.5" fill="#B97B43" stroke="#33261D" strokeWidth="3" />
      <circle cx="12" cy="13" r="3" fill="#F0D3A7" />
      <circle cx="36" cy="13" r="3" fill="#F0D3A7" />
      <path
        d="M24 12c9.5 0 15 6.3 15 14.4C39 35 32.4 40 24 40S9 35 9 26.4C9 18.3 14.5 12 24 12Z"
        fill="#B97B43"
        stroke="#33261D"
        strokeWidth="3"
      />
      <ellipse cx="24" cy="30" rx="9" ry="6.6" fill="#F0D3A7" stroke="#33261D" strokeWidth="2.4" />
      <circle cx="18.5" cy="24" r="2.1" fill="#33261D" />
      <circle cx="29.5" cy="24" r="2.1" fill="#33261D" />
      <ellipse cx="24" cy="28.2" rx="2.6" ry="2" fill="#33261D" />
      <path d="M24 30.2v2.2" stroke="#33261D" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Masthead({ view, onNavigate }: MastheadProps) {
  const [logoFailed, setLogoFailed] = useState(false);
  return (
    <motion.header
      className="masthead"
      initial={{ y: -18, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 24 }}
    >
      <div className="masthead__inner">
        <button
          type="button"
          className="brand"
          onClick={() => onNavigate("crawler")}
          aria-label={t("掘掘熊 DigBear，回到首页", "DigBear — back to home")}
        >
          <span className="brand__mark" aria-hidden="true">
            {logoFailed ? (
              <BearMark />
            ) : (
              <img src={LOGO_SRC} alt="" onError={() => setLogoFailed(true)} />
            )}
          </span>
          <span className="brand__text">
            <strong>{t("掘掘熊", "DigBear")}</strong>
            <span className="brand__en">DigBear</span>
          </span>
        </button>

        <nav className="main-nav" aria-label={t("主导航", "Main navigation")}>
          <button
            type="button"
            className="main-nav__item"
            aria-current={view === "crawler" ? "page" : undefined}
            onClick={() => onNavigate("crawler")}
          >
            <PawIcon size={15} />
            {t("翻找", "Crawl")}
          </button>
          <button
            type="button"
            className="main-nav__item"
            aria-current={view === "settings" ? "page" : undefined}
            onClick={() => onNavigate("settings")}
          >
            <SlidersIcon size={15} />
            {t("设置", "Settings")}
          </button>
          <button
            type="button"
            className="main-nav__item"
            aria-current={view === "about" ? "page" : undefined}
            onClick={() => onNavigate("about")}
          >
            <InfoIcon size={15} />
            {t("关于", "About")}
          </button>
        </nav>
      </div>
    </motion.header>
  );
}
