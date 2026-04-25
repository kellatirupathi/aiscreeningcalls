import { useEffect } from "react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Slider } from "@/components/ui/Slider";
import { Toggle } from "@/components/ui/Toggle";
import { Textarea } from "@/components/ui/Textarea";
import { SectionCard } from "@/components/agent-builder/SectionCard";
import { useAiCredentials, useGeminiLiveCatalog } from "@/hooks/useAiCredentials";
import type { AgentRecord } from "@/types";

interface EngineTabViewProps {
  agent: AgentRecord;
  onAgentChange: (changes: Partial<AgentRecord>) => void;
}

const responseRates = ["Rapid", "Balanced", "Smooth"];

// Minimal fallback used ONLY when no credential is selected yet so the
// dropdowns aren't empty. The real list is fetched from the backend catalog
// endpoint using the selected credential's API key.
const GEMINI_MODELS_FALLBACK = ["gemini-2.5-flash-preview-native-audio-dialog"];
const GEMINI_VOICES_FALLBACK = ["Kore", "Puck", "Charon", "Leda", "Orus"];

export default function EngineTabView({ agent, onAgentChange }: EngineTabViewProps) {
  const isGemini = agent.conversationEngine === "gemini-live";
  const { data: geminiCredentials = [] } = useAiCredentials("gemini");

  // Pick which credential the catalog fetch uses: the agent's explicitly
  // selected credential, or fall back to the org's default Gemini credential
  // so we can still populate options before the user picks one.
  const defaultGeminiCred = geminiCredentials.find((c) => c.isDefault) ?? geminiCredentials[0];
  const catalogCredentialId = agent.geminiCredentialId || defaultGeminiCred?.id || null;

  const {
    data: catalog,
    isLoading: catalogLoading,
    isError: catalogError
  } = useGeminiLiveCatalog(isGemini ? catalogCredentialId : null);

  const dynamicModels = catalog?.models && catalog.models.length > 0
    ? catalog.models
    : GEMINI_MODELS_FALLBACK;

  // Voices depend on the selected model (2.0 Live has 8, 2.5 native audio has 30+).
  const dynamicVoices = catalog?.voicesByModel?.[agent.geminiModel]
    ?? catalog?.voicesByModel?.[dynamicModels[0]]
    ?? GEMINI_VOICES_FALLBACK;

  // Auto-correct the stored model if it's no longer in the fetched list.
  useEffect(() => {
    if (!isGemini) return;
    if (!dynamicModels.includes(agent.geminiModel)) {
      onAgentChange({ geminiModel: dynamicModels[0] });
    }
  }, [isGemini, dynamicModels, agent.geminiModel, onAgentChange]);

  // Auto-correct the stored voice if it's not valid for the current model.
  useEffect(() => {
    if (!isGemini) return;
    if (!dynamicVoices.includes(agent.geminiVoice)) {
      onAgentChange({ geminiVoice: dynamicVoices[0] });
    }
  }, [isGemini, dynamicVoices, agent.geminiVoice, onAgentChange]);

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
                <span>
                  Model
                  {catalogLoading && <small style={{ color: "#94a3b8", marginLeft: 6 }}>(loading…)</small>}
                </span>
                <Select
                  value={agent.geminiModel}
                  onChange={(event) => onAgentChange({ geminiModel: event.target.value })}
                  disabled={catalogLoading || !catalogCredentialId}
                >
                  {dynamicModels.map((model) => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </Select>
              </label>
              <label className="field">
                <span>
                  Voice
                  {catalogLoading && <small style={{ color: "#94a3b8", marginLeft: 6 }}>(loading…)</small>}
                </span>
                <Select
                  value={agent.geminiVoice}
                  onChange={(event) => onAgentChange({ geminiVoice: event.target.value })}
                  disabled={catalogLoading || !catalogCredentialId}
                >
                  {dynamicVoices.map((voice) => (
                    <option key={voice} value={voice}>{voice}</option>
                  ))}
                </Select>
              </label>
            </div>
            {catalogError && catalogCredentialId && (
              <small style={{ color: "#b45309", display: "block", marginTop: 6 }}>
                Couldn't fetch live catalog from Google — showing fallback list. Check that the API key is valid.
              </small>
            )}
            {catalog?.source === "fallback" && (
              <small style={{ color: "#b45309", display: "block", marginTop: 6 }}>
                Using fallback model list (Google API didn't respond).
              </small>
            )}
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
