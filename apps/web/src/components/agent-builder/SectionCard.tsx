import type { PropsWithChildren, ReactNode } from "react";
import { Card } from "@/components/ui/Card";

interface SectionCardProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function SectionCard({ title, description, action, children }: PropsWithChildren<SectionCardProps>) {
  return (
    <Card className="section-card">
      <div className="section-card__header">
        <div>
          <h3>{title}</h3>
          {description ? <p>{description}</p> : null}
        </div>
        {action ? <div className="section-card__action">{action}</div> : null}
      </div>
      {children}
    </Card>
  );
}
