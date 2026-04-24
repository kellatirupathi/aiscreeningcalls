import { useState } from "react";
import { Plus, Trash2, Star, Save, X, Edit2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import {
  useTelephonyCredentials,
  useCreateTelephonyCredential,
  useUpdateTelephonyCredential,
  useDeleteTelephonyCredential,
  useSetDefaultTelephonyCredential,
  type TelephonyProviderId,
  type TelephonyCredential
} from "@/hooks/useTelephonyCredentials";

const PROVIDERS: { id: TelephonyProviderId; label: string; description: string }[] = [
  { id: "plivo", label: "Plivo", description: "Add one or more Plivo accounts. Each account has its own phone number." },
  { id: "exotel", label: "Exotel", description: "Add one or more Exotel accounts. Each account has its own phone number." }
];

interface FormData {
  provider: TelephonyProviderId;
  name: string;
  phoneNumber: string;
  authId: string;
  authToken: string;
  accountSid: string;
  apiKey: string;
  apiToken: string;
  subdomain: string;
  appId: string;
  isDefault: boolean;
}

const EMPTY_FORM: FormData = {
  provider: "plivo",
  name: "",
  phoneNumber: "",
  authId: "",
  authToken: "",
  accountSid: "",
  apiKey: "",
  apiToken: "",
  subdomain: "api",
  appId: "",
  isDefault: false
};

export function TelephonyCredentialsManager() {
  const { data: credentials = [], isLoading } = useTelephonyCredentials();
  const createMutation = useCreateTelephonyCredential();
  const deleteMutation = useDeleteTelephonyCredential();
  const setDefaultMutation = useSetDefaultTelephonyCredential();

  const [editingForm, setEditingForm] = useState<FormData | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const updateMutation = useUpdateTelephonyCredential(editingId ?? "");

  function startNewCredential(provider: TelephonyProviderId) {
    setEditingForm({ ...EMPTY_FORM, provider });
    setEditingId(null);
  }

  function startEdit(credential: TelephonyCredential) {
    setEditingForm({
      provider: credential.provider,
      name: credential.name,
      phoneNumber: credential.phoneNumber,
      authId: credential.authId,
      authToken: credential.authToken,
      accountSid: credential.accountSid,
      apiKey: credential.apiKey,
      apiToken: credential.apiToken,
      subdomain: credential.subdomain || "api",
      appId: credential.appId,
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
    if (!editingForm.phoneNumber.trim()) {
      window.alert("Please enter a phone number.");
      return;
    }

    if (editingForm.provider === "plivo") {
      if (!editingId && (!editingForm.authId.trim() || !editingForm.authToken.trim())) {
        window.alert("Auth ID and Auth Token are required.");
        return;
      }
    } else {
      if (!editingId && (!editingForm.accountSid.trim() || !editingForm.apiKey.trim() || !editingForm.apiToken.trim())) {
        window.alert("Account SID, API Key, and API Token are required.");
        return;
      }
    }

    try {
      if (editingId) {
        const payload: Record<string, unknown> = {
          name: editingForm.name,
          phoneNumber: editingForm.phoneNumber,
          isDefault: editingForm.isDefault
        };
        if (editingForm.provider === "plivo") {
          if (editingForm.authId.trim()) payload.authId = editingForm.authId;
          if (editingForm.authToken.trim()) payload.authToken = editingForm.authToken;
        } else {
          payload.accountSid = editingForm.accountSid;
          payload.apiKey = editingForm.apiKey;
          payload.apiToken = editingForm.apiToken;
          payload.subdomain = editingForm.subdomain;
          payload.appId = editingForm.appId;
        }
        await updateMutation.mutateAsync(payload);
      } else {
        await createMutation.mutateAsync({
          provider: editingForm.provider,
          name: editingForm.name,
          phoneNumber: editingForm.phoneNumber,
          authId: editingForm.authId || undefined,
          authToken: editingForm.authToken || undefined,
          accountSid: editingForm.accountSid || undefined,
          apiKey: editingForm.apiKey || undefined,
          apiToken: editingForm.apiToken || undefined,
          subdomain: editingForm.subdomain || undefined,
          appId: editingForm.appId || undefined,
          isDefault: editingForm.isDefault
        });
      }
      cancelEdit();
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } } };
      window.alert(error.response?.data?.message || "Failed to save credential.");
    }
  }

  async function handleDelete(credential: TelephonyCredential) {
    if (!window.confirm(`Delete credential "${credential.name}"?`)) return;
    try {
      await deleteMutation.mutateAsync(credential.id);
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } } };
      window.alert(error.response?.data?.message || "Failed to delete credential.");
    }
  }

  async function handleSetDefault(credential: TelephonyCredential) {
    try {
      await setDefaultMutation.mutateAsync(credential.id);
    } catch {
      window.alert("Failed to set as default.");
    }
  }

  if (isLoading) return <div>Loading telephony credentials...</div>;

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
                No {provider.label} accounts added yet. Click "Add New" to create one.
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
                        Number: {cred.phoneNumber || "(not set)"}
                        {cred.provider === "plivo" && cred.authId && ` · Auth ID: ${cred.authId.slice(0, 8)}...`}
                        {cred.provider === "exotel" && cred.accountSid && ` · SID: ${cred.accountSid.slice(0, 12)}...`}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {!cred.isDefault && (
                        <Button onClick={() => handleSetDefault(cred)} style={{ padding: "4px 8px" }} title="Set as default">
                          <Star size={14} />
                        </Button>
                      )}
                      <Button onClick={() => startEdit(cred)} style={{ padding: "4px 8px" }} title="Edit">
                        <Edit2 size={14} />
                      </Button>
                      <Button onClick={() => handleDelete(cred)} style={{ padding: "4px 8px" }} title="Delete">
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
                {editingId ? "Edit" : "Add"} {PROVIDERS.find((p) => p.id === editingForm.provider)?.label} Account
              </div>
              <Button onClick={cancelEdit} style={{ padding: "4px 8px" }}>
                <X size={14} />
              </Button>
            </div>

            <div className="form-grid form-grid--2">
              <label className="field">
                <span>Account Label *</span>
                <Input
                  value={editingForm.name}
                  onChange={(e) => setEditingForm({ ...editingForm, name: e.target.value })}
                  placeholder="e.g., Sales Team, India Support"
                />
              </label>
              <label className="field">
                <span>Phone Number *</span>
                <Input
                  value={editingForm.phoneNumber}
                  onChange={(e) => setEditingForm({ ...editingForm, phoneNumber: e.target.value })}
                  placeholder="+1XXXXXXXXXX"
                />
              </label>

              {editingForm.provider === "plivo" && (
                <>
                  <label className="field">
                    <span>Auth ID {editingId ? "" : "*"}</span>
                    <Input
                      value={editingForm.authId}
                      onChange={(e) => setEditingForm({ ...editingForm, authId: e.target.value })}
                      placeholder={editingId ? "Leave blank to keep existing" : "MAXXXXXXXXXXXXXXX"}
                    />
                  </label>
                  <label className="field">
                    <span>Auth Token {editingId ? "" : "*"}</span>
                    <Input
                      value={editingForm.authToken}
                      onChange={(e) => setEditingForm({ ...editingForm, authToken: e.target.value })}
                      placeholder={editingId ? "Leave blank to keep existing" : ""}
                    />
                  </label>
                </>
              )}

              {editingForm.provider === "exotel" && (
                <>
                  <label className="field">
                    <span>Account SID *</span>
                    <Input
                      value={editingForm.accountSid}
                      onChange={(e) => setEditingForm({ ...editingForm, accountSid: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>API Key *</span>
                    <Input
                      value={editingForm.apiKey}
                      onChange={(e) => setEditingForm({ ...editingForm, apiKey: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>API Token *</span>
                    <Input
                      value={editingForm.apiToken}
                      onChange={(e) => setEditingForm({ ...editingForm, apiToken: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>Subdomain</span>
                    <Input
                      value={editingForm.subdomain}
                      onChange={(e) => setEditingForm({ ...editingForm, subdomain: e.target.value })}
                      placeholder="api"
                    />
                  </label>
                  <label className="field" style={{ gridColumn: "span 2" }}>
                    <span>App ID</span>
                    <Input
                      value={editingForm.appId}
                      onChange={(e) => setEditingForm({ ...editingForm, appId: e.target.value })}
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
