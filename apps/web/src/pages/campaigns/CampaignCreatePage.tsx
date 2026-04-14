import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { useAgents } from "@/hooks/useAgents";
import { useNumbers } from "@/hooks/useNumbers";
import { useCreateCampaign } from "@/hooks/useCampaigns";

export default function CampaignCreatePage() {
  const navigate = useNavigate();
  const { data: agents = [] } = useAgents();
  const { data: numbers = [] } = useNumbers();
  const createCampaign = useCreateCampaign();

  const [name, setName] = useState("");
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
  const [telephonyProvider, setTelephonyProvider] = useState("plivo");
  const [fromNumberPhone, setFromNumberPhone] = useState(numbers[0]?.phoneNumber ?? "");

  // Update defaults when data loads
  if (!agentId && agents.length) setAgentId(agents[0].id);
  if (!fromNumberPhone && numbers.length) setFromNumberPhone(numbers[0].phoneNumber);

  const canSubmit = name.trim() && agentId && telephonyProvider && fromNumberPhone;

  function handleSubmit(status: "draft" | "active") {
    if (!canSubmit) {
      window.alert("Please fill in all required fields.");
      return;
    }

    createCampaign.mutate(
      {
        name: name.trim(),
        agentId,
        telephonyProvider,
        fromNumber: fromNumberPhone
      },
      {
        onSuccess: (campaign) => {
          navigate(`/campaigns/${campaign.id}/overview`);
        },
        onError: () => {
          window.alert("Failed to create campaign.");
        }
      }
    );
  }

  return (
    <div className="page-stack">
      <PageHeader title="Create Campaign" subtitle="Configure a reusable outreach workflow" />
      <Card className="form-card">
        {!agents.length || !numbers.length ? (
          <EmptyState
            compact
            title="Setup required"
            description="You need at least one real agent and one real phone number before creating a campaign."
          />
        ) : null}
        <div className="form-grid form-grid--2">
          <label className="field">
            <span>Campaign Name</span>
            <Input placeholder="Campaign name" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span>Select Agent</span>
            <Select value={agentId} onChange={(e) => setAgentId(e.target.value)}>
              {!agents.length ? <option>No agents available</option> : null}
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="field">
            <span>Telephony Provider</span>
            <Select value={telephonyProvider} onChange={(e) => setTelephonyProvider(e.target.value)}>
              <option value="plivo">Plivo</option>
              <option value="exotel">Exotel</option>
            </Select>
          </label>
          <label className="field">
            <span>From Number</span>
            <Select value={fromNumberPhone} onChange={(e) => setFromNumberPhone(e.target.value)}>
              {!numbers.length ? <option>No numbers available</option> : null}
              {numbers.map((number) => (
                <option key={number.id} value={number.phoneNumber}>
                  {number.phoneNumber}
                </option>
              ))}
            </Select>
          </label>
        </div>
        <div className="actions-inline actions-inline--end">
          <Button onClick={() => handleSubmit("draft")} disabled={createCampaign.isPending || !canSubmit}>
            Create Draft
          </Button>
          <Button variant="primary" onClick={() => handleSubmit("active")} disabled={createCampaign.isPending || !canSubmit}>
            {createCampaign.isPending ? "Creating..." : "Save Campaign"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
