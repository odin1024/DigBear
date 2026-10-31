import { motion } from "framer-motion";
import type { MediaKind } from "../../../shared/api";
import { KIND_LABELS, MEDIA_KINDS } from "../../../shared/format";
import { kindIcon } from "../../../shared/components/Icons";
import { t } from "../../../shared/i18n";

interface KindFilterProps {
  counts: Record<MediaKind, number>;
  active: Set<MediaKind>;
  onChange: (next: Set<MediaKind>) => void;
}

export function KindFilter({ counts, active, onChange }: KindFilterProps) {
  const total = MEDIA_KINDS.reduce((sum, kind) => sum + counts[kind], 0);
  const allActive = active.size === MEDIA_KINDS.length;

  return (
    <div className="kind-filter" role="group" aria-label={t("按资源类型筛选", "Filter by media type")}>
      <motion.button
        type="button"
        className="kind-chip"
        data-active={allActive || undefined}
        aria-pressed={allActive}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.94 }}
        onClick={() => onChange(new Set(MEDIA_KINDS))}
      >
        <span className="kind-chip__label">{t("全部", "All")}</span>
        <span className="kind-chip__count">{total}</span>
      </motion.button>
      {MEDIA_KINDS.map((kind) => {
        const Icon = kindIcon(kind);
        const isActive = !allActive && active.has(kind);
        return (
          <motion.button
            key={kind}
            type="button"
            className="kind-chip"
            data-kind={kind}
            data-active={isActive || undefined}
            aria-pressed={isActive}
            disabled={counts[kind] === 0}
            whileHover={counts[kind] === 0 ? undefined : { y: -2 }}
            whileTap={counts[kind] === 0 ? undefined : { scale: 0.94 }}
            onClick={() => {
              if (counts[kind] === 0) return;
              // From "全部", picking one kind focuses that kind only.
              if (allActive) {
                onChange(new Set([kind]));
                return;
              }
              const next = new Set(active);
              if (next.has(kind)) {
                next.delete(kind);
                if (next.size === 0) {
                  onChange(new Set(MEDIA_KINDS));
                  return;
                }
              } else {
                next.add(kind);
              }
              onChange(next);
            }}
          >
            <Icon size={15} className="kind-chip__icon" />
            <span className="kind-chip__label">{KIND_LABELS[kind]}</span>
            <span className="kind-chip__count">{counts[kind]}</span>
          </motion.button>
        );
      })}
    </div>
  );
}
