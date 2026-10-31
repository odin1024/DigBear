import type { ThemeConfig } from "antd";

const DISPLAY_FONT =
  '"Hannotate SC", "HanziPen SC", "Yuanti SC", "PingFang SC", "Hiragino Sans GB", sans-serif';
const BODY_FONT =
  '"Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const MONO_FONT =
  '"SF Mono", "JetBrains Mono", "Cascadia Mono", Menlo, Consolas, monospace';

/** 可选主题。`night` 同时充当深色模式。 */
export const THEME_NAMES = ["lantern", "forest", "night"] as const;
export type ThemeName = (typeof THEME_NAMES)[number];

export const THEME_LABELS: Record<ThemeName, [string, string]> = {
  lantern: ["矿灯紫琥珀", "Lantern"],
  forest: ["森林手账", "Forest"],
  night: ["夜矿深色", "Night mine"],
};

export const DEFAULT_THEME: ThemeName = "lantern";

/** 每套主题的 CSS 变量值，与 `src/styles.css` 中的选择器一一对应。 */
interface ThemeSpec {
  css: Record<string, string>;
  /** antd 主题的额外覆盖。 */
  antd: Partial<ThemeConfig>;
}

const LANTERN_CSS: Record<string, string> = {
  paper: "#faf5ec",
  "paper-deep": "#efe3d0",
  card: "#fffdf8",
  ink: "#2e2440",
  "ink-soft": "#584a6d",
  muted: "#8a7ea0",
  fur: "#b97b43",
  "fur-light": "#f0d3a7",
  honey: "#f0a830",
  "honey-deep": "#cf8b16",
  berry: "#e2553c",
  "berry-deep": "#b93a24",
  leaf: "#4f9e8c",
  sky: "#6fa8c7",
  line: "#2e2440",
  "line-soft": "#ded4e6",
};

const FOREST_CSS: Record<string, string> = {
  paper: "#fff7e8",
  "paper-deep": "#fbe8c8",
  card: "#fffcf3",
  ink: "#33261d",
  "ink-soft": "#5e4936",
  muted: "#8e7a63",
  fur: "#b97b43",
  "fur-light": "#f0d3a7",
  honey: "#f9c74f",
  "honey-deep": "#eab53a",
  berry: "#e2553c",
  "berry-deep": "#b93a24",
  leaf: "#5e9c68",
  sky: "#7fb6c9",
  line: "#33261d",
  "line-soft": "#e8d3b4",
};

const NIGHT_CSS: Record<string, string> = {
  paper: "#221d2e",
  "paper-deep": "#2a2438",
  card: "#2c2640",
  ink: "#f3ede1",
  "ink-soft": "#c3b8d4",
  muted: "#9b8fb5",
  fur: "#b97b43",
  "fur-light": "#f0d3a7",
  honey: "#ffb03a",
  "honey-deep": "#d18f18",
  berry: "#ff6b5a",
  "berry-deep": "#d1453a",
  leaf: "#5fb3a0",
  sky: "#6fa8c7",
  line: "#3f3757",
  "line-soft": "#3a3252",
};

const SPECS: Record<ThemeName, ThemeSpec> = {
  lantern: { css: LANTERN_CSS, antd: {} },
  forest: { css: FOREST_CSS, antd: {} },
  night: { css: NIGHT_CSS, antd: {} },
};

/** 取某个主题的 CSS 变量值（供运行时写入 style 标签，保证 CSS 与 antd 同源）。 */
export function cssVarsFor(name: string | undefined): Record<string, string> {
  const spec = SPECS[(name ?? DEFAULT_THEME) as ThemeName] ?? SPECS[DEFAULT_THEME];
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(spec.css)) {
    out[`--${key}`] = value;
  }
  return out;
}

/** 判断一个主题是不是深色（用于 `color-scheme`）。 */
export function isDarkTheme(name: string | undefined): boolean {
  return (name ?? DEFAULT_THEME) === "night";
}

