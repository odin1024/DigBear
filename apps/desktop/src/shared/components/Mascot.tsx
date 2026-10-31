import { useEffect, useState } from "react";
import { t } from "../i18n";
import type { CSSProperties } from "react";

export type MascotMood =
  | "hero"
  | "crawl"
  | "empty"
  | "happy"
  | "error"
  | "login";

interface MascotProps {
  mood?: MascotMood;
  size?: number;
  className?: string;
  /** Disable the idle bob (e.g. in dense rows). */
  still?: boolean;
  style?: CSSProperties;
}

const INK = "#33261D";
const FUR = "#B97B43";
const FUR_DARK = "#96602F";
const CREAM = "#F0D3A7";
const HONEY = "#F9C74F";
const BERRY = "#E2553C";
const LEAF = "#5E9C68";

/** Generated illustrations are picked up automatically once dropped into public/assets. */
const ASSET_MOODS: MascotMood[] = [
  "hero",
  "crawl",
  "empty",
  "happy",
  "error",
  "login",
];

function useGeneratedAsset(mood: MascotMood): string | null {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!ASSET_MOODS.includes(mood)) return undefined;
    let alive = true;
    const base = import.meta.env.BASE_URL;
    // Prefer the optimized WebP produced by scripts/prepare_assets.py, but
    // accept a hand-dropped PNG as well.
    const candidates = [
      `${base}assets/bear-${mood}.webp`,
      `${base}assets/bear-${mood}.png`,
    ];
    const tryNext = (index: number) => {
      if (!alive || index >= candidates.length) {
        if (alive) setSrc(null);
        return;
      }
      const probe = new Image();
      probe.onload = () => {
        if (alive) setSrc(candidates[index]);
      };
      probe.onerror = () => {
        if (alive) tryNext(index + 1);
      };
      probe.src = candidates[index];
    };
    tryNext(0);
    return () => {
      alive = false;
    };
  }, [mood]);
  return src;
}

/**
 * Papa the crawler bear. Built-in SVG fallback that mirrors the generated
 * illustrations described in docs/assets.md, so the UI is complete before art lands.
 */
export function Mascot({
  mood = "hero",
  size = 260,
  className,
  still = false,
  style,
}: MascotProps) {
  const asset = useGeneratedAsset(mood);
  const classes = [
    "mascot",
    `mascot--${mood}`,
    still ? "mascot--still" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classes}
      style={{ width: size, height: size, ...style }}
      data-asset={asset ? "generated" : "svg"}
    >
      {asset ? (
        <img className="mascot__asset" src={asset} alt="" draggable={false} />
      ) : (
        <BearSvg mood={mood} />
      )}
    </div>
  );
}

function Eyes({ mood }: { mood: MascotMood }) {
  if (mood === "happy") {
    return (
      <g className="mascot__eyes">
        <path
          d="M126 118 q10 -12 20 0"
          stroke={INK}
          strokeWidth="5"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M174 118 q10 -12 20 0"
          stroke={INK}
          strokeWidth="5"
          fill="none"
          strokeLinecap="round"
        />
      </g>
    );
  }
  if (mood === "empty") {
    return (
      <g className="mascot__eyes">
        <circle cx="136" cy="116" r="6" fill={INK} />
        <circle cx="184" cy="116" r="8" fill={INK} />
      </g>
    );
  }
  if (mood === "error") {
    return (
      <g className="mascot__eyes">
        <path d="M126 112 l18 10 M126 122 l18 -10" stroke={INK} strokeWidth="5" strokeLinecap="round" />
        <path d="M176 112 l18 10 M176 122 l18 -10" stroke={INK} strokeWidth="5" strokeLinecap="round" />
      </g>
    );
  }
  return (
    <g className="mascot__eyes">
      <g className="mascot__blink">
        <circle cx="136" cy="116" r="7" fill={INK} />
        <circle cx="184" cy="116" r="7" fill={INK} />
        <circle cx="138.5" cy="113.5" r="2.2" fill="#FFF8EC" />
        <circle cx="186.5" cy="113.5" r="2.2" fill="#FFF8EC" />
      </g>
    </g>
  );
}

