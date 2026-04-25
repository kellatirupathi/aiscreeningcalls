import { useState } from "react";
import { Plus, Trash2, Star, Save, X, Edit2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import {
  useAiCredentials,
  useCreateAiCredential,
  useUpdateAiCredential,
  useDeleteAiCredential,
  useSetDefaultAiCredential,
  type AiProvider,
  type AiCredential
} from "@/hooks/useAiCredentials";

const PROVIDERS: { id: AiProvider; label: string; description: string }[] = [
  { id: "openai", label: "OpenAI", description: "LLM for agent responses (GPT-4o-mini, GPT-4o, etc.)" },
  { id: "groq", label: "Groq", description: "Low-latency LLM (llama-3.1-8b-instant, llama-3.3-70b-versatile, etc.)" },
  { id: "cartesia", label: "Cartesia", description: "STT (ink-whisper) + TTS (sonic-2)" },
  { id: "elevenlabs", label: "ElevenLabs", description: "TTS with premium voices" },
  { id: "deepgram", label: "Deepgram", description: "STT (nova-3, nova-2)" },
  { id: "gemini", label: "Google Gemini", description: "LLM (Gemini 3.1 Flash Lite, 3.1 Pro, 2.5 Flash, etc.) + native speech-to-speech engine" },
  { id: "sarvam", label: "Sarvam", description: "TTS optimized for Indian languages (bulbul:v2, bulbul:v3)" }
];

interface FormData {
  provider: AiProvider;
  name: string;
  apiKey: string;
  defaultModel: string;
  defaultVoiceId: string;
  sttModel: string;
  ttsModel: string;
  defaultVoice: string;
  modelId: string;
  isDefault: boolean;
}

const EMPTY_FORM: FormData = {
  provider: "openai",
  name: "",
  apiKey: "",
  defaultModel: "",
  defaultVoiceId: "",
  sttModel: "",
  ttsModel: "",
  defaultVoice: "",
  modelId: "",
  isDefault: false
};

export function AiCredentialsManager() {
  const { data: credentials = [], isLoading } = useAiCredentials();
  const createMutation = useCreateAiCredential();
  const deleteMutation = useDeleteAiCredential();
  const setDefaultMutation = useSetDefaultAiCredential();

  const [editingForm, setEditingForm] = useState<FormData | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const updateMutation = useUpdateAiCredential(editingId ?? "");

  function startNewCredential(provider: AiProvider) {
    setEditingForm({ ...EMPTY_FORM, provider });
    setEditingId(null);
  }

  function startEdit(credential: AiCredential) {
    setEditingForm({
      provider: credential.provider,
      name: credential.name,
      apiKey: credential.apiKey,
      defaultModel: credential.defaultModel,
      defaultVoiceId: credential.defaultVoiceId,
      sttModel: credential.sttModel,
      ttsModel: credential.ttsModel,
      defaultVoice: credential.defaultVoice,
      modelId: credential.modelId,
      isDefault: credential.isDefault
    });
    setEditingId(credential.id);
  }

  function cancelEdit() {
    setEditingForm(null);
    setEditingId(null);
  }

  async function handleSave() {
    if (!editingForm) return;
    if (!editingForm.name.trim()) {
      window.alert("Please enter a name.");
      return;
    }
    if (!editingId && !editingForm.apiKey.trim()) {
      window.alert("Please enter an API key.");
      return;
    }

    try {
      if (editingId) {
        const payload: Record<string, unknown> = {
          name: editingForm.name,
          defaultModel: editingForm.defaultModel,
          defaultVoiceId: editingForm.defaultVoiceId,
          sttModel: editingForm.sttModel,
          ttsModel: editingForm.ttsModel,
          defaultVoice: editingForm.defaultVoice,
          modelId: editingForm.modelId,
          isDefault: editingForm.isDefault
        };
        if (editingForm.apiKey.trim()) payload.apiKey = editingForm.apiKey;
        await updateMutation.mutateAsync(payload);
      } else {
        await createMutation.mutateAsync({
          provider: editingForm.provider,
          name: editingForm.name,
          apiKey: editingForm.apiKey,
          defaultModel: editingForm.defaultModel || undefined,
          defaultVoiceId: editingForm.defaultVoiceId || undefined,
          sttModel: editingForm.sttModel || undefined,
          ttsModel: editingForm.ttsModel || undefined,
          defaultVoice: editingForm.defaultVoice || undefined,
          modelId: editingForm.modelId || undefined,
          isDefault: editingForm.isDefault
        });
      }
      cancelEdit();
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } } };
      window.alert(error.response?.data?.message || "Failed to save credential.");
    }
  }

  async function handleDelete(credential: AiCredential) {
    if (!window.confirm(`Delete credential "${credential.name}"?`)) return;
    try {
      await deleteMutation.mutateAsync(credential.id);
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } } };
      window.alert(error.response?.data?.message || "Failed to delete credential.");
    }
  }

  async function handleSetDefault(credential: AiCredential) {
    try {
      await setDefaultMutation.mutateAsync(credential.id);
    } catch (err) {
      window.alert("Failed to set as default.");
    }
  }

  if (isLoading) return <div>Loading credentials...</div>;

  return (
    <div className="tab-stack">
      {PROVIDERS.map((provider) => {
        const providerCreds = credentials.filter((c) => c.provider === provider.id);
        return (
          <Card key={provider.id} className="form-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <div className="section-title" style={{ marginBottom: 2 }}>{provider.label}</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>{provider.description}</div>
              </div>
              <Button variant="primary" onClick={() => startNewCredential(provider.id)} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Plus size={14} />
                <span>Add New</span>
              </Button>
            </div>

            {providerCreds.length === 0 ? (
              <div style={{ padding: "20px", textAlign: "center", color: "#94a3b8", fontSize: 14 }}>
                No {provider.label} credentials added yet. Click "Add New" to create one.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {providerCreds.map((cred) => (
                  <div
                    key={cred.id}
                    style={{
                      padding: 12,
                      border: "1px solid #e2e8f0",
                      borderRadius: 8,
                      background: cred.isDefault ? "#f0f9ff" : "#f8fafc",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center"
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <strong>{cred.name}</strong>
                        {cred.isDefault && (
                          <span style={{ fontSize: 11, background: "#0ea5e9", color: "white", padding: "2px 8px", borderRadius: 10 }}>
                            DEFAULT
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                        API Key: {cred.apiKey || "(not set)"}
                        {cred.defaultModel && ` · Model: ${cred.defaultModel}`}
                        {cred.defaultVoiceId && ` · Voice: ${cred.defaultVoiceId}`}
                        {cred.sttModel && ` · STT: ${cred.sttModel}`}
                        {cred.ttsModel && ` · TTS: ${cred.ttsModel}`}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {!cred.isDefault && (
                        <Button onClick={() => handleSetDefault(cred)} style={{ padding: "4px 8px" }}>
                          <Star size={14} />
                        </Button>
                      )}
                      <Button onClick={() => startEdit(cred)} style={{ padding: "4px 8px" }}>
                        <Edit2 size={14} />
                      </Button>
                      <Button onClick={() => handleDelete(cred)} style={{ padding: "4px 8px" }}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        );
      })}

      {/* Edit/Create modal */}
      {editingForm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000
          }}
          onClick={cancelEdit}
        >
          <Card
            className="form-card"
            style={{ maxWidth: 600, width: "90%", maxHeight: "85vh", overflow: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div className="section-title" style={{ marginBottom: 0 }}>
                {editingId ? "Edit" : "Add"} {PROVIDERS.find((p) => p.id === editingForm.provider)?.label} Credential
              </div>
              <Button onClick={cancelEdit} style={{ padding: "4px 8px" }}>
                <X size={14} />
              </Button>
            </div>

            <div className="form-grid form-grid--2">
              <label className="field">
                <span>Name *</span>
                <Input
                  value={editingForm.name}
                  onChange={(e) => setEditingForm({ ...editingForm, name: e.target.value })}
                  placeholder="e.g., Production Key, Client A"
                />
              </label>
              <label className="field">
                <span>API Key *</span>
                <Input
                  value={editingForm.apiKey}
                  onChange={(e) => setEditingForm({ ...editingForm, apiKey: e.target.value })}
                  placeholder="sk-..."
                />
              </label>

              {(editingForm.provider === "openai" || editingForm.provider === "groq" || editingForm.provider === "deepgram") && (
                <label className="field" style={{ gridColumn: "span 2" }}>
                  <span>Default Model</span>
                  <Input
                    value={editingForm.defaultModel}
                    onChange={(e) => setEditingForm({ ...editingForm, defaultModel: e.target.value })}
                    placeholder={
                      editingForm.provider === "openai"
                        ? "gpt-4o-mini"
                        : editingForm.provider === "groq"
                        ? "llama-3.1-8b-instant"
                        : "nova-3"
                    }
                  />
                </label>
              )}

              {editingForm.provider === "cartesia" && (
                <>
                  <label className="field">
                    <span>Default Voice ID</span>
                    <Input
                      value={editingForm.defaultVoiceId}
                      onChange={(e) => setEditingForm({ ...editingForm, defaultVoiceId: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>STT Model</span>
                    <Input
                      value={editingForm.sttModel}
                      onChange={(e) => setEditingForm({ ...editingForm, sttModel: e.target.value })}
                      placeholder="ink-whisper"
                    />
                  </label>
                  <label className="field">
                    <span>TTS Model</span>
                    <Input
                      value={editingForm.ttsModel}
                      onChange={(e) => setEditingForm({ ...editingForm, ttsModel: e.target.value })}
                      placeholder="sonic-2"
                    />
                  </label>
                </>
              )}

              {editingForm.provider === "elevenlabs" && (
                <>
                  <label className="field">
                    <span>Default Voice ID</span>
                    <Input
                      value={editingForm.defaultVoiceId}
                      onChange={(e) => setEditingForm({ ...editingForm, defaultVoiceId: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>Model ID</span>
                    <Input
                      value={editingForm.modelId}
                      onChange={(e) => setEditingForm({ ...editingForm, modelId: e.target.value })}
                      placeholder="eleven_turbo_v2_5"
                    />
                  </label>
                </>
              )}

              {editingForm.provider === "sarvam" && (
                <>
                  <label className="field">
                    <span>Default Speaker</span>
                    <Input
                      value={editingForm.defaultVoiceId}
                      onChange={(e) => setEditingForm({ ...editingForm, defaultVoiceId: e.target.value })}
                      placeholder="anushka"
                    />
                  </label>
                  <label className="field">
                    <span>TTS Model</span>
                    <Input
                      value={editingForm.ttsModel}
                      onChange={(e) => setEditingForm({ ...editingForm, ttsModel: e.target.value })}
                      placeholder="bulbul:v2"
                    />
                  </label>
                </>
              )}

              {editingForm.provider === "gemini" && (
                <>
                  <label className="field">
                    <span>Default Model</span>
                    <Input
                      value={editingForm.defaultModel}
                      onChange={(e) => setEditingForm({ ...editingForm, defaultModel: e.target.value })}
                      placeholder="gemini-2.0-flash-live-001"
                    />
                  </label>
                  <label className="field">
                    <span>Default Voice</span>
                    <Input
                      value={editingForm.defaultVoice}
                      onChange={(e) => setEditingForm({ ...editingForm, defaultVoice: e.target.value })}
                      placeholder="Kore"
                    />
                  </label>
                </>
              )}

              <label className="field" style={{ gridColumn: "span 2", display: "flex", flexDirection: "row", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={editingForm.isDefault}
                  onChange={(e) => setEditingForm({ ...editingForm, isDefault: e.target.checked })}
                />
                <span>Set as default for {editingForm.provider}</span>
              </label>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "flex-end" }}>
              <Button onClick={cancelEdit}>Cancel</Button>
              <Button
                variant="primary"
                onClick={handleSave}
                disabled={createMutation.isPending || updateMutation.isPending}
                style={{ display: "flex", alignItems: "center", gap: 6 }}
              >
                <Save size={14} />
                <span>{createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save"}</span>
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
