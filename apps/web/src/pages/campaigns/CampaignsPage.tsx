import { Link } from "react-router-dom";
import { Plus, Users, CheckCircle, XCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useCampaigns } from "@/hooks/useCampaigns";
import { percent } from "@/lib/utils";

function statusTone(status: string): "success" | "info" | "warning" | "neutral" {
  switch (status) {
    case "Running": return "info";
    case "Completed": return "success";
    case "Paused": return "warning";
    default: return "neutral";
  }
}

export default function CampaignsPage() {
  const { data: campaigns = [], isLoading } = useCampaigns();

  const totalStudents = campaigns.reduce((s, c) => s + c.totalStudents, 0);
  const completedStudents = campaigns.reduce((s, c) => s + c.completedStudents, 0);
  const failedStudents = campaigns.reduce((s, c) => s + c.failedStudents, 0);

  return (
    <div className="page-stack">
      <div className="page-header-row page-header-row--toolbar-safe">
        <PageHeader title="Campaigns" subtitle="Manage reusable recruitment outreach campaigns" />
        <Link to="/campaigns/new">
          <Button variant="primary"><Plus size={14} /> New Campaign</Button>
        </Link>
      </div>

      <div className="ch-stats">
        <div className="ch-stat">
          <div className="ch-stat__icon ch-stat__icon--blue"><Users size={16} /></div>
          <div><div className="ch-stat__value">{campaigns.length}</div><div className="ch-stat__label">Campaigns</div></div>
        </div>
        <div className="ch-stat">
          <div className="ch-stat__icon ch-stat__icon--green"><CheckCircle size={16} /></div>
          <div><div className="ch-stat__value">{completedStudents}</div><div className="ch-stat__label">Completed Calls</div></div>
        </div>
        <div className="ch-stat">
          <div className="ch-stat__icon ch-stat__icon--red"><XCircle size={16} /></div>
          <div><div className="ch-stat__value">{failedStudents}</div><div className="ch-stat__label">Failed</div></div>
        </div>
        <div className="ch-stat">
          <div className="ch-stat__icon ch-stat__icon--amber"><Clock size={16} /></div>
          <div><div className="ch-stat__value">{totalStudents}</div><div className="ch-stat__label">Total Students</div></div>
        </div>
      </div>

      {isLoading ? <Card className="form-card">Loading campaigns...</Card> : null}
      {!isLoading && campaigns.length === 0 ? (
        <EmptyState title="No campaigns yet" description="Create a campaign to launch outreach with agents." />
      ) : null}

      <div style={{ display: "grid", gap: 12 }}>
        {campaigns.map((campaign) => {
          const progress = percent(campaign.completedStudents + campaign.failedStudents, campaign.totalStudents);
          return (
            <Card key={campaign.id} className="form-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{campaign.name}</div>
                  <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>{campaign.agentName} | {campaign.telephonyProvider} | {campaign.fromNumber}</div>
                </div>
                <StatusBadge tone={statusTone(campaign.status)}>{campaign.status}</StatusBadge>
              </div>

              <ProgressBar value={progress} />

              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                <div style={{ textAlign: "center", padding: "8px 0", borderRadius: 10, background: "var(--slate-soft)" }}>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{campaign.totalStudents}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Total</div>
                </div>
                <div style={{ textAlign: "center", padding: "8px 0", borderRadius: 10, background: "var(--green-soft)" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "var(--green)" }}>{campaign.completedStudents}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Completed</div>
                </div>
                <div style={{ textAlign: "center", padding: "8px 0", borderRadius: 10, background: "var(--red-soft)" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "var(--red)" }}>{campaign.failedStudents}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Failed</div>
                </div>
                <div style={{ textAlign: "center", padding: "8px 0", borderRadius: 10, background: "var(--amber-soft)" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "var(--amber)" }}>{campaign.pendingStudents}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Pending</div>
                </div>
              </div>

              <div className="actions-inline actions-inline--end">
                <Link to={`/campaigns/${campaign.id}/overview`}>
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
