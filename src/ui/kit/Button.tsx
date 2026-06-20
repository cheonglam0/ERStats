import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "ghost" | "danger";
type Size = "sm" | "md";

/** 공용 버튼 — variant(primary/ghost/danger) · size · 아이콘 전용 모드. */
export function Button({
  variant = "ghost",
  size = "md",
  iconOnly = false,
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  iconOnly?: boolean;
  children?: ReactNode;
}) {
  const cls = `btn btn-${variant} btn-${size}${iconOnly ? " btn-icon" : ""} ${className}`.trim();
  return (
    <button className={cls} {...rest}>
      {children}
    </button>
  );
}
