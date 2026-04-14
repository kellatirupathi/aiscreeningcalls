import { Bot, ChartLine, Cog, Languages, Phone, PhoneIncoming, ScrollText } from "lucide-react";
import { NavLink } from "react-router-dom";
import type { AgentTabKey } from "@screening/shared";

const tabs: Array<{ key: AgentTabKey; label: string; icon: typeof ScrollText }> = [
  { key: "agent", label: "Agent", icon: ScrollText },
  { key: "llm", label: "LLM", icon: Cog },
  { key: "audio", label: "Audio", icon: Languages },
  { key: "engine", label: "Engine", icon: Bot },
  { key: "call", label: "Call", icon: Phone },
  { key: "analytics", label: "Analytics", icon: ChartLine },
  { key: "inbound", label: "Inbound", icon: PhoneIncoming }
];

interface AgentBuilderTabsProps {
  agentId: string;
}

export function AgentBuilderTabs({ agentId }: AgentBuilderTabsProps) {
  return (
    <div className="agent-tabs">
      {tabs.map(({ key, label, icon: Icon }) => (
        <NavLink
          key={key}
          to={`/agents/${agentId}/${key}`}
          className={({ isActive }) => `agent-tabs__item ${isActive ? "agent-tabs__item--active" : ""}`}
        >
          <Icon size={17} />
          <span>{label}</span>
        </NavLink>
      ))}
    </div>
  );
}
