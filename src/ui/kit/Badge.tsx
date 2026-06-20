import type { ReactNode } from "react";

type Tone = "neutral" | "brand" | "offense" | "survival" | "utility" | "accent";

/** 작은 라벨 배지 — currentColor 보더 + 톤별 색. */
export function Badge({
  tone = "neutral",
  className = "",
  title,
  children,
}: {
  tone?: Tone;
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <span className={`badge badge-${tone} ${className}`.trim()} title={title}>
      {children}
    </span>
  );
}
