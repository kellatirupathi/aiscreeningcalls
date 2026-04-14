import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { CallRecord } from "@/types";

export function useCalls() {
  return useQuery({
    queryKey: ["calls"],
    queryFn: async () => {
      const response = await api.get<CallRecord[]>("/calls");
      return response.data;
    }
  });
}

export function useCall(callId?: string) {
  return useQuery({
    queryKey: ["calls", callId],
    enabled: Boolean(callId),
    queryFn: async () => {
      const response = await api.get<CallRecord>(`/calls/${callId}`);
      return response.data;
    }
  });
}
