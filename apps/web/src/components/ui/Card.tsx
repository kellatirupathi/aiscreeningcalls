import type { HTMLAttributes, PropsWithChildren } from "react";
import clsx from "clsx";

export function Card({ children, className, ...props }: PropsWithChildren<HTMLAttributes<HTMLDivElement>>) {
  return (
    <div className={clsx("app-card", className)} {...props}>
      {children}
    </div>
  );
}
