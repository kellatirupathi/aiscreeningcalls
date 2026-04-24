import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Slider } from "@/components/ui/Slider";
import { SectionCard } from "@/components/agent-builder/SectionCard";
import { useVoices } from "@/hooks/useVoices";
import { useAiCredentials, type AiProvider } from "@/hooks/useAiCredentials";
import type { AgentRecord } from "@/types";

interface AudioTabViewProps {
  agent: AgentRecord;
  onAgentChange: (changes: Partial<AgentRecord>) => void;
}

const languages = ["English", "Hindi"];

const sttProviders = ["cartesia", "deepgram"];
const sttProviderLabels: Record<string, string> = { cartesia: "Cartesia", deepgram: "Deepgram" };
const baseSttModels: Record<string, string[]> = {
  cartesia: ["ink-whisper"],
  deepgram: ["nova-3", "nova-2"]
};

const ttsProviders = ["cartesia", "elevenlabs", "sarvam"];
const ttsProviderLabels: Record<string, string> = { cartesia: "Cartesia", elevenlabs: "Elevenlabs", sarvam: "Sarvam" };
const baseTtsModels: Record<string, string[]> = {
  cartesia: ["sonic-2", "sonic-turbo"],
  elevenlabs: ["eleven_turbo_v2_5", "eleven_multilingual_v2"],
  sarvam: ["bulbul:v2", "bulbul:v3"]
};

/** Merge hardcoded defaults with models configured on credentials.
 *  Credentials saved in Settings → AI Services can specify a ttsModel / sttModel.
 *  This function collects those and deduplicates so the dropdown always shows
 *  models the user has configured, even if they're not in the hardcoded list. */
function mergeModelsFromCredentials(
  baseModels: string[],
  credentials: Array<{ ttsModel?: string; sttModel?: string }>,
  field: "ttsModel" | "sttModel"
): string[] {
  const set = new Set(baseModels);
  for (const cred of credentials) {
    const model = cred[field];
    if (model && model.trim()) {
      set.add(model.trim());
    }
  }
  return Array.from(set);
}

function defaultSttModel(provider: string) {
  return baseSttModels[provider]?.[0] ?? "";
}

function defaultTtsModel(provider: string) {
  return baseTtsModels[provider]?.[0] ?? "";
}

