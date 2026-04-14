import { useMemo } from "react";
import { NavLink, useParams } from "react-router-dom";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { useBatch } from "@/hooks/useBatches";

interface BatchDetailPageProps {
  tab: "overview" | "items";
}

export default function BatchDetailPage({ tab }: BatchDetailPageProps) {
  const { batchId } = useParams();
  const { data: batch, isLoading } = useBatch(batchId);

  const subtitle = useMemo(() => {
    if (!batch) {
      return "Loading batch details";
    }

    return `${batch.agentName} | ${batch.telephonyProvider}`;
  }, [batch]);

  if (isLoading) {
    return (
      <div className="page-stack">
        <PageHeader title="Batch" subtitle="Loading batch details" />
        <Card className="form-card">Loading batch...</Card>
      </div>
    );
  }

  if (!batch) {
    return (
      <div className="page-stack">
        <PageHeader title="Batch" subtitle="Batch details" />
        <EmptyState title="Batch not found" description="This batch record is not available in the database." />
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageHeader title={batch.name} subtitle={subtitle} />
      <div className="subnav-tabs">
        <NavLink to={`/batches/${batch.id}/overview`} className={({ isActive }) => (isActive ? "subnav-tabs__item subnav-tabs__item--active" : "subnav-tabs__item")}>
          Overview
        </NavLink>
        <NavLink to={`/batches/${batch.id}/items`} className={({ isActive }) => (isActive ? "subnav-tabs__item subnav-tabs__item--active" : "subnav-tabs__item")}>
          Items
        </NavLink>
      </div>

      {tab === "overview" ? (
        <Card className="form-card">
          <div className="stats-inline">
            <span>Total {batch.totalItems}</span>
            <span>Processed {batch.processedItems}</span>
            <span>Success {batch.successCount}</span>
            <span>Failed {batch.failedCount}</span>
          </div>
        </Card>
      ) : null}

      {tab === "items" ? (
        <Card className="form-card">
          <EmptyState compact title="No batch items yet" description="Batch item tracking will appear here once a real batch run starts processing records." />
        </Card>
      ) : null}
    </div>
  );
}