/** 生成 antd 主题。 */
export function themeFor(name: string | undefined): ThemeConfig {
  const spec = SPECS[(name ?? DEFAULT_THEME) as ThemeName] ?? SPECS[DEFAULT_THEME];
  const c = spec.css;
  const ink = c.ink;
  const inkRgb = hexToRgb(ink);
  return {
    ...(spec.antd as ThemeConfig),
    token: {
      colorPrimary: c.berry,
      colorPrimaryHover: c["berry-deep"],
      colorPrimaryActive: c["berry-deep"],
      colorError: c.berry,
      colorSuccess: c.leaf,
      colorWarning: c["honey-deep"],
      colorInfo: c.sky,
      colorBgBase: c.paper,
      colorBgContainer: c.card,
      colorBgElevated: c.card,
      colorBgLayout: c.paper,
      colorText: ink,
      colorTextSecondary: c["ink-soft"],
      colorTextTertiary: c.muted,
      colorTextQuaternary: c.muted,
      colorBorder: ink,
      colorBorderSecondary: c["line-soft"],
      borderRadius: 14,
      borderRadiusSM: 10,
      borderRadiusLG: 20,
      controlHeight: 44,
      controlHeightLG: 50,
      fontSize: 14,
      fontFamily: BODY_FONT,
      fontFamilyCode: MONO_FONT,
      boxShadow: `4px 4px 0 rgba(${inkRgb}, 0.16)`,
      boxShadowSecondary: `6px 6px 0 rgba(${inkRgb}, 0.12)`,
      motionDurationMid: "0.2s",
      wireframe: false,
    },
    components: {
      Button: {
        fontWeight: 700,
        primaryShadow: `4px 4px 0 ${ink}`,
        defaultShadow: "none",
        dangerShadow: "none",
        paddingInlineLG: 26,
        contentFontSizeLG: 15,
        borderRadiusLG: 14,
        controlHeightLG: 50,
      },
      Input: {
        activeShadow: `0 0 0 3px rgba(${hexToRgb(c.berry)}, 0.18)`,
        hoverBorderColor: c.berry,
        activeBorderColor: c.berry,
        paddingBlock: 13,
        paddingInline: 16,
        borderRadius: 14,
        controlHeightLG: 52,
      },
      InputNumber: {
        activeShadow: `0 0 0 3px rgba(${hexToRgb(c.berry)}, 0.18)`,
        hoverBorderColor: c.berry,
        activeBorderColor: c.berry,
        borderRadius: 12,
      },
      Alert: {
        defaultPadding: "12px 16px",
        withDescriptionPadding: "14px 16px",
        borderRadiusLG: 14,
      },
      Progress: {
        defaultColor: c.honey,
        remainingColor: c["line-soft"],
        lineBorderRadius: 999,
      },
      Checkbox: {
        controlInteractiveSize: 20,
        borderRadiusSM: 6,
        colorPrimary: c.berry,
      },
      Switch: {
        trackHeight: 24,
        trackMinWidth: 46,
        handleSize: 20,
        colorPrimary: c.leaf,
      },
      Slider: {
        railSize: 6,
        handleSize: 18,
        handleSizeHover: 20,
        trackBg: c.berry,
        trackHoverBg: c["berry-deep"],
        railBg: c["line-soft"],
        railHoverBg: c["paper-deep"],
        handleColor: c.berry,
        handleActiveColor: c["berry-deep"],
        dotBorderColor: c["line-soft"],
      },
      Message: {
        contentPadding: "10px 16px",
        contentBg: c.card,
      },
      Popconfirm: {
        fontSize: 13,
      },
      Tooltip: {
        colorBgSpotlight: ink,
        borderRadius: 10,
      },
      Modal: {
        borderRadiusLG: 20,
      },
    },
  };
}

function hexToRgb(hex: string): string {
  const value = hex.replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : value;
  const int = parseInt(full.slice(0, 6), 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `${r}, ${g}, ${b}`;
}

/** 兼容旧调用点：默认主题的调色板。 */
export const palette = {
  paper: LANTERN_CSS.paper,
  paperDeep: LANTERN_CSS["paper-deep"],
  card: LANTERN_CSS.card,
  ink: LANTERN_CSS.ink,
  inkSoft: LANTERN_CSS["ink-soft"],
  muted: LANTERN_CSS.muted,
  fur: LANTERN_CSS.fur,
  furLight: LANTERN_CSS["fur-light"],
  honey: LANTERN_CSS.honey,
  berry: LANTERN_CSS.berry,
  berryDeep: LANTERN_CSS["berry-deep"],
  leaf: LANTERN_CSS.leaf,
  sky: LANTERN_CSS.sky,
} as const;

export const fonts = {
  display: DISPLAY_FONT,
  body: BODY_FONT,
  mono: MONO_FONT,
};