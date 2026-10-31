import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { MediaResource } from "../../../shared/api";
import {
  KIND_LABELS,
  formatDimensions,
  formatDuration,
  resourceName,
  safeImageUrl,
} from "../../../shared/format";
import { CheckIcon, EyeIcon, kindIcon } from "../../../shared/components/Icons";
import { t } from "../../../shared/i18n";

export type ResourceStatus = "downloading" | "success" | "failed";

interface ResourceCardProps {
  resource: MediaResource;
  index: number;
  selected: boolean;
  status?: ResourceStatus;
  onToggle: (id: string) => void;
  onPreview: (resource: MediaResource) => void;
}

const STATUS_LABELS: Record<ResourceStatus, string> = {
  get downloading() { return t("下载中", "Downloading"); },
  get success() { return t("已收", "Saved"); },
  get failed() { return t("漏了", "Failed"); },
};

function previewUrl(resource: MediaResource): string {
  if (resource.kind === "image") return safeImageUrl(resource.url);
  if (resource.kind === "video" || resource.kind === "audio") {
    return safeImageUrl(resource.poster);
  }
  return "";
}

export function ResourceCard({
  resource,
  index,
  selected,
  status,
  onToggle,
  onPreview,
}: ResourceCardProps) {
  const reduceMotion = useReducedMotion();
  const [previewFailed, setPreviewFailed] = useState(false);
  const KindIcon = kindIcon(resource.kind);
  const preview = previewUrl(resource);
  const showPreview = Boolean(preview) && !previewFailed;
  const name = resourceName(resource);
  const dimensions = formatDimensions(resource.width, resource.height);
  const duration = formatDuration(resource.duration);

  return (
    <motion.article
      className="media-card"
      data-selected={selected || undefined}
      data-status={status}
      role="button"
      aria-label={t(`预览「${name}」（${KIND_LABELS[resource.kind]}）`, `Preview “${name}” (${KIND_LABELS[resource.kind]})`)}
      tabIndex={0}
      initial={reduceMotion ? false : { opacity: 0, y: 14, scale: 0.96, rotate: -0.8 }}
      animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
      transition={{
        type: "spring",
        stiffness: 340,
        damping: 26,
        delay: reduceMotion ? 0 : Math.min(index, 12) * 0.022,
      }}
      whileHover={reduceMotion ? undefined : { y: -4, rotate: -0.5 }}
      whileTap={{ scale: 0.985 }}
      onClick={() => onPreview(resource)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onPreview(resource);
        }
      }}
    >
      <div className="media-card__thumb">
        {showPreview ? (
          <img
            src={preview}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setPreviewFailed(true)}
          />
        ) : (
          <div className="media-card__placeholder" data-kind={resource.kind}>
            <KindIcon size={30} />
            <span>{KIND_LABELS[resource.kind]}</span>
          </div>
        )}

        <span className="media-card__kind" data-kind={resource.kind}>
          <KindIcon size={12} />
          {KIND_LABELS[resource.kind]}
        </span>

        <button
          type="button"
          className="media-card__check"
          aria-pressed={selected}
          aria-label={
            selected
              ? t(`取消选择「${name}」`, `Deselect “${name}”`)
              : t(`选择「${name}」`, `Select “${name}”`)
          }
          onClick={(event) => {
            event.stopPropagation();
            onToggle(resource.id);
          }}
        >
          {selected ? <CheckIcon size={15} /> : null}
        </button>

        <span className="media-card__preview-hint" aria-hidden="true">
          <EyeIcon size={14} />
          {t("预览", "Preview")}
        </span>

        {duration && (
          <span className="media-card__duration">
            {resource.kind === "audio" ? "♪ " : ""}
            {duration}
          </span>
        )}

        {status && (
          <motion.span
            className="media-card__status"
            data-status={status}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.6, rotate: -12 }}
            animate={{ opacity: 1, scale: 1, rotate: -6 }}
            transition={{ type: "spring", stiffness: 420, damping: 18 }}
          >
            {STATUS_LABELS[status]}
          </motion.span>
        )}
      </div>

      <div className="media-card__body">
        <p className="media-card__name" title={name}>
          {name}
        </p>
        <div className="media-card__meta">
          <span className="media-card__host">{resource.host || "—"}</span>
          {dimensions && <span className="media-card__dim">{dimensions}</span>}
        </div>
      </div>
    </motion.article>
  );
}
