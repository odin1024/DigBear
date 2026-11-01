import { useEffect, useState } from "react";

interface SmartImageProps {
  /**
   * 可选的高清图。给了才去探测；没给就直接用 fallback。
   *
   * 之前四处引用都指向仓库里并不存在的 `assets/generated/*.png`，
   * 每个页面都会白白发出 4 个 404 请求 —— 现在改为按需启用。
   */
  primary?: string;
  /** 已提交的兜底图，保证站点永远有图。 */
  fallback: string;
  alt: string;
  className?: string;
}

export function SmartImage({ primary, fallback, alt, className }: SmartImageProps) {
  const [src, setSrc] = useState(fallback);

  useEffect(() => {
    setSrc(fallback);
    if (!primary || primary === fallback) return undefined;

    let alive = true;
    const probe = new Image();
    probe.onload = () => {
      if (alive) setSrc(primary);
    };
    probe.src = primary;
    return () => {
      alive = false;
    };
  }, [primary, fallback]);

  return <img className={className} src={src} alt={alt} decoding="async" />;
}
