import type { ButtonHTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
};

const variants = {
  primary:
    "bg-action text-action-ink disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-muted",
  secondary:
    "border border-line bg-surface text-ink disabled:cursor-not-allowed disabled:bg-surface disabled:text-ink-muted",
} as const;

export function Button({ variant = "primary", className, type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={["rounded-lg px-3 py-2 text-sm font-medium", variants[variant], className].filter(Boolean).join(" ")}
      {...props}
    />
  );
}
