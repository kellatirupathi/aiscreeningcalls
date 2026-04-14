import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { SectionCard } from "@/components/agent-builder/SectionCard";
import type { AgentRecord } from "@/types";

interface AgentTabViewProps {
  agent: AgentRecord;
  onAgentChange: (changes: Partial<AgentRecord>) => void;
  onAiEdit: () => void;
}

export default function AgentTabView({ agent, onAgentChange, onAiEdit }: AgentTabViewProps) {
  return (
    <div className="tab-stack">
      <SectionCard title="Agent Welcome Message" description="You can define variables using {variable_name}.">
        <Textarea
          id="agent-welcome-message"
          value={agent.welcomeMessage}
          rows={3}
          onChange={(event) => onAgentChange({ welcomeMessage: event.target.value })}
        />
      </SectionCard>

      <SectionCard title="Agent Prompt" action={<Button onClick={onAiEdit}>AI Edit</Button>}>
        <Textarea
          id="agent-prompt-field"
          value={agent.prompt}
          rows={16}
          onChange={(event) => onAgentChange({ prompt: event.target.value })}
        />
      </SectionCard>
    </div>
  );
}
