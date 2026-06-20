import type { LucideIcon } from "lucide-react";

/** lucide 아이콘 공통 래퍼 — 크기·stroke 일관 + 접근성 기본값. */
export function Icon({
  icon: I,
  size = 16,
  className,
}: {
  icon: LucideIcon;
  size?: number;
  className?: string;
}) {
  return <I size={size} strokeWidth={2} className={className} aria-hidden focusable={false} />;
}
