import type { ButtonHTMLAttributes, PropsWithChildren } from "react";
import clsx from "clsx";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  fullWidth?: boolean;
}

export function Button({
  children,
  className,
  variant = "secondary",
  fullWidth,
  ...props
}: PropsWithChildren<ButtonProps>) {
  return (
    <button
      className={clsx("app-button", `app-button--${variant}`, fullWidth && "app-button--full", className)}
      {...props}
    >
      {children}
    </button>
  );
}
