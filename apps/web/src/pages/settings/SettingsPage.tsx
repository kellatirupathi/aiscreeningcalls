import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { Plus, Trash2, X, Save, CheckCircle, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import {
  useSettings, useSaveProviders, useSaveOpenAI, useSaveGemini, useSaveCartesia,
  useSaveDeepgram, useSaveElevenLabs, useSaveStorage,
  useTestProviders, useTestAI, useTestStorage
} from "@/hooks/useSettings";
import { useVoices, useCreateVoice, useDeleteVoice } from "@/hooks/useVoices";
import { useCreateTeamMember, useUpdateTeamMember, useDeleteTeamMember } from "@/hooks/useTeam";
import { AiCredentialsManager } from "@/components/settings/AiCredentialsManager";

interface SettingsPageProps {
  tab: "workspace" | "providers" | "ai-services" | "storage" | "team";
}

function SaveBtn({ onClick, isPending, label }: { onClick: () => void; isPending: boolean; label?: string }) {
  return (
    <Button variant="primary" onClick={onClick} disabled={isPending} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12 }}>
      <Save size={14} />
      <span>{isPending ? "Saving..." : label || "Save Changes"}</span>
    </Button>
  );
}

function TestBtn({ onClick, isPending }: { onClick: () => void; isPending: boolean }) {
  return (
    <Button onClick={onClick} disabled={isPending} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12 }}>
      <FlaskConical size={14} />
      <span>{isPending ? "Testing..." : "Test Connection"}</span>
    </Button>
  );
}

