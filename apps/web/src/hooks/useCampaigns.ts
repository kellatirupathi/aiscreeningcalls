import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { CallRecord, CampaignRecord, StudentRecord } from "@/types";

export function useCampaigns() {
  return useQuery({
    queryKey: ["campaigns"],
    queryFn: async () => {
      const response = await api.get<CampaignRecord[]>("/campaigns");
      return response.data;
    }
  });
}

export function useCampaign(campaignId?: string) {
  return useQuery({
    queryKey: ["campaigns", campaignId],
    enabled: Boolean(campaignId),
    queryFn: async () => {
      const response = await api.get<CampaignRecord>(`/campaigns/${campaignId}`);
      return response.data;
    }
  });
}

export function useCreateCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { name: string; agentId: string; telephonyProvider: string; fromNumber: string }) => {
      const response = await api.post<CampaignRecord>("/campaigns", payload);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    }
  });
}

export function useCampaignCalls(campaignId?: string) {
  return useQuery({
    queryKey: ["campaigns", campaignId, "calls"],
    enabled: Boolean(campaignId),
    queryFn: async () => {
      const response = await api.get<CallRecord[]>(`/campaigns/${campaignId}/calls`);
      return response.data;
    }
  });
}

export function useCampaignStudents(campaignId?: string) {
  return useQuery({
    queryKey: ["campaigns", campaignId, "students"],
    enabled: Boolean(campaignId),
    queryFn: async () => {
      const response = await api.get<StudentRecord[]>(`/campaigns/${campaignId}/students`);
      return response.data;
    }
  });
}