function Muzzle({ mood }: { mood: MascotMood }) {
  return (
    <g>
      <ellipse cx="160" cy="146" rx="38" ry="28" fill={CREAM} stroke={INK} strokeWidth="5" />
      <ellipse cx="160" cy="136" rx="9" ry="7" fill={INK} />
      {mood === "happy" ? (
        <path
          d="M146 150 q14 14 28 0"
          stroke={INK}
          strokeWidth="4.5"
          fill="none"
          strokeLinecap="round"
        />
      ) : mood === "error" ? (
        <path
          d="M148 154 q12 -8 24 0"
          stroke={INK}
          strokeWidth="4.5"
          fill="none"
          strokeLinecap="round"
        />
      ) : mood === "empty" ? (
        <ellipse cx="160" cy="154" rx="7" ry="9" fill={INK} />
      ) : (
        <path
          d="M160 144 v8 M148 152 q12 10 24 0"
          stroke={INK}
          strokeWidth="4.5"
          fill="none"
          strokeLinecap="round"
        />
      )}
    </g>
  );
}

function Satchel({ mood }: { mood: MascotMood }) {
  const full = mood === "happy";
  return (
    <g className="mascot__satchel">
      {/* strap across the chest */}
      <path
        d="M124 182 Q162 206 204 230"
        stroke={INK}
        strokeWidth="7"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M124 182 Q162 206 204 230"
        stroke="#8A5A2E"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
      {/* bag body */}
      <path
        d="M102 216 q58 -18 116 0 l6 46 q-64 20 -128 0 z"
        fill="#E9C48D"
        stroke={INK}
        strokeWidth="5.5"
        strokeLinejoin="round"
      />
      <path
        d="M102 216 q58 16 116 0"
        stroke={FUR_DARK}
        strokeWidth="3"
        fill="none"
        opacity="0.5"
      />
      {/* flap */}
      <path
        d="M114 231 q46 -14 92 0 l3 24 q-49 14 -98 0 z"
        fill="#F7DDAE"
        stroke={INK}
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path
        d="M150 244 q11 -8 22 0 q-2 12 -11 12 q-9 0 -11 -12 z"
        fill={LEAF}
        stroke={INK}
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      {full && (
        <g className="mascot__loot">
          <circle cx="124" cy="210" r="9" fill={HONEY} stroke={INK} strokeWidth="3" />
          <circle cx="139" cy="203" r="6" fill={BERRY} stroke={INK} strokeWidth="3" />
        </g>
      )}
    </g>
  );
}

function Prop({ mood }: { mood: MascotMood }) {
  if (mood === "crawl") {
    return (
      <g className="mascot__prop">
        <circle cx="228" cy="156" r="30" fill="#EAF4F6" stroke={INK} strokeWidth="5.5" />
        <path
          d="M248 178 l24 24"
          stroke={INK}
          strokeWidth="10"
          strokeLinecap="round"
        />
        <path
          d="M214 150 q12 -10 26 0"
          stroke="#7FB6C9"
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
        />
      </g>
    );
  }
  if (mood === "login") {
    return (
      <g className="mascot__prop">
        <circle cx="236" cy="196" r="14" fill="none" stroke={INK} strokeWidth="6" />
        <path d="M248 206 l26 26 M262 220 l10 -10 M270 228 l10 -10" stroke={INK} strokeWidth="6" strokeLinecap="round" />
      </g>
    );
  }
  if (mood === "happy") {
    return (
      <g className="mascot__prop mascot__sparkles">
        <path d="M248 96 l4 12 12 4 -12 4 -4 12 -4 -12 -12 -4 12 -4 z" fill={HONEY} stroke={INK} strokeWidth="3" />
        <path d="M80 120 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3 z" fill={BERRY} stroke={INK} strokeWidth="2.5" />
      </g>
    );
  }
  if (mood === "error") {
    return (
      <g className="mascot__prop">
        <path
          d="M60 250 q40 -30 84 -6 q46 26 92 -2 q30 -18 48 6"
          stroke={BERRY}
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
          opacity="0.85"
        />
        <path
          d="M54 268 q44 -22 90 -2 q50 22 104 -8"
          stroke={BERRY}
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
          opacity="0.6"
        />
      </g>
    );
  }
  return null;
}

