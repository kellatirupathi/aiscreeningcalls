import type { PropsWithChildren } from "react";
import { Card } from "./Card";

interface EmptyStateProps {
  title: string;
  description: string;
  compact?: boolean;
}

export function EmptyState({ title, description, compact, children }: PropsWithChildren<EmptyStateProps>) {
  return (
    <Card className={`empty-state ${compact ? "empty-state--compact" : ""}`}>
      <div className="empty-state__title">{title}</div>
      <p>{description}</p>
      {children}
    </Card>
  );
}
