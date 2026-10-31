import type { ThemeConfig } from "antd";

const DISPLAY_FONT =
  '"Hannotate SC", "HanziPen SC", "Yuanti SC", "PingFang SC", "Hiragino Sans GB", sans-serif';
const BODY_FONT =
  '"Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const MONO_FONT =
  '"SF Mono", "JetBrains Mono", "Cascadia Mono", Menlo, Consolas, monospace';

/** Design tokens — keep in sync with docs/design.md §4 and src/styles.css. */
export const palette = {
  paper: "#FFF7E8",
  paperDeep: "#FBE8C8",
  card: "#FFFCF3",
  ink: "#33261D",
  inkSoft: "#5E4936",
  muted: "#8E7A63",
  fur: "#B97B43",
  furLight: "#F0D3A7",
  honey: "#F9C74F",
  berry: "#E2553C",
  berryDeep: "#B93A24",
  leaf: "#5E9C68",
  sky: "#7FB6C9",
} as const;

export const theme: ThemeConfig = {
  token: {
    colorPrimary: palette.berry,
    colorPrimaryHover: "#ED6A51",
    colorPrimaryActive: palette.berryDeep,
    colorError: palette.berry,
    colorSuccess: palette.leaf,
    colorWarning: "#C98A2E",
    colorInfo: palette.sky,
    colorBgBase: palette.paper,
    colorBgContainer: palette.card,
    colorBgElevated: palette.card,
    colorBgLayout: palette.paper,
    colorText: palette.ink,
    colorTextSecondary: palette.inkSoft,
    colorTextTertiary: palette.muted,
    colorTextQuaternary: "#B8A48B",
    colorBorder: palette.ink,
    colorBorderSecondary: "#E8D3B4",
    borderRadius: 14,
    borderRadiusSM: 10,
    borderRadiusLG: 20,
    controlHeight: 44,
    controlHeightLG: 50,
    fontSize: 14,
    fontFamily: BODY_FONT,
    fontFamilyCode: MONO_FONT,
    boxShadow: "4px 4px 0 rgba(51, 38, 29, 0.16)",
    boxShadowSecondary: "6px 6px 0 rgba(51, 38, 29, 0.12)",
    motionDurationMid: "0.2s",
    wireframe: false,
  },
  components: {
    Button: {
      fontWeight: 700,
      primaryShadow: "4px 4px 0 #33261D",
      defaultShadow: "none",
      dangerShadow: "none",
      paddingInlineLG: 26,
      contentFontSizeLG: 15,
      borderRadiusLG: 14,
      controlHeightLG: 50,
    },
    Input: {
      activeShadow: "0 0 0 3px rgba(226, 85, 60, 0.18)",
      hoverBorderColor: palette.berry,
      activeBorderColor: palette.berry,
      paddingBlock: 13,
      paddingInline: 16,
      borderRadius: 14,
      controlHeightLG: 52,
    },
    InputNumber: {
      activeShadow: "0 0 0 3px rgba(226, 85, 60, 0.18)",
      hoverBorderColor: palette.berry,
      activeBorderColor: palette.berry,
      borderRadius: 12,
    },
    Alert: {
      defaultPadding: "12px 16px",
      withDescriptionPadding: "14px 16px",
      borderRadiusLG: 14,
    },
    Progress: {
      defaultColor: palette.honey,
      remainingColor: "#F2E1C4",
      lineBorderRadius: 999,
    },
    Checkbox: {
      controlInteractiveSize: 20,
      borderRadiusSM: 6,
      colorPrimary: palette.berry,
    },
    Switch: {
      trackHeight: 24,
      trackMinWidth: 46,
      handleSize: 20,
      colorPrimary: palette.leaf,
    },
    Slider: {
      railSize: 6,
      handleSize: 18,
      handleSizeHover: 20,
      trackBg: palette.berry,
      trackHoverBg: palette.berryDeep,
      railBg: "#F2E1C4",
      railHoverBg: "#EBD5B1",
      handleColor: palette.berry,
      handleActiveColor: palette.berryDeep,
      dotBorderColor: "#E8D3B4",
    },
    Message: {
      contentPadding: "10px 16px",
      contentBg: palette.card,
    },
    Popconfirm: {
      fontSize: 13,
    },
    Tooltip: {
      colorBgSpotlight: palette.ink,
      borderRadius: 10,
    },
    Modal: {
      borderRadiusLG: 20,
    },
  },
};

export const fonts = {
  display: DISPLAY_FONT,
  body: BODY_FONT,
  mono: MONO_FONT,
};
