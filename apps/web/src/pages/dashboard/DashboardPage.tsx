import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { MetricCard } from "@/components/ui/MetricCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useDashboard } from "@/hooks/useDashboard";

export default function DashboardPage() {
  const { data, isLoading } = useDashboard();

  return (
    <div className="page-stack">
      <PageHeader title="Dashboard" subtitle="Overview of your voice screening activity" />

      {isLoading ? <Card className="form-card">Loading dashboard...</Card> : null}

      <div className="metrics-grid">
        {(data?.stats ?? []).map((stat) => (
          <MetricCard key={stat.label} {...stat} />
        ))}
      </div>

      <div className="two-column-grid">
        <Card>
          <div className="section-title">Call Volume</div>
          {data?.callVolume?.length ? (
            <div className="chart-placeholder">
              <div className="chart-placeholder__bars">
                {data.callVolume.map((point) => {
                  const maxValue = Math.max(...data.callVolume.map((entry) => entry.value), 1);

                  return <span key={point.day} style={{ height: `${Math.max(12, (point.value / maxValue) * 100)}%` }} />;
                })}
              </div>
              <div className="chart-placeholder__labels">
                {data.callVolume.map((point) => (
                  <span key={point.day}>{point.day}</span>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState
              compact
              title="No call activity yet"
              description="Call volume will appear here once real calls start flowing through the platform."
            />
          )}
        </Card>

        <Card>
          <div className="section-title">Active Campaigns</div>
          {data?.activeCampaigns?.length ? (
            <div className="list-stack">
              {data.activeCampaigns.map((campaign) => (
                <div key={campaign.id} className="list-row">
                  <div>
                    <strong>{campaign.name}</strong>
                    <p>{campaign.agentName}</p>
                  </div>
                  <StatusBadge tone={campaign.status === "Running" ? "info" : "warning"}>{campaign.status}</StatusBadge>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState compact title="No campaigns yet" description="Create a campaign to see live activity here." />
          )}
        </Card>
      </div>

      <Card>
        <div className="section-title">Recent Calls</div>
        {data?.recentCalls?.length ? (
          <div className="data-table">
            <div className="data-table__head">
              <span>Student</span>
              <span>Campaign</span>
              <span>Agent</span>
              <span>Duration</span>
              <span>Status</span>
              <span>Time</span>
            </div>
            {data.recentCalls.map((call) => (
              <div key={call.id} className="data-table__row">
                <span>{call.studentName}</span>
                <span>{call.campaignName}</span>
                <span>{call.agentName}</span>
                <span>{call.duration}</span>
                <span>
                  <StatusBadge tone={call.status === "Completed" ? "success" : call.status === "Failed" ? "danger" : "warning"}>
                    {call.status}
                  </StatusBadge>
                </span>
                <span>{call.startedAt}</span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState compact title="No call logs yet" description="Recent call data will appear here after your first screening calls." />
        )}
      </Card>
    </div>
  );
}