export default function AudioTabView({ agent, onAgentChange }: AudioTabViewProps) {
  const { data: voices = [] } = useVoices();
  const normalizedStt = agent.sttProvider.toLowerCase();
  const normalizedTts = agent.ttsProvider.toLowerCase();

  const { data: sttCredentials = [] } = useAiCredentials(normalizedStt as AiProvider);
  const { data: ttsCredentials = [] } = useAiCredentials(normalizedTts as AiProvider);

  const sttModels = mergeModelsFromCredentials(
    baseSttModels[normalizedStt] ?? baseSttModels["cartesia"],
    sttCredentials,
    "sttModel"
  );
  const ttsModels = mergeModelsFromCredentials(
    baseTtsModels[normalizedTts] ?? baseTtsModels["cartesia"],
    ttsCredentials,
    "ttsModel"
  );

  const isCartesiaTts = normalizedTts === "cartesia";

  function handleSttProviderChange(provider: string) {
    onAgentChange({ sttProvider: provider, sttModel: defaultSttModel(provider) });
  }

  function handleTtsProviderChange(provider: string) {
    // Clear voice when switching providers — voice IDs are provider-specific
    // (Cartesia UUIDs don't work on Sarvam, ElevenLabs IDs don't work on Cartesia).
    // Falls back to the credential's defaultVoiceId / env fallback at call time.
    onAgentChange({
      ttsProvider: provider,
      ttsModel: defaultTtsModel(provider),
      ttsVoiceName: ""
    });
  }

  return (
    <div className="tab-stack">
      <SectionCard title="Configure Language">
        <label className="field">
          <span>Language</span>
          <Select value={agent.language} onChange={(event) => onAgentChange({ language: event.target.value })}>
            {languages.map((language) => (
              <option key={language} value={language}>
                {language}
              </option>
            ))}
          </Select>
        </label>
      </SectionCard>

      <SectionCard title="Speech-to-Text">
        <div className="form-grid form-grid--2">
          <label className="field">
            <span>Provider</span>
            <Select value={normalizedStt} onChange={(event) => handleSttProviderChange(event.target.value)}>
              {sttProviders.map((provider) => (
                <option key={provider} value={provider}>
                  {sttProviderLabels[provider] ?? provider}
                </option>
              ))}
            </Select>
          </label>
          <label className="field">
            <span>Model</span>
            <Select value={agent.sttModel} onChange={(event) => onAgentChange({ sttModel: event.target.value })}>
              {sttModels.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </Select>
          </label>
        </div>
        <label className="field">
          <span>Keywords</span>
          <Input value={agent.keywords} onChange={(event) => onAgentChange({ keywords: event.target.value })} />
        </label>
        <label className="field" style={{ marginTop: 12 }}>
          <span>API Credential</span>
          <Select
            value={agent.sttCredentialId || ""}
            onChange={(event) => onAgentChange({ sttCredentialId: event.target.value })}
          >
            <option value="">Use default / env fallback</option>
            {sttCredentials.map((cred) => (
              <option key={cred.id} value={cred.id}>
                {cred.name} {cred.isDefault ? "(default)" : ""}
              </option>
            ))}
          </Select>
          {sttCredentials.length === 0 && (
            <small style={{ color: "#94a3b8" }}>
              No {normalizedStt} credentials added yet. Add them in Settings → AI Services.
            </small>
          )}
        </label>
      </SectionCard>

      <SectionCard title="Text-to-Speech">
        <div className="form-grid form-grid--3">
          <label className="field">
            <span>Provider</span>
            <Select value={normalizedTts} onChange={(event) => handleTtsProviderChange(event.target.value)}>
              {ttsProviders.map((provider) => (
                <option key={provider} value={provider}>
                  {ttsProviderLabels[provider] ?? provider}
                </option>
              ))}
            </Select>
          </label>
          <label className="field">
            <span>Model</span>
            <Select value={agent.ttsModel} onChange={(event) => onAgentChange({ ttsModel: event.target.value })}>
              {ttsModels.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </Select>
          </label>
          <label className="field">
            <span>Voice</span>
            {(() => {
              // Map agent.language ("English"/"Hindi") → BCP-47 short code ("en"/"hi")
              const agentLangCode = agent.language?.toLowerCase() === "hindi" ? "hi" : "en";

              // Extract Sarvam model (bulbul:v2 / bulbul:v3) from voice description.
              // Only applied when the current TTS provider is sarvam.
              const extractSarvamModel = (desc?: string | null): string | null => {
                if (!desc) return null;
                const m = desc.match(/bulbul:v(\d+)/i);
                return m ? `bulbul:v${m[1]}` : null;
              };

              // Filter by provider → language → model (Sarvam only).
              // Each filter falls back gracefully if it empties the list so the
              // dropdown never goes blank when voices exist.
              const providerVoices = voices.filter((v) => v.provider === normalizedTts);
              const langMatched = providerVoices.filter((v) => v.language === agentLangCode);
              const afterLang = langMatched.length > 0 ? langMatched : providerVoices;

              let visibleVoices = afterLang;
              if (normalizedTts === "sarvam" && agent.ttsModel) {
                const modelMatched = afterLang.filter(
                  (v) => extractSarvamModel(v.description) === agent.ttsModel
                );
                if (modelMatched.length > 0) visibleVoices = modelMatched;
              }

              return visibleVoices.length > 0 ? (
                <Select
                  value={agent.ttsVoiceName}
                  onChange={(event) => onAgentChange({ ttsVoiceName: event.target.value })}
                >
                  <option value="">Select a voice...</option>
                  {visibleVoices.map((v) => (
                    <option key={v.id} value={v.voiceId}>
                      {v.name}{v.gender ? ` (${v.gender})` : ""}{v.isDefault ? " [Default]" : ""}
                    </option>
                  ))}
                  <option value="__custom">Custom Voice ID...</option>
                </Select>
              ) : null;
            })()}
            {voices.filter((v) => v.provider === normalizedTts).length === 0 && (
              <Input
                value={agent.ttsVoiceName}
                placeholder={
                  isCartesiaTts
                    ? "Cartesia voice UUID"
                    : normalizedTts === "sarvam"
                    ? "Sarvam speaker (e.g. anushka, meera, abhilash)"
                    : "ElevenLabs voice ID"
                }
                onChange={(event) => onAgentChange({ ttsVoiceName: event.target.value })}
              />
            )}
            {agent.ttsVoiceName === "__custom" && (
              <Input
                style={{ marginTop: 6 }}
                value=""
                placeholder="Paste voice UUID here"
                onChange={(event) => onAgentChange({ ttsVoiceName: event.target.value })}
              />
            )}
          </label>
        </div>

        <div className="form-grid form-grid--2">
          <div className="field">
            <span>Buffer Size</span>
            <div className="slider-row">
              <Slider
                value={agent.ttsBufferSize}
                min={0}
                max={300}
                step={1}
                onChange={(value) => onAgentChange({ ttsBufferSize: value })}
                ariaLabel="TTS buffer size"
              />
              <Input value={agent.ttsBufferSize} onChange={(event) => onAgentChange({ ttsBufferSize: Number(event.target.value) || 0 })} />
            </div>
          </div>
          <div className="field">
            <span>Speed rate</span>
            <div className="slider-row">
              <Slider
                value={agent.ttsSpeedRate}
                min={0.5}
                max={1.5}
                step={0.05}
                onChange={(value) => onAgentChange({ ttsSpeedRate: Number(value.toFixed(2)) })}
                ariaLabel="TTS speed rate"
              />
              <Input
                value={agent.ttsSpeedRate}
                onChange={(event) =>
                  onAgentChange({
                    ttsSpeedRate: Number.parseFloat(event.target.value || "0")
                  })
                }
              />
            </div>
          </div>

          {normalizedTts === "sarvam" && (
            <label className="field" style={{ gridColumn: "span 2" }}>
              <span>Audio Quality</span>
              <Select
                value={String(agent.ttsSampleRate || 8000)}
                onChange={(event) =>
                  onAgentChange({ ttsSampleRate: Number(event.target.value) || 8000 })
                }
              >
                <option value="8000">Telephony (8 kHz) — optimized for phone calls</option>
                <option value="22050">Standard (22.05 kHz) — balanced quality</option>
                <option value="48000">High Quality (48 kHz) — bulbul:v3 only</option>
              </Select>
              <small style={{ color: "#94a3b8", fontSize: 11 }}>
                Plivo delivers at 8 kHz regardless; higher rates use Sarvam's premium model and are downsampled for delivery.
              </small>
            </label>
          )}

          <label className="field" style={{ gridColumn: "span 2" }}>
            <span>API Credential</span>
            <Select
              value={agent.ttsCredentialId || ""}
              onChange={(event) => onAgentChange({ ttsCredentialId: event.target.value })}
            >
              <option value="">Use default / env fallback</option>
              {ttsCredentials.map((cred) => (
                <option key={cred.id} value={cred.id}>
                  {cred.name} {cred.isDefault ? "(default)" : ""}
                </option>
              ))}
            </Select>
            {ttsCredentials.length === 0 && (
              <small style={{ color: "#94a3b8" }}>
                No {normalizedTts} credentials added yet. Add them in Settings → AI Services.
              </small>
            )}
          </label>

          {/* ElevenLabs-specific voice controls — hidden for Cartesia */}
          {!isCartesiaTts && (
            <>
              <div className="field">
                <span>Similarity Boost</span>
                <div className="slider-row">
                  <Slider
                    value={agent.ttsSimilarityBoost}
                    min={0}
                    max={1}
                    step={0.05}
                    onChange={(value) => onAgentChange({ ttsSimilarityBoost: Number(value.toFixed(2)) })}
                    ariaLabel="TTS similarity boost"
                  />
                  <Input
                    value={agent.ttsSimilarityBoost}
                    onChange={(event) =>
                      onAgentChange({
                        ttsSimilarityBoost: Number.parseFloat(event.target.value || "0")
                      })
                    }
                  />
                </div>
              </div>
              <div className="field">
                <span>Stability</span>
                <div className="slider-row">
                  <Slider
                    value={agent.ttsStability}
                    min={0}
                    max={1}
                    step={0.05}
                    onChange={(value) => onAgentChange({ ttsStability: Number(value.toFixed(2)) })}
                    ariaLabel="TTS stability"
                  />
                  <Input
                    value={agent.ttsStability}
                    onChange={(event) =>
                      onAgentChange({
                        ttsStability: Number.parseFloat(event.target.value || "0")
                      })
                    }
                  />
                </div>
              </div>
              <div className="field">
                <span>Style Exaggeration</span>
                <div className="slider-row">
                  <Slider
                    value={agent.ttsStyleExaggeration}
                    min={0}
                    max={1}
                    step={0.05}
                    onChange={(value) => onAgentChange({ ttsStyleExaggeration: Number(value.toFixed(2)) })}
                    ariaLabel="TTS style exaggeration"
                  />
                  <Input
                    value={agent.ttsStyleExaggeration}
                    onChange={(event) =>
                      onAgentChange({
                        ttsStyleExaggeration: Number.parseFloat(event.target.value || "0")
                      })
                    }
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
