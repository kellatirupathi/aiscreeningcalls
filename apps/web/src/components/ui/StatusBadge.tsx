import clsx from "clsx";

interface StatusBadgeProps {
  children: string;
  tone?: "success" | "warning" | "danger" | "neutral" | "info";
}

export function StatusBadge({ children, tone = "neutral" }: StatusBadgeProps) {
  return (
    <span className={clsx("status-badge", `status-badge--${tone}`)}>
      <span className="status-badge__dot" />
      {children}
    </span>
  );
}
