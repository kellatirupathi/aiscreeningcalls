import { useEffect } from "react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Slider } from "@/components/ui/Slider";
import { Toggle } from "@/components/ui/Toggle";
import { Textarea } from "@/components/ui/Textarea";
import { SectionCard } from "@/components/agent-builder/SectionCard";
import { useTelephonyCredentials, type TelephonyProviderId } from "@/hooks/useTelephonyCredentials";
import type { AgentRecord } from "@/types";

interface CallTabViewProps {
  agent: AgentRecord;
  onAgentChange: (changes: Partial<AgentRecord>) => void;
}

const ambientNoiseOptions = ["None", "Office", "Cafe", "Street"];

export default function CallTabView({ agent, onAgentChange }: CallTabViewProps) {
  const provider = agent.telephonyProvider as TelephonyProviderId;
  const { data: credentials = [] } = useTelephonyCredentials(provider);

  // If the currently selected credential belongs to a different provider,
  // clear it so the UI shows "Use default" until the user picks one.
  useEffect(() => {
    if (!agent.telephonyCredentialId) return;
    const match = credentials.find((c) => c.id === agent.telephonyCredentialId);
    if (!match) {
      onAgentChange({ telephonyCredentialId: "" });
    }
  }, [credentials, agent.telephonyCredentialId, onAgentChange]);

  return (
    <div className="tab-stack">
      <SectionCard title="Call Configuration">
        <div className="form-grid form-grid--2">
          <label className="field">
            <span>Telephony Provider</span>
            <Select
              value={agent.telephonyProvider}
              onChange={(event) =>
                onAgentChange({
                  telephonyProvider: event.target.value as AgentRecord["telephonyProvider"],
                  telephonyCredentialId: ""
                })
              }
            >
              <option value="plivo">Plivo</option>
              <option value="exotel">Exotel</option>
            </Select>
          </label>
          <label className="field">
            <span>Account / Number</span>
            <Select
              value={agent.telephonyCredentialId || ""}
              onChange={(event) => onAgentChange({ telephonyCredentialId: event.target.value })}
            >
              <option value="">Use default {provider} account</option>
              {credentials.map((cred) => (
                <option key={cred.id} value={cred.id}>
                  {cred.name} ({cred.phoneNumber}){cred.isDefault ? " — default" : ""}
                </option>
              ))}
            </Select>
            {credentials.length === 0 && (
              <small style={{ color: "#94a3b8" }}>
                No {provider} accounts added yet. Add them in Settings → Providers.
              </small>
            )}
          </label>
          <label className="field">
            <span>Ambient Noise</span>
            <Select value={agent.ambientNoise} onChange={(event) => onAgentChange({ ambientNoise: event.target.value })}>
              {ambientNoiseOptions.map((ambientNoise) => (
                <option key={ambientNoise} value={ambientNoise}>
                  {ambientNoise}
                </option>
              ))}
            </Select>
          </label>
        </div>
        <div className="toggle-grid">
          <div className="inline-control">
            <span>Noise Cancellation</span>
            <Toggle
              checked={agent.noiseCancellation}
              onChange={(checked) => onAgentChange({ noiseCancellation: checked })}
              ariaLabel="Noise cancellation"
            />
          </div>
          <div className="inline-control">
            <span>Voicemail Detection</span>
            <Toggle
              checked={agent.voicemailDetection}
              onChange={(checked) => onAgentChange({ voicemailDetection: checked })}
              ariaLabel="Voicemail detection"
            />
          </div>
          <div className="inline-control">
            <span>Keypad Input (DTMF)</span>
            <Toggle
              checked={agent.dtmfEnabled}
              onChange={(checked) => onAgentChange({ dtmfEnabled: checked })}
              ariaLabel="Enable DTMF keypad input"
            />
          </div>
          <div className="inline-control">
            <span>Auto Reschedule</span>
            <Toggle
              checked={agent.autoReschedule}
              onChange={(checked) => onAgentChange({ autoReschedule: checked })}
              ariaLabel="Auto reschedule"
            />
          </div>
        </div>
        <div className="helper-text">
          Manage accounts &amp; phone numbers in Settings &gt; Providers.
        </div>
      </SectionCard>

      <SectionCard title="Final Call Message">
        <Textarea
          value={agent.finalCallMessage}
          rows={3}
          onChange={(event) => onAgentChange({ finalCallMessage: event.target.value })}
        />
      </SectionCard>

      <SectionCard title="Call Management">
        <div className="form-grid form-grid--2">
          <div className="field">
            <span>Hangup on User Silence</span>
            <div className="slider-row">
              <Slider
                value={agent.hangupOnSilenceSeconds}
                min={0}
                max={60}
                step={1}
                onChange={(value) => onAgentChange({ hangupOnSilenceSeconds: value })}
                ariaLabel="Hangup on user silence seconds"
              />
              <Input
                value={agent.hangupOnSilenceSeconds}
                onChange={(event) => onAgentChange({ hangupOnSilenceSeconds: Number(event.target.value) || 0 })}
              />
              <Toggle
                checked={agent.hangupOnSilence}
                onChange={(checked) => onAgentChange({ hangupOnSilence: checked })}
                ariaLabel="Enable hangup on silence"
              />
            </div>
          </div>
          <div className="field">
            <span>Total Call Timeout</span>
            <div className="slider-row">
              <Slider
                value={agent.callTimeoutSeconds}
                min={30}
                max={900}
                step={5}
                onChange={(value) => onAgentChange({ callTimeoutSeconds: value })}
                ariaLabel="Call timeout seconds"
              />
              <Input
                value={agent.callTimeoutSeconds}
                onChange={(event) => onAgentChange({ callTimeoutSeconds: Number(event.target.value) || 0 })}
              />
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
