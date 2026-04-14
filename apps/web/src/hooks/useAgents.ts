import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AgentRecord } from "@/types";

export function useAgents() {
  return useQuery({
    queryKey: ["agents"],
    queryFn: async () => {
      const response = await api.get<AgentRecord[]>("/agents");
      return response.data;
    }
  });
}

export function useAgent(agentId?: string) {
  return useQuery({
    queryKey: ["agents", agentId],
    enabled: Boolean(agentId) && agentId !== "new",
    queryFn: async () => {
      const response = await api.get<AgentRecord>(`/agents/${agentId}`);
      return response.data;
    }
  });
}

export function useCreateAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: Partial<AgentRecord>) => {
      const response = await api.post<AgentRecord>("/agents", payload);
      return response.data;
    },
    onSuccess: (agent) => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      queryClient.setQueryData(["agents", agent.id], agent);
    }
  });
}

export function useUpdateAgent(agentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: Partial<AgentRecord>) => {
      const response = await api.patch<AgentRecord>(`/agents/${agentId}`, payload);
      return response.data;
    },
    onSuccess: (agent) => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      queryClient.setQueryData(["agents", agent.id], agent);
    }
  });
}

export function useDeleteAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (agentId: string) => {
      await api.delete(`/agents/${agentId}`);
      return agentId;
    },
    onSuccess: (agentId) => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      queryClient.removeQueries({ queryKey: ["agents", agentId] });
    }
  });
}

export function useAgentTestCall(agentId?: string) {
  return useMutation({
    mutationFn: async (payload: { phoneNumber: string; mode: "call" | "browser" }) => {
      const response = await api.post<{ message: string }>(`/agents/${agentId}/test-call`, payload);
      return response.data;
    }
  });
}
