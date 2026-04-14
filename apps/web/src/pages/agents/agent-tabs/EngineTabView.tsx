import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Slider } from "@/components/ui/Slider";
import { Toggle } from "@/components/ui/Toggle";
import { Textarea } from "@/components/ui/Textarea";
import { SectionCard } from "@/components/agent-builder/SectionCard";
import { useAiCredentials } from "@/hooks/useAiCredentials";
import type { AgentRecord } from "@/types";

interface EngineTabViewProps {
  agent: AgentRecord;
  onAgentChange: (changes: Partial<AgentRecord>) => void;
}

const responseRates = ["Rapid", "Balanced", "Smooth"];

const geminiModels = [
  "gemini-2.5-flash-native-audio-latest",
  "gemini-3.1-flash-live-preview"
];

const geminiVoices = [
  "Kore", "Charon", "Fenrir", "Aoede", "Puck", "Leda", "Orus", "Zephyr"
];

export default function EngineTabView({ agent, onAgentChange }: EngineTabViewProps) {
  const isGemini = agent.conversationEngine === "gemini-live";
  const { data: geminiCredentials = [] } = useAiCredentials("gemini");

  // If the stored model isn't in the list (e.g. renamed), auto-correct to the first valid one
  const effectiveGeminiModel = geminiModels.includes(agent.geminiModel) ? agent.geminiModel : geminiModels[0];
  if (isGemini && effectiveGeminiModel !== agent.geminiModel) {
    // Schedule a state update for next tick so we don't mutate during render
    setTimeout(() => onAgentChange({ geminiModel: effectiveGeminiModel }), 0);
  }

  return (
    <div className="tab-stack">
      <SectionCard
        title="Conversation Engine"
        description="Choose how the AI processes voice conversations. Pipeline uses separate STT + LLM + TTS. Gemini Live uses a single speech-to-speech model for lower latency."
      >
        <div className="form-grid form-grid--2">
          <label className="field">
            <span>Engine</span>
            <Select
              value={agent.conversationEngine}
              onChange={(event) => onAgentChange({ conversationEngine: event.target.value as "pipeline" | "gemini-live" })}
            >
              <option value="pipeline">Pipeline (STT + LLM + TTS)</option>
              <option value="gemini-live">Gemini Live (Speech-to-Speech)</option>
            </Select>
          </label>
        </div>

        {isGemini && (
          <>
            <div className="form-grid form-grid--2" style={{ marginTop: 12 }}>
              <label className="field">
                <span>Model</span>
                <Select
                  value={effectiveGeminiModel}
                  onChange={(event) => onAgentChange({ geminiModel: event.target.value })}
                >
                  {geminiModels.map((model) => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </Select>
              </label>
              <label className="field">
                <span>Voice</span>
                <Select
                  value={agent.geminiVoice}
                  onChange={(event) => onAgentChange({ geminiVoice: event.target.value })}
                >
                  {geminiVoices.map((voice) => (
                    <option key={voice} value={voice}>{voice}</option>
                  ))}
                </Select>
              </label>
            </div>
            <label className="field" style={{ marginTop: 12 }}>
              <span>API Credential</span>
              <Select
                value={agent.geminiCredentialId || ""}
                onChange={(event) => onAgentChange({ geminiCredentialId: event.target.value })}
              >
                <option value="">Use default / env fallback</option>
                {geminiCredentials.map((cred) => (
                  <option key={cred.id} value={cred.id}>
                    {cred.name} {cred.isDefault ? "(default)" : ""}
                  </option>
                ))}
              </Select>
              {geminiCredentials.length === 0 && (
                <small style={{ color: "#94a3b8" }}>
                  No Gemini credentials added yet. Add them in Settings → AI Services.
                </small>
              )}
            </label>
          </>
        )}

        {isGemini && (
          <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 8, background: "var(--blue-soft)", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
            Gemini Live handles STT, LLM, and TTS in a single model. The Audio and LLM tabs are not used when this engine is selected. The Agent Prompt tab still controls the system instructions.
          </div>
        )}
      </SectionCard>

      {!isGemini && (<>
      <SectionCard title="Transcription & Interruptions">
        <div className="inline-control">
          <span>Generate precise transcript</span>
          <Toggle
            checked={agent.preciseTranscript}
            onChange={(checked) => onAgentChange({ preciseTranscript: checked })}
            ariaLabel="Generate precise transcript"
          />
        </div>
        <div className="field">
          <span>Number of words to wait for before interrupting</span>
          <div className="slider-row">
            <Slider
              value={agent.interruptAfterWords}
              min={0}
              max={10}
              step={1}
              onChange={(value) => onAgentChange({ interruptAfterWords: value })}
              ariaLabel="Interrupt after words"
            />
            <Input
              value={agent.interruptAfterWords}
              onChange={(event) => onAgentChange({ interruptAfterWords: Number(event.target.value) || 0 })}
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Response Latency">
        <div className="form-grid form-grid--3">
          <label className="field">
            <span>Response Rate</span>
            <Select value={agent.responseRate} onChange={(event) => onAgentChange({ responseRate: event.target.value })}>
              {responseRates.map((responseRate) => (
                <option key={responseRate} value={responseRate}>
                  {responseRate}
                </option>
              ))}
            </Select>
          </label>
          <div className="field">
            <span>Endpointing (in ms)</span>
            <div className="slider-row">
              <Slider
                value={agent.endpointingMs}
                min={0}
                max={1000}
                step={10}
                onChange={(value) => onAgentChange({ endpointingMs: value })}
                ariaLabel="Endpointing milliseconds"
              />
              <Input value={agent.endpointingMs} onChange={(event) => onAgentChange({ endpointingMs: Number(event.target.value) || 0 })} />
            </div>
          </div>
          <div className="field">
            <span>Linear delay (in ms)</span>
            <div className="slider-row">
              <Slider
                value={agent.linearDelayMs}
                min={0}
                max={1000}
                step={10}
                onChange={(value) => onAgentChange({ linearDelayMs: value })}
                ariaLabel="Linear delay milliseconds"
              />
              <Input value={agent.linearDelayMs} onChange={(event) => onAgentChange({ linearDelayMs: Number(event.target.value) || 0 })} />
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="User Online Detection">
        <div className="inline-control">
          <span>Enabled</span>
          <Toggle
            checked={agent.userOnlineDetection}
            onChange={(checked) => onAgentChange({ userOnlineDetection: checked })}
            ariaLabel="User online detection"
          />
        </div>
        <div className="form-grid form-grid--2">
          <label className="field">
            <span>Follow-up prompt</span>
            <Textarea
              value={agent.userOnlinePrompt}
              rows={3}
              onChange={(event) => onAgentChange({ userOnlinePrompt: event.target.value })}
            />
          </label>
          <div className="field">
            <span>Invoke after (seconds)</span>
            <div className="slider-row">
              <Slider
                value={agent.invokeAfterSeconds}
                min={0}
                max={30}
                step={1}
                onChange={(value) => onAgentChange({ invokeAfterSeconds: value })}
                ariaLabel="Invoke follow-up after seconds"
              />
              <Input
                value={agent.invokeAfterSeconds}
                onChange={(event) => onAgentChange({ invokeAfterSeconds: Number(event.target.value) || 0 })}
              />
            </div>
          </div>
        </div>
      </SectionCard>
      </>)}
    </div>
  );
}
