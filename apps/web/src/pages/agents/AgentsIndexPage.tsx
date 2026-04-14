import { Navigate } from "react-router-dom";
import { useAgents } from "@/hooks/useAgents";

export default function AgentsIndexPage() {
  const { data: agents, isLoading } = useAgents();

  if (isLoading) {
    return null;
  }

  if (!agents?.length) {
    return <Navigate to="/agents/new" replace />;
  }

  return <Navigate to={`/agents/${agents[0].id}/agent`} replace />;
}