function BearSvg({ mood }: { mood: MascotMood }) {
  const wave = mood === "hero";
  return (
    <svg
      className="mascot__svg"
      viewBox="0 0 320 320"
      role="img"
      aria-label={t("爬爬熊", "Papa the bear")}
    >
      {/* ground shadow */}
      <ellipse cx="160" cy="288" rx="92" ry="14" fill={INK} opacity="0.1" />

      {/* feet */}
      <g className="mascot__feet">
        <ellipse cx="120" cy="272" rx="30" ry="17" fill={FUR} stroke={INK} strokeWidth="5.5" />
        <ellipse cx="200" cy="272" rx="30" ry="17" fill={FUR} stroke={INK} strokeWidth="5.5" />
        <ellipse cx="120" cy="272" rx="12" ry="7" fill={CREAM} />
        <ellipse cx="200" cy="272" rx="12" ry="7" fill={CREAM} />
      </g>

      {/* body */}
      <path
        d="M92 190 q0 -58 68 -58 q68 0 68 58 l0 62 q-68 22 -136 0 z"
        fill={FUR}
        stroke={INK}
        strokeWidth="6"
        strokeLinejoin="round"
      />
      <ellipse cx="160" cy="212" rx="42" ry="34" fill={CREAM} />

      {/* arms: thick fur limbs with ink outline */}
      <g className="mascot__arm mascot__arm--left">
        <path
          d="M100 204 Q86 228 86 246"
          stroke={INK}
          strokeWidth="21"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M100 204 Q86 228 86 246"
          stroke={FUR}
          strokeWidth="13"
          fill="none"
          strokeLinecap="round"
        />
        <circle cx="86" cy="254" r="15" fill={FUR} stroke={INK} strokeWidth="5" />
        <circle cx="86" cy="254" r="6" fill={CREAM} />
      </g>
      <g className="mascot__arm mascot__arm--right">
        {wave ? (
          <>
            <path
              d="M222 204 Q244 176 248 152"
              stroke={INK}
              strokeWidth="21"
              fill="none"
              strokeLinecap="round"
            />
            <path
              d="M222 204 Q244 176 248 152"
              stroke={FUR}
              strokeWidth="13"
              fill="none"
              strokeLinecap="round"
            />
            <circle cx="250" cy="138" r="16" fill={FUR} stroke={INK} strokeWidth="5" />
            <circle cx="250" cy="138" r="6.5" fill={CREAM} />
          </>
        ) : (
          <>
            <path
              d="M220 204 Q238 230 240 248"
              stroke={INK}
              strokeWidth="21"
              fill="none"
              strokeLinecap="round"
            />
            <path
              d="M220 204 Q238 230 240 248"
              stroke={FUR}
              strokeWidth="13"
              fill="none"
              strokeLinecap="round"
            />
            <circle cx="242" cy="256" r="15" fill={FUR} stroke={INK} strokeWidth="5" />
            <circle cx="242" cy="256" r="6" fill={CREAM} />
          </>
        )}
      </g>

      {/* ears */}
      <circle cx="108" cy="72" r="27" fill={FUR} stroke={INK} strokeWidth="6" />
      <circle cx="108" cy="72" r="12" fill={CREAM} />
      <circle cx="212" cy="72" r="27" fill={FUR} stroke={INK} strokeWidth="6" />
      <circle cx="212" cy="72" r="12" fill={CREAM} />

      {/* head */}
      <path
        d="M160 46 q64 0 64 58 q0 46 -64 46 q-64 0 -64 -46 q0 -58 64 -58 z"
        fill={FUR}
        stroke={INK}
        strokeWidth="6"
        strokeLinejoin="round"
      />
      <path
        d="M136 64 q24 -10 48 0"
        stroke={FUR_DARK}
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
        opacity="0.45"
      />
      <Eyes mood={mood} />
      <Muzzle mood={mood} />

      <Satchel mood={mood} />
      <Prop mood={mood} />

      {/* cheeks */}
      <ellipse cx="112" cy="136" rx="11" ry="7" fill={BERRY} opacity="0.35" />
      <ellipse cx="208" cy="136" rx="11" ry="7" fill={BERRY} opacity="0.35" />
    </svg>
  );
}
