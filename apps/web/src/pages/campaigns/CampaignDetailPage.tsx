import { useMemo } from "react";
import { NavLink, useParams } from "react-router-dom";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useCampaign, useCampaignCalls, useCampaignStudents } from "@/hooks/useCampaigns";

interface CampaignDetailPageProps {
  tab: "overview" | "calls" | "students";
}

export default function CampaignDetailPage({ tab }: CampaignDetailPageProps) {
  const { campaignId } = useParams();
  const { data: campaign, isLoading } = useCampaign(campaignId);
  const { data: calls = [] } = useCampaignCalls(campaignId);
  const { data: students = [] } = useCampaignStudents(campaignId);

  const subtitle = useMemo(() => {
    if (!campaign) {
      return "Loading campaign details";
    }

    return `${campaign.agentName} | ${campaign.fromNumber}`;
  }, [campaign]);

  if (isLoading) {
    return (
      <div className="page-stack">
        <PageHeader title="Campaign" subtitle="Loading campaign details" />
        <Card className="form-card">Loading campaign...</Card>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="page-stack">
        <PageHeader title="Campaign" subtitle="Campaign details" />
        <EmptyState title="Campaign not found" description="This campaign record is not available in the database." />
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageHeader title={campaign.name} subtitle={subtitle} />
      <div className="subnav-tabs">
        <NavLink to={`/campaigns/${campaign.id}/overview`} className={({ isActive }) => (isActive ? "subnav-tabs__item subnav-tabs__item--active" : "subnav-tabs__item")}>
          Overview
        </NavLink>
        <NavLink to={`/campaigns/${campaign.id}/calls`} className={({ isActive }) => (isActive ? "subnav-tabs__item subnav-tabs__item--active" : "subnav-tabs__item")}>
          Calls
        </NavLink>
        <NavLink to={`/campaigns/${campaign.id}/students`} className={({ isActive }) => (isActive ? "subnav-tabs__item subnav-tabs__item--active" : "subnav-tabs__item")}>
          Students
        </NavLink>
      </div>

      {tab === "overview" ? (
        <Card className="form-card">
          <div className="list-row">
            <div>
              <strong>Provider</strong>
              <p>{campaign.telephonyProvider}</p>
            </div>
            <StatusBadge tone={campaign.status === "Running" ? "info" : "warning"}>{campaign.status}</StatusBadge>
          </div>
          <div className="stats-inline">
            <span>Total {campaign.totalStudents}</span>
            <span>Completed {campaign.completedStudents}</span>
            <span>Failed {campaign.failedStudents}</span>
            <span>Pending {campaign.pendingStudents}</span>
          </div>
        </Card>
      ) : null}

      {tab === "calls" ? (
        <Card className="form-card">
          {calls.length ? (
            <div className="data-table">
              <div className="data-table__head">
                <span>Student</span>
                <span>Status</span>
                <span>Duration</span>
                <span>Started</span>
              </div>
              {calls.map((call) => (
                <div key={call.id} className="data-table__row">
                  <span>{call.studentName}</span>
                  <span>{call.status}</span>
                  <span>{call.duration}</span>
                  <span>{call.startedAt}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState compact title="No calls yet" description="Calls linked to this campaign will appear here." />
          )}
        </Card>
      ) : null}

      {tab === "students" ? (
        <Card className="form-card">
          {students.length ? (
            <div className="data-table">
              <div className="data-table__head">
                <span>Name</span>
                <span>Phone</span>
                <span>Status</span>
                <span>Last Call</span>
              </div>
              {students.map((student) => (
                <div key={student.id} className="data-table__row">
                  <span>{student.name}</span>
                  <span>{student.phone}</span>
                  <span>{student.status}</span>
                  <span>{student.lastCalledAt}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState compact title="No students yet" description="Upload students to this campaign to start tracking them here." />
          )}
        </Card>
      ) : null}
    </div>
  );
}
