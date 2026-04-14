import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { useAgents } from "@/hooks/useAgents";
import { useNumbers } from "@/hooks/useNumbers";
import { useCreateBatch, useStartBatch } from "@/hooks/useBatches";

export default function BatchCreatePage() {
  const navigate = useNavigate();
  const { data: agents = [] } = useAgents();
  const { data: numbers = [] } = useNumbers();
  const createBatch = useCreateBatch();
  const startBatch = useStartBatch();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
  const [telephonyProvider, setTelephonyProvider] = useState("plivo");
  const [fromNumberPhone, setFromNumberPhone] = useState(numbers[0]?.phoneNumber ?? "");
  const [csvFile, setCsvFile] = useState<File | null>(null);

  if (!agentId && agents.length) setAgentId(agents[0].id);
  if (!fromNumberPhone && numbers.length) setFromNumberPhone(numbers[0].phoneNumber);

  const canSubmit = name.trim() && agentId && telephonyProvider && fromNumberPhone;
  const isWorking = createBatch.isPending || startBatch.isPending;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setCsvFile(file);
  }

  function handleCreateDraft() {
    if (!canSubmit) {
      window.alert("Please fill in all required fields.");
      return;
    }

    createBatch.mutate(
      { name: name.trim(), agentId, telephonyProvider, fromNumber: fromNumberPhone },
      {
        onSuccess: (batch) => {
          navigate(`/batches/${batch.id}/overview`);
        },
        onError: () => {
          window.alert("Failed to create batch.");
        }
      }
    );
  }

  function handleLaunch() {
    if (!canSubmit) {
      window.alert("Please fill in all required fields.");
      return;
    }
    if (!csvFile) {
      window.alert("Please upload a CSV file with name and phone columns.");
      return;
    }

    createBatch.mutate(
      { name: name.trim(), agentId, telephonyProvider, fromNumber: fromNumberPhone },
      {
        onSuccess: (batch) => {
          startBatch.mutate(
            { batchId: batch.id, file: csvFile },
            {
              onSuccess: (result) => {
                window.alert(result.message);
                navigate(`/batches/${batch.id}/overview`);
              },
              onError: () => {
                window.alert("Batch created but failed to start. Go to the batch detail page to try again.");
                navigate(`/batches/${batch.id}/overview`);
              }
            }
          );
        },
        onError: () => {
          window.alert("Failed to create batch.");
        }
      }
    );
  }

  return (
    <div className="page-stack">
      <PageHeader title="Create Batch" subtitle="Configure a one-off CSV-driven screening batch" />
      <Card className="form-card">
        {!agents.length || !numbers.length ? (
          <EmptyState
            compact
            title="Setup required"
            description="You need at least one real agent and one real phone number before launching a batch."
          />
        ) : null}
        <div className="form-grid form-grid--2">
          <label className="field">
            <span>Batch Name</span>
            <Input placeholder="Batch name" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span>Select Agent</span>
            <Select value={agentId} onChange={(e) => setAgentId(e.target.value)}>
              {!agents.length ? <option>No agents available</option> : null}
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="field">
            <span>Telephony Provider</span>
            <Select value={telephonyProvider} onChange={(e) => setTelephonyProvider(e.target.value)}>
              <option value="plivo">Plivo</option>
              <option value="exotel">Exotel</option>
            </Select>
          </label>
          <label className="field">
            <span>From Number</span>
            <Select value={fromNumberPhone} onChange={(e) => setFromNumberPhone(e.target.value)}>
              {!numbers.length ? <option>No numbers available</option> : null}
              {numbers.map((number) => (
                <option key={number.id} value={number.phoneNumber}>
                  {number.phoneNumber}
                </option>
              ))}
            </Select>
          </label>
        </div>
        <Card
          className="upload-card"
          style={{ cursor: "pointer", textAlign: "center", padding: "1.5rem" }}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
          {csvFile
            ? `Selected: ${csvFile.name} (${(csvFile.size / 1024).toFixed(1)} KB)`
            : "Click to upload CSV. Expected columns: name, phone, email."}
        </Card>
        <div className="actions-inline actions-inline--end">
          <Button onClick={handleCreateDraft} disabled={isWorking || !canSubmit}>
            Create Draft
          </Button>
          <Button variant="primary" onClick={handleLaunch} disabled={isWorking || !canSubmit}>
            {isWorking ? "Launching..." : "Launch Batch"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
