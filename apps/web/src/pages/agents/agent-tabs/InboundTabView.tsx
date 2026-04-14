import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionCard } from "@/components/agent-builder/SectionCard";
import { useNumbers, useUpdateNumber } from "@/hooks/useNumbers";
import type { AgentRecord } from "@/types";

interface InboundTabViewProps {
  agent: AgentRecord;
}

export default function InboundTabView({ agent }: InboundTabViewProps) {
  const { data: numbers = [] } = useNumbers();
  const updateNumber = useUpdateNumber();

  function handleAssign(numberId: string, assignedAgentId?: string) {
    updateNumber.mutate({
      numberId,
      payload: {
        assignedAgentId: assignedAgentId === agent.id ? "" : agent.id
      }
    });
  }

  return (
    <div className="tab-stack">
      <SectionCard title="Assign a phone number for inbound calling" description={`Inbound setup for ${agent.name || "this agent"}.`}>
        {numbers.length ? (
          <div className="list-stack">
            {numbers.map((number) => (
              <div key={number.id} className="number-row">
                <div>
                  <strong>{number.phoneNumber}</strong>
                  <p>{number.label}</p>
                </div>
                <Button
                  onClick={() => handleAssign(number.id, number.assignedAgentId)}
                  disabled={updateNumber.isPending}
                >
                  {number.assignedAgentId === agent.id ? "Unassign" : "Assign"}
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState compact title="No inbound numbers yet" description="Add a real number before assigning inbound routing to this agent." />
        )}
        <Link to="/numbers" className="inline-link">
          Go to Numbers
        </Link>
      </SectionCard>
    </div>
  );
}
