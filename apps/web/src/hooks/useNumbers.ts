import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { NumberRecord } from "@/types";

export function useNumbers() {
  return useQuery({
    queryKey: ["numbers"],
    queryFn: async () => {
      const response = await api.get<NumberRecord[]>("/numbers");
      return response.data;
    }
  });
}

export function useCreateNumber() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { phoneNumber: string; provider: string; label?: string }) => {
      const response = await api.post<NumberRecord>("/numbers", payload);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["numbers"] });
    }
  });
}

export function useUpdateNumber() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ numberId, payload }: { numberId: string; payload: Partial<NumberRecord> }) => {
      const response = await api.patch<NumberRecord>(`/numbers/${numberId}`, payload);
      return response.data;
    },
    onSuccess: (number) => {
      queryClient.invalidateQueries({ queryKey: ["numbers"] });
      queryClient.setQueryData(["numbers", number.id], number);
    }
  });
}

export function useDeleteNumber() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (numberId: string) => {
      await api.delete(`/numbers/${numberId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["numbers"] });
    }
  });
}
