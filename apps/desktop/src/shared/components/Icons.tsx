import type { SVGProps } from "react";
import type { MediaKind } from "../api";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

const strokeBase = ({ size = 16, ...props }: IconProps) => ({
  width: size,
  height: size,
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
  ...props,
});

export function PawIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <circle cx="5.6" cy="7.1" r="1.7" />
      <circle cx="9.9" cy="5.2" r="1.8" />
      <circle cx="14.3" cy="7" r="1.7" />
      <circle cx="16.7" cy="10.4" r="1.4" />
      <path d="M10 9.1c-2.9 0-5.4 2.2-5.4 4.7 0 1.9 1.5 3.3 3.4 3.3 1 0 1.5-.4 2-.9.5.5 1 .9 2 .9 1.9 0 3.4-1.4 3.4-3.3 0-2.5-2.5-4.7-5.4-4.7Z" />
    </svg>
  );
}

export function ImageIcon(props: IconProps) {
  return (
    <svg {...strokeBase(props)}>
      <rect x="2.8" y="3.5" width="14.4" height="13" rx="1.2" />
      <circle cx="7.2" cy="8" r="1.5" />
      <path d="m3.5 14.2 4.1-4.1 3 3 2.3-2.3 3.1 3.1" />
    </svg>
  );
}

export function VideoIcon(props: IconProps) {
  return (
    <svg {...strokeBase(props)}>
      <rect x="2.4" y="5" width="10.8" height="10" rx="1.2" />
      <path d="m13.2 8.4 4.2-2.1v7.4l-4.2-2.1z" />
    </svg>
  );
}

export function AudioIcon(props: IconProps) {
  return (
    <svg {...strokeBase(props)}>
      <path d="M7.5 13.8V5.2l8-1.6v8.6" />
      <circle cx="5.1" cy="14.4" r="2.4" />
      <circle cx="13.1" cy="12.8" r="2.4" />
    </svg>
  );
}

export function FontIcon(props: IconProps) {
  return (
    <svg {...strokeBase(props)}>
      <path d="M4 16 9.2 4h1.6L16 16M6.2 11.6h7.6" />
    </svg>
  );
}

export function FileIcon(props: IconProps) {
  return (
    <svg {...strokeBase(props)}>
      <path d="M5 2.8h6l4 4v10.4H5z" />
      <path d="M11 2.8v4.2h4" />
    </svg>
  );
}

export function kindIcon(kind: MediaKind) {
  switch (kind) {
    case "image":
      return ImageIcon;
    case "video":
      return VideoIcon;
    case "audio":
      return AudioIcon;
    case "font":
      return FontIcon;
    default:
      return FileIcon;
  }
}

export function FolderIcon(props: IconProps) {
  return (
    <svg {...strokeBase(props)}>
      <path d="M2.8 6.2h5l1.6 2H17.2v7.4H2.8z" />
    </svg>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <svg {...strokeBase(props)}>
      <path d="M10 3v9m0 0 4-4m-4 4L6 8M4 16h12" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...strokeBase(props)}>
      <path d="m3.5 10.5 4 4 9-10" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...strokeBase(props)}>
      <path d="m5 5 10 10M15 5 5 15" />
    </svg>
  );
}

export function ExternalIcon(props: IconProps) {
  return (
    <svg {...strokeBase(props)}>
      <path d="M7 3h9v9M16 3 6 13" />
    </svg>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <svg {...strokeBase(props)}>
      <path d="M16.2 8.2A6.5 6.5 0 1 0 16 12.5M16.2 3.6v4.6h-4.6" />
    </svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <svg {...strokeBase(props)}>
      <path d="M3.5 5.5h13M8 2.8h4M5.2 5.5l.8 11h8l.8-11M8.2 8.5v5M11.8 8.5v5" />
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <svg {...strokeBase(props)}>
      <path d="M10 4v12M4 10h12" />
    </svg>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <svg {...strokeBase(props)}>
      <rect x="4.2" y="8.6" width="11.6" height="8.2" rx="1" />
      <path d="M6.8 8.6V6.2a3.2 3.2 0 0 1 6.4 0v2.4" />
    </svg>
  );
}

export function LinkIcon(props: IconProps) {
  return (
    <svg {...strokeBase(props)}>
      <path d="M8.5 11.5 11.5 8.5M7.2 12.8l-1 1a3.2 3.2 0 0 1-4.5-4.5l2.6-2.6a3.2 3.2 0 0 1 4.5 0M12.8 7.2l1-1a3.2 3.2 0 0 1 4.5 4.5l-2.6 2.6a3.2 3.2 0 0 1-4.5 0" />
    </svg>
  );
}

export function GlobeIcon(props: IconProps) {
  return (
    <svg {...strokeBase(props)}>
      <circle cx="10" cy="10" r="7.2" />
      <path d="M2.8 10h14.4M10 2.8c2 2 3 4.4 3 7.2s-1 5.2-3 7.2c-2-2-3-4.4-3-7.2s1-5.2 3-7.2Z" />
    </svg>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <svg {...strokeBase(props)}>
      <path d="M3 10h13M11 4.5 16.5 10 11 15.5" />
    </svg>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <svg {...strokeBase(props)}>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 6.2v4.6M10 13.4v.1" />
    </svg>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <svg {...strokeBase(props)}>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 9v4.5M10 6.6v.1" />
    </svg>
  );
}

export function SelectAllIcon(props: IconProps) {
  return (
    <svg {...strokeBase(props)}>
      <rect x="3" y="3" width="14" height="14" rx="1" />
      <path d="m6.2 10.2 2.6 2.6 5-5.6" />
    </svg>
  );
}

export function BagIcon(props: IconProps) {
  return (
    <svg {...strokeBase(props)}>
      <path d="M4 7.5h12l-1 9.5H5z" />
      <path d="M6.8 7.5a3.2 3.2 0 0 1 6.4 0" />
      <path d="M8.2 12.2h.1M11.7 12.2h.1" />
    </svg>
  );
}

export function SlidersIcon(props: IconProps) {
  return (
    <svg {...strokeBase(props)}>
      <path d="M3 6.5h14M3 13.5h14" />
      <circle cx="7.5" cy="6.5" r="2.2" fill="var(--card)" />
      <circle cx="12.5" cy="13.5" r="2.2" fill="var(--card)" />
    </svg>
  );
}

export function SparkIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" focusable="false" width={props.size ?? 16} height={props.size ?? 16} {...props}>
      <path d="M10 1.6 12 7l5.4 2-5.4 2-2 5.4L8 11 2.6 9 8 7z" />
    </svg>
  );
}

export function ArrowLeftIcon(props: IconProps) {
  return (
    <svg {...strokeBase(props)}>
      <path d="M17 10H4M9 4.5 3.5 10 9 15.5" />
    </svg>
  );
}

export function EyeIcon(props: IconProps) {
  return (
    <svg {...strokeBase(props)}>
      <path d="M2.4 10s2.7-5 7.6-5 7.6 5 7.6 5-2.7 5-7.6 5-7.6-5-7.6-5Z" />
      <circle cx="10" cy="10" r="2.1" />
    </svg>
  );
}

export function PlayCircleIcon(props: IconProps) {
  return (
    <svg {...strokeBase(props)}>
      <circle cx="10" cy="10" r="7.4" />
      <path d="M8.4 7.4 13 10l-4.6 2.6z" fill="currentColor" stroke="none" />
    </svg>
  );
}
