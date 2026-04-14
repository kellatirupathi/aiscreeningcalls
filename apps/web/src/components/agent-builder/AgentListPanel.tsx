import { useRef, useState, type ChangeEvent } from "react";
import { Search, Plus, Upload, Bot } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { useAgents } from "@/hooks/useAgents";
import type { AgentRecord } from "@/types";

interface AgentListPanelProps {
  isImporting?: boolean;
  onImport?: (payload: Partial<AgentRecord>) => void;
}

export function AgentListPanel({ isImporting, onImport }: AgentListPanelProps) {
  const location = useLocation();
  const { data: agents = [], isLoading } = useAgents();
  const [searchValue, setSearchValue] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const filteredAgents = agents.filter((agent) =>
    agent.name.toLowerCase().includes(searchValue.trim().toLowerCase())
  );

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const contents = await file.text();
      const parsed = JSON.parse(contents) as Partial<AgentRecord> & { agent?: Partial<AgentRecord> };
      onImport?.(parsed.agent ?? parsed);
    } catch {
      window.alert("Import expects a valid JSON file with agent fields.");
    } finally {
      event.target.value = "";
    }
  }

  return (
    <div className="ab-list">
      <div className="ab-list__header">
        <h2 className="ab-list__title">Agents</h2>
        <span className="ab-list__count">{agents.length}</span>
      </div>

      <div className="ab-list__actions">
        <Button onClick={() => fileInputRef.current?.click()} disabled={isImporting}>
          <Upload size={14} />
          <span>{isImporting ? "..." : "Import"}</span>
        </Button>
        <Link to="/agents/new">
          <Button variant="primary">
            <Plus size={14} />
            <span>New</span>
          </Button>
        </Link>
        <input ref={fileInputRef} type="file" accept=".json,application/json" hidden onChange={handleImport} />
      </div>

      <div className="ab-list__search">
        <Search size={14} className="ab-list__search-icon" />
        <Input
          placeholder="Search agents..."
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
        />
      </div>

      <div className="ab-list__items">
        {isLoading ? <div className="helper-text">Loading...</div> : null}
        {!isLoading && agents.length === 0 ? (
          <EmptyState compact title="No agents yet" description="Create your first agent to start.">
            <Link to="/agents/new"><Button variant="primary">Create Agent</Button></Link>
          </EmptyState>
        ) : null}
        {!isLoading && agents.length > 0 && filteredAgents.length === 0 ? (
          <div className="helper-text">No match found.</div>
        ) : null}
        {filteredAgents.map((agent) => {
          const active = location.pathname.includes(agent.id) || (location.pathname === "/agents" && agent.id === agents[0]?.id);
          return (
            <Link
              key={agent.id}
              to={`/agents/${agent.id}/agent`}
              className={`ab-list__item ${active ? "ab-list__item--active" : ""}`}
            >
              <div className="ab-list__item-icon">
                <Bot size={16} />
              </div>
              <div className="ab-list__item-info">
                <div className="ab-list__item-name">{agent.name}</div>
                <div className="ab-list__item-provider">{agent.telephonyProvider}</div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
