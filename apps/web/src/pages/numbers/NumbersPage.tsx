import { useState } from "react";
import { Plus, Trash2, Phone, Wifi, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useNumbers, useCreateNumber, useDeleteNumber } from "@/hooks/useNumbers";

export default function NumbersPage() {
  const { data: numbers = [], isLoading } = useNumbers();
  const createNumber = useCreateNumber();
  const deleteNumber = useDeleteNumber();

  const [showForm, setShowForm] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [provider, setProvider] = useState("plivo");
  const [label, setLabel] = useState("");

  const activeCount = numbers.filter((n) => n.isActive).length;

  function handleAdd() {
    if (!phoneNumber.trim()) { window.alert("Phone number is required."); return; }
    createNumber.mutate(
      { phoneNumber: phoneNumber.trim(), provider, label: label.trim() || undefined },
      {
        onSuccess: () => { setPhoneNumber(""); setProvider("plivo"); setLabel(""); setShowForm(false); },
        onError: () => { window.alert("Failed to add phone number."); }
      }
    );
  }

  function handleDelete(numberId: string, number: string) {
    if (!window.confirm(`Delete ${number}?`)) return;
    deleteNumber.mutate(numberId);
  }

  return (
    <div className="page-stack">
      <div className="page-header-row page-header-row--toolbar-safe">
        <PageHeader title="Phone Numbers" subtitle="Manage your outbound caller IDs" />
        <Button variant="primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? <><X size={14} /> Cancel</> : <><Plus size={14} /> Add Number</>}
        </Button>
      </div>

      {/* Stats */}
      <div className="ch-stats" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <div className="ch-stat">
          <div className="ch-stat__icon ch-stat__icon--blue"><Phone size={16} /></div>
          <div><div className="ch-stat__value">{numbers.length}</div><div className="ch-stat__label">Total Numbers</div></div>
        </div>
        <div className="ch-stat">
          <div className="ch-stat__icon ch-stat__icon--green"><Wifi size={16} /></div>
          <div><div className="ch-stat__value">{activeCount}</div><div className="ch-stat__label">Active</div></div>
        </div>
        <div className="ch-stat">
          <div className="ch-stat__icon ch-stat__icon--amber"><Phone size={16} /></div>
          <div><div className="ch-stat__value">{numbers.length - activeCount}</div><div className="ch-stat__label">Inactive</div></div>
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <Card className="form-card">
          <div className="form-grid form-grid--3" style={{ alignItems: "end" }}>
            <label className="field">
              <span>Phone Number</span>
              <Input placeholder="+918031149337" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} />
            </label>
            <label className="field">
              <span>Provider</span>
              <Select value={provider} onChange={(e) => setProvider(e.target.value)}>
                <option value="plivo">Plivo</option>
                <option value="exotel">Exotel</option>
              </Select>
            </label>
            <label className="field">
              <span>Label (optional)</span>
              <Input placeholder="e.g. Main Line" value={label} onChange={(e) => setLabel(e.target.value)} />
            </label>
          </div>
          <div className="actions-inline actions-inline--end" style={{ marginTop: 12 }}>
            <Button variant="primary" onClick={handleAdd} disabled={createNumber.isPending}>
              {createNumber.isPending ? "Adding..." : "Add Number"}
            </Button>
          </div>
        </Card>
      )}

      {isLoading ? <Card className="form-card">Loading...</Card> : null}

      {/* Numbers list as cards */}
      {!isLoading && numbers.length === 0 && !showForm ? (
        <Card className="form-card" style={{ textAlign: "center", padding: "48px 20px", color: "var(--text-muted)" }}>
          No phone numbers yet. Click "Add Number" to get started.
        </Card>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
        {numbers.map((number) => (
          <Card key={number.id} className="form-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 17, fontWeight: 700 }}>{number.phoneNumber}</span>
              <StatusBadge tone={number.isActive ? "success" : "neutral"}>{number.isActive ? "Active" : "Inactive"}</StatusBadge>
            </div>
            <div style={{ display: "flex", gap: 16, fontSize: 13, color: "var(--text-muted)" }}>
              <span>Label: {number.label || "—"}</span>
              <span>Provider: <strong style={{ color: "var(--text-secondary)", textTransform: "capitalize" }}>{number.provider}</strong></span>
            </div>
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
              Agent: {number.assignedAgentName || "Not linked"}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button onClick={() => handleDelete(number.id, number.phoneNumber)} disabled={deleteNumber.isPending}>
                <Trash2 size={13} /> Delete
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
