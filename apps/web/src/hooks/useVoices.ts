import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface VoiceRecord {
  id: string;
  name: string;
  provider: string;
  voiceId: string;
  language: string;
  gender: string | null;
  description: string | null;
  isDefault: boolean;
}

export function useVoices() {
  return useQuery({
    queryKey: ["voices"],
    queryFn: async () => {
      const response = await api.get<VoiceRecord[]>("/voices");
      return response.data;
    }
  });
}

export function useCreateVoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { name: string; voiceId: string; provider?: string; language?: string; gender?: string; description?: string; isDefault?: boolean }) => {
      const response = await api.post<VoiceRecord>("/voices", payload);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["voices"] });
    }
  });
}

export function useDeleteVoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/voices/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["voices"] });
    }
  });
}
