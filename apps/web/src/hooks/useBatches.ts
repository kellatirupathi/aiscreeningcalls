import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { BatchRecord } from "@/types";

export function useBatches() {
  return useQuery({
    queryKey: ["batches"],
    queryFn: async () => {
      const response = await api.get<BatchRecord[]>("/batches");
      return response.data;
    }
  });
}

export function useBatch(batchId?: string) {
  return useQuery({
    queryKey: ["batches", batchId],
    enabled: Boolean(batchId),
    queryFn: async () => {
      const response = await api.get<BatchRecord>(`/batches/${batchId}`);
      return response.data;
    }
  });
}

export function useCreateBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { name: string; agentId: string; telephonyProvider: string; fromNumber: string }) => {
      const response = await api.post<BatchRecord>("/batches", payload);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["batches"] });
    }
  });
}

export function useStartBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ batchId, file }: { batchId: string; file: File }) => {
      const formData = new FormData();
      formData.append("file", file);
      const response = await api.post(`/batches/${batchId}/start`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      return response.data as { message: string; queued: number };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["batches"] });
    }
  });
}