export default function SettingsPage({ tab }: SettingsPageProps) {
  const { data, isLoading } = useSettings();
  const { data: currentUser } = useCurrentUser();
  const { data: voices = [] } = useVoices();
  const createVoice = useCreateVoice();
  const deleteVoice = useDeleteVoice();

  // Provider state
  const [plivoAuthId, setPlivoAuthId] = useState("");
  const [plivoAuthToken, setPlivoAuthToken] = useState("");
  const [exotelSid, setExotelSid] = useState("");
  const [exotelKey, setExotelKey] = useState("");
  const [exotelToken, setExotelToken] = useState("");
  const [exotelAppId, setExotelAppId] = useState("");

  // AI state
  const [openaiKey, setOpenaiKey] = useState("");
  const [openaiModel, setOpenaiModel] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [geminiModel, setGeminiModel] = useState("");
  const [geminiVoice, setGeminiVoice] = useState("");
  const [cartesiaKey, setCartesiaKey] = useState("");
  const [cartesiaVoice, setCartesiaVoice] = useState("");
  const [cartesiaStt, setCartesiaStt] = useState("");
  const [cartesiaTts, setCartesiaTts] = useState("");
  const [deepgramKey, setDeepgramKey] = useState("");
  const [deepgramModel, setDeepgramModel] = useState("");
  const [elevenKey, setElevenKey] = useState("");
  const [elevenModel, setElevenModel] = useState("");

  // Storage state
  const [awsKeyId, setAwsKeyId] = useState("");
  const [awsSecret, setAwsSecret] = useState("");
  const [awsRegion, setAwsRegion] = useState("");
  const [awsBucket, setAwsBucket] = useState("");

  // Voice form state
  const [showVoiceForm, setShowVoiceForm] = useState(false);
  const [vName, setVName] = useState("");
  const [vId, setVId] = useState("");
  const [vProvider, setVProvider] = useState("cartesia");
  const [vLang, setVLang] = useState("en");
  const [vGender, setVGender] = useState("");
  const [vDesc, setVDesc] = useState("");
  const [vDefault, setVDefault] = useState(false);

  // Team state
  const [showUserForm, setShowUserForm] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState("recruiter");
  const createTeamMember = useCreateTeamMember();
  const updateTeamMember = useUpdateTeamMember();
  const deleteTeamMember = useDeleteTeamMember();

  function handleAddUser() {
    if (!newUserName.trim() || !newUserEmail.trim() || !newUserPassword.trim()) {
      window.alert("Name, email, and password are required.");
      return;
    }
    createTeamMember.mutate(
      { name: newUserName.trim(), email: newUserEmail.trim(), password: newUserPassword, role: newUserRole },
      {
        onSuccess: () => { setNewUserName(""); setNewUserEmail(""); setNewUserPassword(""); setNewUserRole("recruiter"); setShowUserForm(false); window.alert("User created."); },
        onError: (err) => { const msg = (err as unknown as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to create user."; window.alert(msg); }
      }
    );
  }

  // Mutations
  const saveProviders = useSaveProviders();
  const saveOpenAI = useSaveOpenAI();
  const saveGemini = useSaveGemini();
  const saveCartesia = useSaveCartesia();
  const saveDeepgram = useSaveDeepgram();
  const saveElevenLabs = useSaveElevenLabs();
  const saveStorage = useSaveStorage();
  const testProviders = useTestProviders();
  const testAI = useTestAI();
  const testStorage = useTestStorage();

  // Hydrate from server data
  useEffect(() => {
    if (!data) return;
    setPlivoAuthId(data.providers.plivo.authId);
    setPlivoAuthToken(data.providers.plivo.authToken);
    setExotelSid(data.providers.exotel.accountSid);
    setExotelKey(data.providers.exotel.apiKey);
    setExotelToken(data.providers.exotel.apiToken);
    setExotelAppId(data.providers.exotel.appId);
    setOpenaiKey(data.aiServices.openai.apiKey);
    setOpenaiModel(data.aiServices.openai.defaultModel);
    setGeminiKey(data.aiServices.gemini?.apiKey ?? "");
    setGeminiModel(data.aiServices.gemini?.defaultModel ?? "gemini-2.0-flash-live-001");
    setGeminiVoice(data.aiServices.gemini?.defaultVoice ?? "Kore");
    setCartesiaKey(data.aiServices.cartesia?.apiKey ?? "");
    setCartesiaVoice(data.aiServices.cartesia?.defaultVoiceId ?? "");
    setCartesiaStt(data.aiServices.cartesia?.sttModel ?? "ink-whisper");
    setCartesiaTts(data.aiServices.cartesia?.ttsModel ?? "sonic-2");
    setDeepgramKey(data.aiServices.deepgram.apiKey);
    setDeepgramModel(data.aiServices.deepgram.defaultModel);
    setElevenKey(data.aiServices.elevenlabs.apiKey);
    setElevenModel(data.aiServices.elevenlabs.defaultModel);
    setAwsKeyId(data.storage.accessKeyId);
    setAwsSecret(data.storage.secretAccessKey);
    setAwsRegion(data.storage.region);
    setAwsBucket(data.storage.bucketName);
  }, [data]);

  function handleTest(mutation: typeof testProviders) {
    mutation.mutate(undefined, {
      onSuccess: (r) => window.alert(r.message),
      onError: () => window.alert("Test failed.")
    });
  }

  function handleAddVoice() {
    if (!vName.trim() || !vId.trim()) { window.alert("Name and Voice ID required."); return; }
    createVoice.mutate(
      { name: vName.trim(), voiceId: vId.trim(), provider: vProvider, language: vLang, gender: vGender || undefined, description: vDesc || undefined, isDefault: vDefault },
      { onSuccess: () => { setVName(""); setVId(""); setVGender(""); setVDesc(""); setVDefault(false); setShowVoiceForm(false); } }
    );
  }

  if (isLoading) {
    return (
      <div className="page-stack">
        <PageHeader title="Settings" subtitle="Configure provider credentials, AI services, and workspace access" />
        <Card className="form-card">Loading settings...</Card>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageHeader title="Settings" subtitle="Configure provider credentials, AI services, and workspace access" />

      <div className="subnav-tabs">
        <NavLink to="/settings/workspace" className={({ isActive }) => (isActive ? "subnav-tabs__item subnav-tabs__item--active" : "subnav-tabs__item")}>Workspace</NavLink>
        <NavLink to="/settings/providers" className={({ isActive }) => (isActive ? "subnav-tabs__item subnav-tabs__item--active" : "subnav-tabs__item")}>Providers</NavLink>
        <NavLink to="/settings/ai-services" className={({ isActive }) => (isActive ? "subnav-tabs__item subnav-tabs__item--active" : "subnav-tabs__item")}>AI Services</NavLink>
        <NavLink to="/settings/storage" className={({ isActive }) => (isActive ? "subnav-tabs__item subnav-tabs__item--active" : "subnav-tabs__item")}>Storage</NavLink>
        <NavLink to="/settings/team" className={({ isActive }) => (isActive ? "subnav-tabs__item subnav-tabs__item--active" : "subnav-tabs__item")}>Users & Roles</NavLink>
      </div>

      {/* ─── Workspace ─────────────────────────────────────────────── */}
      {tab === "workspace" ? (
        <div className="tab-stack">
          <Card className="form-card">
            <div className="section-title">Workspace Account</div>
            <div className="form-grid form-grid--2">
              <label className="field"><span>Workspace Name</span><Input value={currentUser?.organization?.name ?? ""} readOnly /></label>
              <label className="field"><span>Workspace Slug</span><Input value={currentUser?.organization?.slug ?? ""} readOnly /></label>
              <label className="field"><span>Primary Admin</span><Input value={currentUser?.name ?? ""} readOnly /></label>
              <label className="field"><span>Role</span><Input value={currentUser?.role ?? ""} readOnly /></label>
            </div>
          </Card>
          <Card className="form-card">
            <div className="section-title">Access Model</div>
            <div className="data-table data-table--workspace">
              <div className="data-table__head data-table__head--workspace"><span>Role</span><span>Scope</span><span>Expected Access</span></div>
              <div className="data-table__row data-table__row--workspace"><span>Admin</span><span>Workspace</span><span>Full platform controls</span></div>
              <div className="data-table__row data-table__row--workspace"><span>Manager</span><span>Operational</span><span>Campaigns, agents, calls, batches</span></div>
              <div className="data-table__row data-table__row--workspace"><span>Recruiter</span><span>Execution</span><span>Calls, campaigns, candidates</span></div>
              <div className="data-table__row data-table__row--workspace"><span>Viewer</span><span>Read only</span><span>Reporting, history, monitoring</span></div>
            </div>
          </Card>
        </div>
      ) : null}

      {/* ─── Providers ─────────────────────────────────────────────── */}
      {tab === "providers" ? (
        <div className="tab-stack">
          <Card className="form-card">
            <div className="section-title">Plivo</div>
            <div className="form-grid form-grid--2">
              <label className="field"><span>Auth ID</span><Input value={plivoAuthId} onChange={(e) => setPlivoAuthId(e.target.value)} /></label>
              <label className="field"><span>Auth Token</span><Input value={plivoAuthToken} onChange={(e) => setPlivoAuthToken(e.target.value)} /></label>
            </div>
          </Card>
          <Card className="form-card">
            <div className="section-title">Exotel</div>
            <div className="form-grid form-grid--2">
              <label className="field"><span>Account SID</span><Input value={exotelSid} onChange={(e) => setExotelSid(e.target.value)} /></label>
              <label className="field"><span>API Key</span><Input value={exotelKey} onChange={(e) => setExotelKey(e.target.value)} /></label>
              <label className="field"><span>API Token</span><Input value={exotelToken} onChange={(e) => setExotelToken(e.target.value)} /></label>
              <label className="field"><span>App ID</span><Input value={exotelAppId} onChange={(e) => setExotelAppId(e.target.value)} /></label>
            </div>
          </Card>
          <div style={{ display: "flex", gap: 10 }}>
            <SaveBtn onClick={() => saveProviders.mutate({ plivo: { authId: plivoAuthId, authToken: plivoAuthToken }, exotel: { accountSid: exotelSid, apiKey: exotelKey, apiToken: exotelToken, appId: exotelAppId } }, { onSuccess: () => window.alert("Provider settings saved.") })} isPending={saveProviders.isPending} />
            <TestBtn onClick={() => handleTest(testProviders)} isPending={testProviders.isPending} />
          </div>
        </div>
      ) : null}

      {/* ─── AI Services ───────────────────────────────────────────── */}
      {tab === "ai-services" ? (
        <div className="tab-stack">
          <AiCredentialsManager />

          {/* Voice Library */}
          <Card className="form-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div className="section-title" style={{ marginBottom: 0 }}>Voice Library</div>
              <Button variant="primary" onClick={() => setShowVoiceForm(!showVoiceForm)}>
                {showVoiceForm ? <><X size={14} /> Cancel</> : <><Plus size={14} /> Add Voice</>}
              </Button>
            </div>

            {showVoiceForm && (
              <div style={{ padding: 16, borderRadius: 12, background: "var(--slate-soft)", marginBottom: 16 }}>
                <div className="form-grid form-grid--2">
                  <label className="field"><span>Voice Name *</span><Input placeholder="e.g. Sarah English" value={vName} onChange={(e) => setVName(e.target.value)} /></label>
                  <label className="field"><span>Voice ID (UUID) *</span><Input placeholder="faf0731e-dfb9-..." value={vId} onChange={(e) => setVId(e.target.value)} /></label>
                  <label className="field"><span>Provider</span>
                    <Select value={vProvider} onChange={(e) => setVProvider(e.target.value)}>
                      <option value="cartesia">Cartesia</option>
                      <option value="elevenlabs">ElevenLabs</option>
                    </Select>
                  </label>
                  <label className="field"><span>Language</span>
                    <Select value={vLang} onChange={(e) => setVLang(e.target.value)}>
                      <option value="en">English</option><option value="hi">Hindi</option><option value="te">Telugu</option><option value="ta">Tamil</option><option value="kn">Kannada</option><option value="ml">Malayalam</option>
                    </Select>
                  </label>
                  <label className="field"><span>Gender</span>
                    <Select value={vGender} onChange={(e) => setVGender(e.target.value)}>
                      <option value="">Not specified</option><option value="female">Female</option><option value="male">Male</option>
                    </Select>
                  </label>
                  <label className="field"><span>Description</span><Input placeholder="e.g. Warm, professional" value={vDesc} onChange={(e) => setVDesc(e.target.value)} /></label>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                    <input type="checkbox" checked={vDefault} onChange={(e) => setVDefault(e.target.checked)} /> Set as default
                  </label>
                  <Button variant="primary" onClick={handleAddVoice} disabled={createVoice.isPending}>
                    {createVoice.isPending ? "Adding..." : "Add Voice"}
                  </Button>
                </div>
              </div>
            )}

            {voices.length === 0 ? (
              <div style={{ textAlign: "center", padding: "24px 0", color: "var(--text-muted)", fontSize: 13 }}>No voices yet. Add voices for your agents.</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {voices.map((v) => (
                  <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 10, border: "1px solid var(--card-border)", background: v.isDefault ? "var(--blue-soft)" : "white" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <strong style={{ fontSize: 14 }}>{v.name}</strong>
                        {v.isDefault && <StatusBadge tone="info">Default</StatusBadge>}
                        {v.gender && <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "capitalize" }}>{v.gender}</span>}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2, display: "flex", gap: 12 }}>
                        <span>{v.provider}</span><span>Lang: {v.language}</span><span style={{ fontFamily: "monospace", fontSize: 11 }}>{v.voiceId.slice(0, 16)}...</span>
                      </div>
                      {v.description && <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>{v.description}</div>}
                    </div>
                    <Button onClick={() => { if (window.confirm(`Delete "${v.name}"?`)) deleteVoice.mutate(v.id); }}><Trash2 size={13} /></Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      ) : null}

      {/* ─── Storage ───────────────────────────────────────────────── */}
      {tab === "storage" ? (
        <div className="tab-stack">
          <Card className="form-card">
            <div className="section-title">AWS S3</div>
            <div className="form-grid form-grid--2">
              <label className="field"><span>Access Key ID</span><Input value={awsKeyId} onChange={(e) => setAwsKeyId(e.target.value)} /></label>
              <label className="field"><span>Secret Access Key</span><Input value={awsSecret} onChange={(e) => setAwsSecret(e.target.value)} /></label>
              <label className="field"><span>Region</span><Input value={awsRegion} onChange={(e) => setAwsRegion(e.target.value)} /></label>
              <label className="field"><span>Bucket Name</span><Input value={awsBucket} onChange={(e) => setAwsBucket(e.target.value)} /></label>
            </div>
          </Card>
          <div style={{ display: "flex", gap: 10 }}>
            <SaveBtn onClick={() => saveStorage.mutate({ accessKeyId: awsKeyId, secretAccessKey: awsSecret, region: awsRegion, bucketName: awsBucket }, { onSuccess: () => window.alert("Storage settings saved.") })} isPending={saveStorage.isPending} />
            <TestBtn onClick={() => handleTest(testStorage)} isPending={testStorage.isPending} />
          </div>
        </div>
      ) : null}

      {/* ─── Team ──────────────────────────────────────────────────── */}
      {tab === "team" ? (
        <div className="tab-stack">
          <Card className="form-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div className="section-title" style={{ marginBottom: 0 }}>Users & Roles</div>
              <Button variant="primary" onClick={() => setShowUserForm(!showUserForm)}>
                {showUserForm ? <><X size={14} /> Cancel</> : <><Plus size={14} /> Add User</>}
              </Button>
            </div>

            {showUserForm && (
              <div style={{ padding: 16, borderRadius: 12, background: "var(--slate-soft)", marginBottom: 16 }}>
                <div className="form-grid form-grid--2">
                  <label className="field"><span>Full Name *</span><Input placeholder="John Doe" value={newUserName} onChange={(e) => setNewUserName(e.target.value)} /></label>
                  <label className="field"><span>Email *</span><Input placeholder="john@company.com" type="email" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} /></label>
                  <label className="field"><span>Password *</span><Input placeholder="Min 8 characters" type="password" value={newUserPassword} onChange={(e) => setNewUserPassword(e.target.value)} /></label>
                  <label className="field"><span>Role</span>
                    <Select value={newUserRole} onChange={(e) => setNewUserRole(e.target.value)}>
                      <option value="admin">Admin</option>
                      <option value="manager">Manager</option>
                      <option value="recruiter">Recruiter</option>
                      <option value="viewer">Viewer</option>
                    </Select>
                  </label>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
                  <Button variant="primary" onClick={handleAddUser} disabled={createTeamMember.isPending}>
                    {createTeamMember.isPending ? "Creating..." : "Create User"}
                  </Button>
                </div>
              </div>
            )}

            {data?.team.length ? (
              <div style={{ display: "grid", gap: 8 }}>
                {data.team.map((member) => {
                  const isMe = member.id === currentUser?.id;
                  return (
                    <div key={member.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 10, border: "1px solid var(--card-border)", background: isMe ? "var(--blue-soft)" : "white" }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: isMe ? "var(--blue)" : "var(--slate-soft)", color: isMe ? "white" : "var(--text-secondary)", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                        {member.name.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <strong style={{ fontSize: 14 }}>{member.name}</strong>
                          {isMe && <StatusBadge tone="info">You</StatusBadge>}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 1 }}>{member.email}</div>
                      </div>
                      <Select
                        value={member.role}
                        disabled={isMe}
                        onChange={(e) => updateTeamMember.mutate({ userId: member.id, payload: { role: e.target.value } }, { onSuccess: () => window.alert(`Role updated to ${e.target.value}.`) })}
                        style={{ width: 130, fontSize: 13 }}
                      >
                        <option value="admin">Admin</option>
                        <option value="manager">Manager</option>
                        <option value="recruiter">Recruiter</option>
                        <option value="viewer">Viewer</option>
                      </Select>
                      {!isMe && (
                        <Button onClick={() => { if (window.confirm(`Delete ${member.name}?`)) deleteTeamMember.mutate(member.id, { onSuccess: () => window.alert("User deleted.") }); }} disabled={deleteTeamMember.isPending}>
                          <Trash2 size={13} />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState compact title="No users yet" description="Add team members to collaborate on screening operations." />
            )}
          </Card>
        </div>
      ) : null}
    </div>
  );
}
