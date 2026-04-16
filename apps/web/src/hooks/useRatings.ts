import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { RatingDetail, RatingsResponse } from "@/types";

export interface RatingsFilters {
  source?: "all" | "test" | "campaign";
  agentId?: string;
  campaignId?: string;
  search?: string;
}

export function useRatings(filters: RatingsFilters = {}) {
  return useQuery({
    queryKey: ["ratings", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.source && filters.source !== "all") params.set("source", filters.source);
      if (filters.agentId) params.set("agentId", filters.agentId);
      if (filters.campaignId) params.set("campaignId", filters.campaignId);
      if (filters.search) params.set("search", filters.search);
      const qs = params.toString();
      const response = await api.get<RatingsResponse>(`/ratings${qs ? `?${qs}` : ""}`);
      return response.data;
    },
    // Auto-refresh every 5 minutes, same cadence as the backend tick
    refetchInterval: 5 * 60 * 1000,
    refetchIntervalInBackground: false
  });
}

export function useRatingsByPhone(phone?: string) {
  return useQuery({
    queryKey: ["ratings", "by-phone", phone],
    enabled: Boolean(phone),
    queryFn: async () => {
      const response = await api.get<{ phone: string; rows: import("@/types").RatingRow[]; total: number }>(
        `/ratings/by-phone/${encodeURIComponent(phone!)}`
      );
      return response.data;
    }
  });
}

export function useRatingDetail(callId?: string) {
  return useQuery({
    queryKey: ["ratings", "detail", callId],
    enabled: Boolean(callId),
    queryFn: async () => {
      const response = await api.get<RatingDetail>(`/ratings/${callId}`);
      return response.data;
    }
  });
}

export function useReloadRatings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const response = await api.post<{ enqueued: number }>("/ratings/reload");
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ratings"] });
    }
  });
}

export function useRegenerateRating() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (callId: string) => {
      const response = await api.post(`/ratings/${callId}/regenerate`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ratings"] });
    }
  });
}
