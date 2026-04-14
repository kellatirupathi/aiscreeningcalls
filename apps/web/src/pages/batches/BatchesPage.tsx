import { Link } from "react-router-dom";
import { Plus, Package, CheckCircle, XCircle, Loader } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useBatches } from "@/hooks/useBatches";
import { percent } from "@/lib/utils";

function statusTone(status: string): "success" | "info" | "warning" | "neutral" {
  switch (status) {
    case "Running": return "info";
    case "Completed": return "success";
    case "Paused": return "warning";
    default: return "neutral";
  }
}

export default function BatchesPage() {
  const { data: batches = [], isLoading } = useBatches();

  const totalItems = batches.reduce((s, b) => s + b.totalItems, 0);
  const successCount = batches.reduce((s, b) => s + b.successCount, 0);
  const failedCount = batches.reduce((s, b) => s + b.failedCount, 0);

  return (
    <div className="page-stack">
      <div className="page-header-row page-header-row--toolbar-safe">
        <PageHeader title="Batches" subtitle="One-off CSV-driven bulk screening batches" />
        <Link to="/batches/new">
          <Button variant="primary"><Plus size={14} /> Upload Batch</Button>
        </Link>
      </div>

      <div className="ch-stats">
        <div className="ch-stat">
          <div className="ch-stat__icon ch-stat__icon--blue"><Package size={16} /></div>
          <div><div className="ch-stat__value">{batches.length}</div><div className="ch-stat__label">Total Batches</div></div>
        </div>
        <div className="ch-stat">
          <div className="ch-stat__icon ch-stat__icon--green"><CheckCircle size={16} /></div>
          <div><div className="ch-stat__value">{successCount}</div><div className="ch-stat__label">Successful</div></div>
        </div>
        <div className="ch-stat">
          <div className="ch-stat__icon ch-stat__icon--red"><XCircle size={16} /></div>
          <div><div className="ch-stat__value">{failedCount}</div><div className="ch-stat__label">Failed</div></div>
        </div>
        <div className="ch-stat">
          <div className="ch-stat__icon ch-stat__icon--amber"><Loader size={16} /></div>
          <div><div className="ch-stat__value">{totalItems}</div><div className="ch-stat__label">Total Contacts</div></div>
        </div>
      </div>

      {isLoading ? <Card className="form-card">Loading batches...</Card> : null}
      {!isLoading && batches.length === 0 ? (
        <EmptyState title="No batches yet" description="Upload a CSV batch to start bulk screening calls." />
      ) : null}

      <div style={{ display: "grid", gap: 12 }}>
        {batches.map((batch) => {
          const progress = percent(batch.processedItems, batch.totalItems);
          return (
            <Card key={batch.id} className="form-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{batch.name}</div>
                  <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>{batch.agentName} | {batch.telephonyProvider}</div>
                </div>
                <StatusBadge tone={statusTone(batch.status)}>{batch.status}</StatusBadge>
              </div>

              <ProgressBar value={progress} />

              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                <div style={{ textAlign: "center", padding: "8px 0", borderRadius: 10, background: "var(--slate-soft)" }}>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{batch.totalItems}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Total</div>
                </div>
                <div style={{ textAlign: "center", padding: "8px 0", borderRadius: 10, background: "var(--blue-soft)" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "var(--blue)" }}>{batch.processedItems}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Processed</div>
                </div>
                <div style={{ textAlign: "center", padding: "8px 0", borderRadius: 10, background: "var(--green-soft)" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "var(--green)" }}>{batch.successCount}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Success</div>
                </div>
                <div style={{ textAlign: "center", padding: "8px 0", borderRadius: 10, background: "var(--red-soft)" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "var(--red)" }}>{batch.failedCount}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Failed</div>
                </div>
              </div>

              <div className="actions-inline actions-inline--end">
                <Link to={`/batches/${batch.id}/overview`}>
                  <Button variant="primary">View Details</Button>
                </Link>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
