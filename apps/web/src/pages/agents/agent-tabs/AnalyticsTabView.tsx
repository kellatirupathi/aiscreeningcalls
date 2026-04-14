import { Toggle } from "@/components/ui/Toggle";
import { Textarea } from "@/components/ui/Textarea";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { SectionCard } from "@/components/agent-builder/SectionCard";
import type { AgentRecord } from "@/types";

interface AnalyticsTabViewProps {
  agent: AgentRecord;
  onAgentChange: (changes: Partial<AgentRecord>) => void;
}

export default function AnalyticsTabView({ agent, onAgentChange }: AnalyticsTabViewProps) {
  return (
    <div className="tab-stack">
      <SectionCard title="Post Call Tasks">
        <label className="field">
          <span>Push all execution data to webhook</span>
          <Input
            value={agent.analyticsWebhookUrl}
            placeholder="Your webhook URL"
            onChange={(event) => onAgentChange({ analyticsWebhookUrl: event.target.value })}
          />
        </label>
        <div className="inline-control">
          <span>Summarization</span>
          <Toggle
            checked={agent.summarizationEnabled}
            onChange={(checked) => onAgentChange({ summarizationEnabled: checked })}
            ariaLabel="Enable summarization"
          />
        </div>
      </SectionCard>

      <SectionCard title="Extractions">
        <div className="inline-control">
          <span>Extraction</span>
          <Toggle
            checked={agent.extractionEnabled}
            onChange={(checked) => onAgentChange({ extractionEnabled: checked })}
            ariaLabel="Enable extraction"
          />
        </div>
        <Textarea
          value={agent.extractionPrompt}
          rows={6}
          onChange={(event) => onAgentChange({ extractionPrompt: event.target.value })}
        />
      </SectionCard>

      <SectionCard title="Custom Analytics">
        <Button
          onClick={() =>
            onAgentChange({
              extractionEnabled: true,
              extractionPrompt: agent.extractionPrompt || "Capture the candidate's most relevant technical strengths and risk areas."
            })
          }
        >
          Extract custom analytics
        </Button>
      </SectionCard>
    </div>
  );
}
