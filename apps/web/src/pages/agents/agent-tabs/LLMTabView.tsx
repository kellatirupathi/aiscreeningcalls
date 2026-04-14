import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Slider } from "@/components/ui/Slider";
import { SectionCard } from "@/components/agent-builder/SectionCard";
import { useAiCredentials } from "@/hooks/useAiCredentials";
import type { AgentRecord } from "@/types";

interface LLMTabViewProps {
  agent: AgentRecord;
  onAgentChange: (changes: Partial<AgentRecord>) => void;
}

const llmProviders = ["OpenAI"];
const llmModels = ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1", "gpt-4.1-nano", "o4-mini"];

export default function LLMTabView({ agent, onAgentChange }: LLMTabViewProps) {
  const { data: credentials = [] } = useAiCredentials("openai");

  return (
    <div className="tab-stack">
      <SectionCard title="Choose LLM model">
        <div className="form-grid form-grid--2">
          <label className="field">
            <span>Provider</span>
            <Select value={agent.llmProvider} onChange={(event) => onAgentChange({ llmProvider: event.target.value })}>
              {llmProviders.map((provider) => (
                <option key={provider} value={provider}>
                  {provider}
                </option>
              ))}
            </Select>
          </label>
          <label className="field">
            <span>Model</span>
            <Select value={agent.llmModel} onChange={(event) => onAgentChange({ llmModel: event.target.value })}>
              {llmModels.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </Select>
          </label>
        </div>
        <label className="field" style={{ marginTop: 12 }}>
          <span>API Credential</span>
          <Select
            value={agent.llmCredentialId || ""}
            onChange={(event) => onAgentChange({ llmCredentialId: event.target.value })}
          >
            <option value="">Use default / env fallback</option>
            {credentials.map((cred) => (
              <option key={cred.id} value={cred.id}>
                {cred.name} {cred.isDefault ? "(default)" : ""}
              </option>
            ))}
          </Select>
          {credentials.length === 0 && (
            <small style={{ color: "#94a3b8" }}>
              No OpenAI credentials added yet. Add them in Settings → AI Services.
            </small>
          )}
        </label>
      </SectionCard>

      <SectionCard title="Model Parameters">
        <div className="form-grid form-grid--2">
          <div className="field">
            <span>Tokens generated on each LLM output</span>
            <div className="slider-row">
              <Slider
                value={agent.llmTokens}
                min={64}
                max={2000}
                step={1}
                onChange={(value) => onAgentChange({ llmTokens: value })}
                ariaLabel="LLM max tokens"
              />
              <Input value={agent.llmTokens} onChange={(event) => onAgentChange({ llmTokens: Number(event.target.value) || 0 })} />
            </div>
          </div>
          <div className="field">
            <span>Temperature</span>
            <div className="slider-row">
              <Slider
                value={agent.llmTemperature}
                min={0}
                max={1}
                step={0.05}
                onChange={(value) => onAgentChange({ llmTemperature: Number(value.toFixed(2)) })}
                ariaLabel="LLM temperature"
              />
              <Input
                value={agent.llmTemperature}
                onChange={(event) =>
                  onAgentChange({
                    llmTemperature: Number.parseFloat(event.target.value || "0")
                  })
                }
              />
            </div>
          </div>
        </div>
        <label className="field">
          <span>Add knowledge base (Multi-select)</span>
          <Select disabled>
            <option>Knowledge base linking is not configured yet</option>
          </Select>
        </label>
      </SectionCard>
    </div>
  );
}
