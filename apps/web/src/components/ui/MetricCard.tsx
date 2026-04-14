import type { MetricStat } from "@/types";
import { Card } from "./Card";

export function MetricCard({ label, value, change }: MetricStat) {
  return (
    <Card className="metric-card">
      <div className="metric-card__label">{label}</div>
      <div className="metric-card__value">{value}</div>
      <div className="metric-card__change">{change}</div>
    </Card>
  );
}
