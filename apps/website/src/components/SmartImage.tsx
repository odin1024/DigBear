import { useEffect, useState } from "react";

interface SmartImageProps {
  /** Higher-quality asset the designer can drop in later. */
  primary: string;
  /** Committed fallback so the site always renders. */
  fallback: string;
  alt: string;
  className?: string;
}

export function SmartImage({ primary, fallback, alt, className }: SmartImageProps) {
  const [src, setSrc] = useState(fallback);

  useEffect(() => {
    let alive = true;
    const probe = new Image();
    probe.onload = () => {
      if (alive) setSrc(primary);
    };
    probe.src = primary;
    return () => {
      alive = false;
    };
  }, [primary]);

  return <img className={className} src={src} alt={alt} decoding="async" />;
}
